## Context
Known word status is currently stored per book, which forces users to re-learn words across books in the same language. We need a language-scoped global known list and encounter counting without breaking existing per-book learning or FSRS flows.

## Goals / Non-Goals
- Goals:
  - Language-scoped global known tracking and encounter counts across books.
  - Preserve book-level learning and local book vocabulary entries.
  - Backfill existing known words into global-known records.
  - Keep FSRS learning cards unchanged.
- Non-Goals:
  - UI changes for vocab management.
  - Cross-language known propagation.

## Decisions
- Store global-known records in the existing IndexedDB `globalVocabulary` store using `kind: 'global-known'` and `id: `${language}:${normalizedWord}`.
- Keep FSRS cards as `kind: 'global'` in the same store, and rely on `status` and `kind` to separate behaviors.
- Persist global encounter counts on the global-known record (`encounterCount`, `lastEncounteredAt`), promoting to `status: 'known'` once the count reaches 2.
- Use current book language for lookups and updates; default to `en` if missing.
- Add a feature flag to fall back to book-only known resolution for rollback.

## Risks / Trade-offs
- Mixing `global` and `global-known` records in one store requires careful filtering in review/vocab library flows; enforce `kind` and `status` checks.
- Encounter count updates occur on page turns; mitigate by batching updates in a single transaction and only writing when counts change.

## Migration Plan
1. Bump IndexedDB version and add a migration to backfill `kind`, `encounterCount`, and `lastEncounteredAt` defaults.
2. Migrate existing `kind = 'book'` records with `status = 'known'` into `global-known` records grouped by language.
3. Preserve book-level learning and known records for rollback.
4. Update Supabase schema to allow `kind = 'global-known'` and sync global-known records.

## Open Questions
- Should global encounter counts be synced to Supabase or remain local-only? (Default: sync for consistency across devices.)
- Should `global-known` records allow `status = 'seen'` to represent encounter count = 1, or should a separate kind store pre-known counts?
