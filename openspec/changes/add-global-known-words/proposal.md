# Change: Global Known Words (Language-Scoped)

## Why
Readers currently re-learn the same words across books of the same language because known status is book-specific. Global known words reduce repetition while keeping language isolation.

## What Changes
- Add global-known vocabulary records keyed by language and normalized word.
- Track encounters across books per language and auto-promote to global known after two encounters (excluding clicked words).
- Update effective status resolution priority: book-level learning, global known (language), book-level seen, default new.
- Migrate existing book-level known entries into global-known records while preserving book-level learning.
- Update caches and sync (IndexedDB globalVocabulary store and Supabase vocabulary schema).

## Impact
- Specs: `vocabulary-data`, `word-status`, `multi-language`.
- Code: `js/db.js`, `js/core/global-vocab-cache.js`, `js/views/reader/reader-controller.js`, `js/views/reader/pagination-engine.js`, `js/supabase/vocabulary-repo.js`, `js/supabase/global-vocab-repo.js`, `supabase/schema.sql`.
- Data: new vocabulary kind, IndexedDB migration, global-known data backfill.
