-- Incremental migration for cloud book processing (EPUB → processed manifest + JA tokens)
-- Safe to run on an existing Supabase project (does not drop tables or delete data).

create extension if not exists pgcrypto;

-- --------------------------------------------
-- books: add processing fields
-- --------------------------------------------

alter table public.books
  add column if not exists processed_path text null,
  add column if not exists processing_status text not null default 'ready',
  add column if not exists processing_progress integer not null default 100,
  add column if not exists processing_stage text null,
  add column if not exists processing_error text null,
  add column if not exists processed_at timestamptz null,
  add column if not exists source_deleted_at timestamptz null;

alter table public.books
  drop constraint if exists books_processing_status_check;
alter table public.books
  add constraint books_processing_status_check
    check (processing_status in ('queued', 'processing', 'ready', 'error', 'cancelled'));

create index if not exists books_user_processing_idx
  on public.books (user_id, processing_status, updated_at desc);

-- --------------------------------------------
-- book_processing_jobs: queue table + RLS
-- --------------------------------------------

create table if not exists public.book_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null,
  language text not null default 'en',

  status text not null default 'queued',
  progress integer not null default 0,
  stage text null,
  error text null,

  source_path text not null,
  processed_path text null,

  attempts integer not null default 0,
  locked_at timestamptz null,
  locked_by text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, book_id),
  constraint book_processing_jobs_status_check check (status in ('queued', 'processing', 'done', 'error', 'cancelled'))
);

create index if not exists book_processing_jobs_status_idx
  on public.book_processing_jobs (status, updated_at asc);
create index if not exists book_processing_jobs_user_idx
  on public.book_processing_jobs (user_id, updated_at desc);

alter table public.book_processing_jobs enable row level security;

drop policy if exists "book_processing_jobs_select_own" on public.book_processing_jobs;
create policy "book_processing_jobs_select_own" on public.book_processing_jobs
for select using (auth.uid() = user_id);

drop policy if exists "book_processing_jobs_insert_own" on public.book_processing_jobs;
create policy "book_processing_jobs_insert_own" on public.book_processing_jobs
for insert with check (auth.uid() = user_id);

drop policy if exists "book_processing_jobs_update_own" on public.book_processing_jobs;
create policy "book_processing_jobs_update_own" on public.book_processing_jobs
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_processing_jobs_delete_own" on public.book_processing_jobs;
create policy "book_processing_jobs_delete_own" on public.book_processing_jobs
for delete using (auth.uid() = user_id);

-- --------------------------------------------
-- service-role-only RPC helpers for the worker
-- --------------------------------------------

create or replace function public._require_service_role()
returns void
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
    exception
      when others then
        jwt_role := null;
    end;
  end if;

  if coalesce(jwt_role, '') <> 'service_role' then
    raise exception 'service role required';
  end if;
end;
$$;

create or replace function public.claim_book_processing_job(worker_id text, lock_minutes integer default 15, max_attempts integer default 5)
returns table (
  id uuid,
  user_id uuid,
  book_id text,
  language text,
  source_path text,
  attempts integer
)
language plpgsql
as $$
begin
  perform public._require_service_role();

  return query
  with candidate as (
    select j.id
    from public.book_processing_jobs j
    where j.status = 'queued'
      and j.attempts < max_attempts
      and (j.locked_at is null or j.locked_at < now() - (lock_minutes || ' minutes')::interval)
    order by j.updated_at asc
    for update skip locked
    limit 1
  )
  update public.book_processing_jobs j
  set status = 'processing',
      progress = 0,
      stage = 'claimed',
      error = null,
      locked_at = now(),
      locked_by = worker_id,
      attempts = j.attempts + 1,
      updated_at = now()
  from candidate
  where j.id = candidate.id
  returning j.id, j.user_id, j.book_id, j.language, j.source_path, j.attempts;
end;
$$;

create or replace function public.update_book_processing_job(job_id uuid, new_status text, new_progress integer, new_stage text, new_error text, new_processed_path text)
returns void
language plpgsql
as $$
begin
  perform public._require_service_role();

  update public.book_processing_jobs
  set status = coalesce(new_status, status),
      progress = coalesce(new_progress, progress),
      stage = coalesce(new_stage, stage),
      error = new_error,
      processed_path = coalesce(new_processed_path, processed_path),
      updated_at = now()
  where id = job_id;
end;
$$;

create or replace function public.update_book_processing_fields(target_user_id uuid, target_book_id text, new_status text, new_progress integer, new_stage text, new_error text, new_processed_path text, did_delete_source boolean default false)
returns void
language plpgsql
as $$
begin
  perform public._require_service_role();

  update public.books
  set processing_status = coalesce(new_status, processing_status),
      processing_progress = coalesce(new_progress, processing_progress),
      processing_stage = coalesce(new_stage, processing_stage),
      processing_error = new_error,
      processed_path = coalesce(new_processed_path, processed_path),
      processed_at = case when new_status = 'ready' then now() else processed_at end,
      source_deleted_at = case when did_delete_source then now() else source_deleted_at end,
      updated_at = now()
  where user_id = target_user_id and id = target_book_id;
end;
$$;
