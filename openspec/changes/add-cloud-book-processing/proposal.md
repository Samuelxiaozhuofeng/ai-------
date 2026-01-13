# Change: Add cloud book processing pipeline (EPUB → chapters + JA tokens)

## Why
The current import path parses EPUB and performs Japanese tokenization in the browser, which is slow and unreliable across devices. The goal is a LingQ-like flow: upload once, wait briefly, then read instantly anywhere.

## What Changes
- Add an asynchronous **cloud processing job** after upload to extract chapters via TOC and (for Japanese) precompute Kuromoji tokens with offsets.
- Store **processed artifacts** in Supabase Storage and delete the source EPUB after successful processing.
- Track processing **status/progress/errors** in Supabase so the UI can show progress, allow cancel/retry, and avoid per-chapter lazy tokenization.

## Non-Goals (for this change)
- Full-text search, frequency lists, sentence mining, or translation pipelines.
- Multi-user scaling beyond light personal usage.

## Impact
- Affected specs: `multi-language` (import flow for `ja`), new `book-processing` capability
- Affected systems:
  - Supabase schema (new job table + book processing fields)
  - Frontend import + reader caching logic
  - New worker service (Node.js) using Supabase service role

