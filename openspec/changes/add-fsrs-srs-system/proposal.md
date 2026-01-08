# Change: Add FSRS-based Spaced Repetition System

## Why
Currently, the reader has a basic word status system (new → learning → known) but lacks a structured review mechanism. Users mark words as "learning" but have no way to:
- Review vocabulary using proven spaced repetition principles
- Track memory retention with scientific scheduling
- Practice across all books in a unified review session

This change integrates the **FSRS (Free Spaced Repetition Scheduler)** algorithm to provide an effective vocabulary review system. FSRS is the state-of-the-art open-source spaced repetition algorithm, offering better retention with fewer reviews compared to SM-2 (Anki's default).

## What Changes

### Word Status System Enhancement
- **NEW**: Add `seen` intermediate state between `new` and `known`
- **MODIFIED**: Four-state model: `new` → `seen` → `known` (passive path) OR `new`/`seen` → `learning` → `known` (active path)
- **MODIFIED**: Auto toggle behavior:
  - ON: Clicking a word automatically marks it as `learning`
  - OFF: User must manually mark words as `learning`

### Page Turn Auto-Marking
- **NEW**: Automatic status progression on page turn:
  - `new` words (not clicked) → `seen` on first page turn
  - `seen` words (encountered again, not clicked) → `known` on second page turn
  - `learning` words are not affected by page turns

### FSRS Integration
- **NEW**: FSRS card creation for `learning` words
- **NEW**: FSRS parameters stored per word (stability, difficulty, due date, etc.)
- **NEW**: Cross-book vocabulary merging (same word = one FSRS card)
- **NEW**: Card deletion when word is marked as `known`

### Review Interface
- **NEW**: Global review view accessible from main navigation
- **NEW**: Review queue showing due cards from ALL books
- **NEW**: Card display: word, meaning, usage, contextual meaning (AI-generated)
- **NEW**: Four-rating buttons: Again, Hard, Good, Easy (FSRS standard)
- **NEW**: Review statistics (due today, total learned, etc.)

### Data Model Changes
- **NEW**: FSRS fields in vocabulary items: `stability`, `difficulty`, `due`, `scheduledDays`, `elapsed_days`, `reps`, `lapses`, `state`
- **NEW**: Global vocabulary store (cross-book, keyed by normalized word)
- **MODIFIED**: AI analysis results stored directly in vocabulary item

## Impact

### Affected Specs (New/Modified)
- `word-status` - Four-state model, page-turn logic
- `srs-review` - FSRS integration, review interface
- `vocabulary-data` - Global vocabulary store, FSRS fields

### Affected Code
| Area | Files | Changes |
|------|-------|---------|
| Word Status | `js/word-status.js` | Add `seen` state, update status transitions |
| App Logic | `js/app.js` | Auto toggle behavior, page-turn handlers |
| Database | `js/db.js` | Global vocabulary store, FSRS fields schema |
| **NEW** SRS | `js/srs-service.js` | FSRS algorithm wrapper, scheduling logic |
| **NEW** Review UI | `index.html`, `js/app.js` | Review view, card display, rating buttons |
| Styles | `styles/main.css` | Review interface styling, `seen` state color |

### Migration
- Existing `new` words → remain `new`
- Existing `learning` words → remain `learning`, create FSRS cards with default parameters
- Existing `known` words → remain `known`
- No data loss expected

## Out of Scope
- Review statistics/history charts
- Custom FSRS parameter tuning UI
- Audio pronunciation in review
- Offline-first review (assumes AI context available)
