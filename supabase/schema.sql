-- Supabase SQL Schema for Language Reader
-- Includes: books, progress, vocabulary + RLS + Storage bucket policies
--
-- Assumptions:
-- - Using Supabase Auth (auth.users)
-- - `vocabulary.kind` stores both book-level and global (FSRS) records

-- ============================================
-- Tables
-- ============================================

create table if not exists public.books (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,

  title text not null,
  cover text null,
  language text not null default 'en',
  chapter_count integer null,
  current_chapter integer not null default 0,

  storage_path text not null,
  file_size bigint null,
  file_updated_at timestamptz null,

  added_at timestamptz not null default now(),
  last_read_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, id)
);

create index if not exists books_user_updated_idx on public.books (user_id, updated_at desc);
create index if not exists books_user_last_read_idx on public.books (user_id, last_read_at desc nulls last);
create index if not exists books_user_language_idx on public.books (user_id, language);

create table if not exists public.progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null,

  chapter_id text null,
  page_number integer not null default 0,
  scroll_position integer not null default 0,

  updated_at timestamptz not null default now(),

  primary key (user_id, book_id)
);

create index if not exists progress_user_updated_idx on public.progress (user_id, updated_at desc);

create table if not exists public.vocabulary (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,

  -- 'book' for per-book word status; 'global' for FSRS card state
  kind text not null,
  book_id text null,
  language text null,
  word text null,

  display_word text null,
  status text null,
  context jsonb null,
  analysis jsonb null,
  source_chapter_id text null,

  -- Global (FSRS) fields
  source_books jsonb not null default '[]'::jsonb,
  meaning text null,
  usage text null,
  contextual_meaning text null,
  context_sentence text null,

  due timestamptz null,
  stability double precision null,
  difficulty double precision null,
  elapsed_days double precision null,
  scheduled_days double precision null,
  reps integer null,
  lapses integer null,
  state integer null,
  last_review timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, id),

  constraint vocabulary_kind_check check (kind in ('book', 'global')),
  constraint vocabulary_book_fields_check check (
    (kind = 'book' and book_id is not null and word is not null)
    or
    (kind = 'global' and book_id is null and word is not null)
  )
);

create index if not exists vocabulary_user_kind_updated_idx on public.vocabulary (user_id, kind, updated_at desc);
create index if not exists vocabulary_user_book_idx on public.vocabulary (user_id, kind, book_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table public.books enable row level security;
alter table public.progress enable row level security;
alter table public.vocabulary enable row level security;

drop policy if exists "books_select_own" on public.books;
create policy "books_select_own" on public.books
for select using (auth.uid() = user_id);

drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own" on public.books
for insert with check (auth.uid() = user_id);

drop policy if exists "books_update_own" on public.books;
create policy "books_update_own" on public.books
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own" on public.books
for delete using (auth.uid() = user_id);

drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own" on public.progress
for select using (auth.uid() = user_id);

drop policy if exists "progress_upsert_own" on public.progress;
create policy "progress_upsert_own" on public.progress
for insert with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.progress;
create policy "progress_update_own" on public.progress
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress_delete_own" on public.progress;
create policy "progress_delete_own" on public.progress
for delete using (auth.uid() = user_id);

drop policy if exists "vocabulary_select_own" on public.vocabulary;
create policy "vocabulary_select_own" on public.vocabulary
for select using (auth.uid() = user_id);

drop policy if exists "vocabulary_insert_own" on public.vocabulary;
create policy "vocabulary_insert_own" on public.vocabulary
for insert with check (auth.uid() = user_id);

drop policy if exists "vocabulary_update_own" on public.vocabulary;
create policy "vocabulary_update_own" on public.vocabulary
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vocabulary_delete_own" on public.vocabulary;
create policy "vocabulary_delete_own" on public.vocabulary
for delete using (auth.uid() = user_id);

-- ============================================
-- Storage: Bucket + RLS policies
-- ============================================

-- Create private bucket for EPUB files
insert into storage.buckets (id, name, public)
values ('epubs', 'epubs', false)
on conflict (id) do nothing;

-- RLS policies on storage.objects
-- Users can only access objects under: "<user_id>/..."

drop policy if exists "epubs_read_own" on storage.objects;
create policy "epubs_read_own" on storage.objects
for select
using (
  bucket_id = 'epubs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "epubs_insert_own" on storage.objects;
create policy "epubs_insert_own" on storage.objects
for insert
with check (
  bucket_id = 'epubs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "epubs_update_own" on storage.objects;
create policy "epubs_update_own" on storage.objects
for update
using (
  bucket_id = 'epubs'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'epubs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "epubs_delete_own" on storage.objects;
create policy "epubs_delete_own" on storage.objects
for delete
using (
  bucket_id = 'epubs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

