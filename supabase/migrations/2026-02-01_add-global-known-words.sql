-- Add global-known vocabulary kind + encounter tracking

alter table public.vocabulary
  add column if not exists encounter_count integer null,
  add column if not exists last_encountered_at timestamptz null;

alter table public.vocabulary
  drop constraint if exists vocabulary_kind_check;

alter table public.vocabulary
  add constraint vocabulary_kind_check check (kind in ('book', 'global', 'global-known'));

alter table public.vocabulary
  drop constraint if exists vocabulary_book_fields_check;

alter table public.vocabulary
  add constraint vocabulary_book_fields_check check (
    (kind = 'book' and book_id is not null and word is not null)
    or
    (kind in ('global', 'global-known') and book_id is null and word is not null)
  );

create index if not exists vocabulary_user_kind_language_idx on public.vocabulary (user_id, kind, language);
