# Migrations

## 2026-02-01 Global Known Words (Language-Scoped)
- Added `global-known` vocabulary records keyed by `${language}:${normalizedWord}`.
- Added global encounter counting (`encounterCount`, `lastEncounteredAt`) and Supabase columns `encounter_count`, `last_encountered_at`.
- Backfilled missing language fields to `en` with warning logs.
- Migrated existing book-level `known` entries to global-known records (book-level entries preserved).
- Rollback: set `localStorage.enableGlobalKnownWords = "false"` to fall back to book-only known resolution.

### Dry Run Preview
Use `migrateBookKnownToGlobalKnown({ dryRun: true })` in `js/db.js` to preview migrations without writing.
