# Worker: Cloud Book Processing

This service claims jobs from Supabase (`public.book_processing_jobs`) and produces processed reading artifacts:
- TOC-based chapter extraction (EPUB3 `nav.xhtml`, EPUB2 `toc.ncx`)
- Japanese (ja) Kuromoji tokenization with offsets aligned to frontend canonical text rules
- Upload artifacts to Supabase Storage and delete the source EPUB on success

## Environment

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

Optional:
- `SUPABASE_BUCKET` (default: `epubs`)
- `WORKER_ID` (default: `worker-<pid>`)
- `POLL_INTERVAL_MS` (default: `1500`)
- `MAX_ATTEMPTS` (default: `5`)

## Run locally

```bash
cd worker
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
```

## Notes
- This worker assumes the SQL functions added in `supabase/schema.sql` exist in your Supabase project (`claim_book_processing_job`, `update_book_processing_job`, `update_book_processing_fields`).
- The worker uses the service role key and bypasses RLS for storage and table writes.

