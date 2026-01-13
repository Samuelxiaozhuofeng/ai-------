## 1. Supabase schema
- [ ] Add processing fields to `public.books` (`processing_status`, `processing_progress`, `processing_error`, `processed_path`, timestamps).
- [ ] Add `public.book_processing_jobs` table with RLS (users can see their own jobs).
- [ ] Add SQL functions for job claim/update (for worker), or document service-role access pattern.
- [ ] Update `supabase/schema.sql` to include these changes.

## 2. Worker service (Node.js)
- [ ] Add a `worker/` service that polls/claims jobs and processes EPUBs.
- [ ] Implement EPUB parsing in Node: container.xml → OPF → TOC (nav.xhtml / toc.ncx) → chapters (content + rawHtml).
- [ ] Implement Japanese tokenization in Node via Kuromoji and emit tokens with offsets matching frontend canonicalization + `fnv1a32` `textHash`.
- [ ] Upload processed bundle to Supabase Storage (e.g. `epubs/<user>/<book>/processed/book.json.gz`).
- [ ] Update `books` processing fields and delete the source EPUB in Storage.
- [ ] Implement retry/backoff and mark `error` with message and stack snippet.

## 3. Frontend integration
- [ ] Update import flow: upload → enqueue job → show progress (and block opening until ready).
- [ ] Update bookshelf list UI to show queued/processing/error states; allow cancel/retry.
- [ ] Update `ensureLocalBookCached` to fetch processed bundle when available; fall back to legacy EPUB download+parse for existing books.
- [ ] On download of a processed Japanese book, prefill IndexedDB token cache using existing `saveJapaneseTokensToCache`.

## 4. Local dev + docs
- [ ] Add `worker/README.md` with env vars and run steps.
- [ ] Add/adjust `docker-compose.yml` to run worker locally (optional) alongside existing backend.
- [ ] Manual verification checklist (import ja/en, progress UI, delete source, open on another device).

## 5. Done criteria
- [ ] Uploading a Japanese EPUB shows progress and completes without any in-browser Kuromoji dictionary downloads.
- [ ] After completion, the source EPUB is removed from Storage and the processed bundle remains accessible.
- [ ] Reader opens Japanese books without “tokenizing…” delays (tokens loaded from cache).

