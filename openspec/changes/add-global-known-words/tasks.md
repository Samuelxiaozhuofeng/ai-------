## 1. Schema and Data Model
- [x] 1.1 Update Supabase `vocabulary.kind` constraint to allow `global-known` and add supporting indexes.
- [x] 1.2 Extend IndexedDB `globalVocabulary` records with `kind`, `encounterCount`, and `lastEncounteredAt`; bump DB version and add upgrade migration.
- [x] 1.3 Add local/remote repository helpers for `global-known` CRUD and listing by language.

## 2. Global Encounter Tracking
- [x] 2.1 Implement persistent global encounter counters (language-scoped) with batched page-turn writes.
- [x] 2.2 Update `processPageTurn` to apply global encounter logic and promote to global known at two encounters, skipping clicked words and learning overrides.

## 3. Status Resolution and Rollback
- [x] 3.1 Update `getEffectiveWordStatus` to apply priority order and global-known lookup.
- [x] 3.2 Refresh caches to include global-known entries without affecting FSRS learning flows.
- [x] 3.3 Add a feature flag to fall back to book-only known resolution for rollback.

## 4. Data Migration
- [x] 4.1 Migrate existing book-level known entries into global-known records grouped by language.
- [x] 4.2 Preserve book-level learning entries and retain book-level known records for rollback.

## 5. Documentation and Verification
- [x] 5.1 Update `CHANGELOG.md` (or migration notes) and add inline comments for status priority.
- [x] 5.2 Manual verification: cross-book known propagation, language isolation, encounter counting, click behavior, and performance.
