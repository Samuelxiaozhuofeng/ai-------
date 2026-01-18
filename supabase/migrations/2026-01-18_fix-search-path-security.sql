-- Security fix: set explicit search_path for RPC helpers to prevent mutable search_path vulnerabilities.

create or replace function public._require_service_role()
returns void
language plpgsql
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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

-- Fifth function fix: add explicit search_path for set_updated_at trigger helper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
