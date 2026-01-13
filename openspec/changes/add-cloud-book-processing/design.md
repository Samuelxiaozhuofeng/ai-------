# Design: Cloud book processing pipeline

## Overview
The system introduces a background processing pipeline that converts an uploaded EPUB into a processed bundle suitable for instant reading:
- Chapters are extracted using TOC (`nav.xhtml` preferred; fallback `toc.ncx`), including fragment targets.
- For Japanese books, Kuromoji tokenization runs in the worker and emits token offsets aligned to the frontend’s canonical text rules.
- The processed output is stored in Supabase Storage and the source EPUB is deleted after success.
- The UI polls/subscribes to job state to show progress, enable cancel/retry, and avoid chapter-by-chapter lazy tokenization.

## Storage layout
Bucket: `epubs` (private)

- Source: `epubs/<user_id>/<book_id>/source.epub`
- Processed bundle: `epubs/<user_id>/<book_id>/processed/book.json.gz`
- Optional cover: embedded as data URL in the bundle and `books.cover`

## Data model (Supabase)
`public.books` (existing) gains:
- `processing_status`: `queued|processing|ready|error`
- `processing_progress`: `0..100`
- `processing_error`: short string
- `processed_path`: Storage path for processed bundle
- `processed_at`, `source_deleted_at`: timestamps

`public.book_processing_jobs` (new):
- `id`: uuid
- `user_id`, `book_id`, `language`
- `status`: `queued|processing|done|error|cancelled`
- `progress`, `stage`, `error`
- locking fields for claim: `locked_at`, `locked_by`, `attempts`

Worker authenticates with Supabase **service role** key (server-side only) and claims jobs atomically.

## Processed bundle format (v1)
Top-level:
- `version`: `"1"`
- `bookId`, `title`, `language`, `cover`
- `chapters`: array of `{ id, title, content, rawHtml, textHash?, jaTokens? }`

Canonicalization requirement:
- `content` is paragraph-joined text using `\n\n` separators (mirrors `splitChapterIntoParagraphs` + join).
- `textHash` is `fnv1a32:<hex>` computed over canonicalText.
- `jaTokens` are `{ surface, lemma, reading, pos, posDetail, isWord, start, end }` offsets into canonicalText.

## Job lifecycle
1. Client uploads source EPUB to Storage.
2. Client upserts `books` with `processing_status=queued` and inserts a `book_processing_jobs` row.
3. Worker claims a job, sets `processing`, and periodically updates `progress/stage`.
4. Worker writes processed bundle to Storage, updates `books.processed_path`, marks `ready`, deletes the source file, marks timestamps.
5. UI downloads bundle, caches to IndexedDB; for `ja`, pre-fills tokenization cache.

## Failure + retry
- Worker increments `attempts` and uses simple backoff (e.g. 1m, 5m, 30m) with a max attempts cap (e.g. 5).
- Errors are stored in job row and mirrored to `books.processing_error`.

