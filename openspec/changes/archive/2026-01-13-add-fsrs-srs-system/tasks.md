# Tasks: FSRS-based Spaced Repetition System

## 1. Word Status Enhancement
- [x] 1.1 Add `seen` status to `WORD_STATUSES` in `word-status.js`
- [x] 1.2 Update `statusToClass()` to map `seen` → CSS class
- [x] 1.3 Add CSS class `.word-seen` with appropriate color (light green/teal)
- [x] 1.4 Update vocabulary panel to show `seen` status in filters

## 2. Page Turn Auto-Marking
- [x] 2.1 Add `encounterCount` field to track word encounters per session
- [x] 2.2 Create `getPageWords()` function to extract words from current page
- [x] 2.3 Implement `onPageTurn()` handler with status transition logic:
  - `new` (not clicked) → `seen`
  - `seen` (not clicked, 2nd encounter) → `known`
- [x] 2.4 Track which words were clicked on current page to exclude from auto-marking
- [x] 2.5 Persist status changes to IndexedDB on page turn

## 3. Auto Toggle Repurposing
- [x] 3.1 Rename toggle label from "Auto Add to Anki" to "Auto Add to Study"
- [x] 3.2 Update click handler logic:
  - Auto ON: click word → `learning` + create FSRS card + show analysis
  - Auto OFF: click word → show analysis only
- [x] 3.3 Add "Add to Study" button in word popup for manual mode
- [x] 3.4 Handle `seen` word clicks (→ `learning` regardless of auto toggle)

## 4. Global Vocabulary Store
- [x] 4.1 Create `STORE_GLOBAL_VOCAB` in IndexedDB schema
- [x] 4.2 Define global vocabulary data model with FSRS fields
- [x] 4.3 Implement `getGlobalVocabItem(normalizedWord)` function
- [x] 4.4 Implement `upsertGlobalVocabItem(item)` function
- [x] 4.5 Implement `deleteGlobalVocabItem(normalizedWord)` function
- [x] 4.6 Implement `listDueCards(now)` function for review queue
- [x] 4.7 Link per-book vocabulary to global vocabulary when status changes to `learning`

## 5. FSRS Integration
- [x] 5.1 Add `ts-fsrs` import via ESM CDN (`https://esm.sh/ts-fsrs@4`)
- [x] 5.2 Create `js/srs-service.js` module with:
  - `createFSRSCard(word, aiAnalysis)` - create new card
  - `reviewCard(card, rating)` - process review and get next schedule
  - `getDueCards()` - get cards due for review
  - `getReviewStats()` - count due/new/total cards
- [x] 5.3 Initialize FSRS with default parameters
- [x] 5.4 Test FSRS scheduling with sample cards

## 6. Review Interface UI
- [x] 6.1 Add "Review" button/tab to main navigation (bookshelf header)
- [x] 6.2 Create `reviewView` section in `index.html` with:
  - Header: back button, stats (due/new/total)
  - Card area: word, meaning, usage, context, contextual meaning
  - Rating buttons: Again, Hard, Good, Easy with intervals
- [x] 6.3 Add keyboard shortcuts: 1=Again, 2=Hard, 3=Good, 4=Easy
- [x] 6.4 Add "Finish" / "No cards due" empty state
- [x] 6.5 Style review interface with Apple Books aesthetic

## 7. Review Logic
- [x] 7.1 Add `currentView = 'review'` state handling
- [x] 7.2 Implement `loadReviewSession()` - fetch due cards, shuffle
- [x] 7.3 Implement `showNextCard()` - display current card
- [x] 7.4 Implement `submitRating(rating)` - update card, advance queue
- [x] 7.5 Implement `finishReview()` - return to bookshelf
- [x] 7.6 Show next interval preview under each rating button
- [x] 7.7 Update review stats in header after each rating

## 8. AI Analysis Storage
- [x] 8.1 Store AI analysis (meaning, usage, contextualMeaning) in global vocabulary
- [x] 8.2 Display stored analysis in review cards
- [x] 8.3 Add "Regenerate Analysis" button in review (optional)
- [x] 8.4 Handle missing AI content gracefully (show word + context only)

## 9. Migration & Compatibility
- [x] 9.1 Create migration script for existing `learning` words → global vocab with FSRS
- [x] 9.2 Ensure existing per-book vocabulary continues to work
- [x] 9.3 Update IndexedDB version and handle upgrade path
- [x] 9.4 Test with fresh install and upgrade scenarios

## 10. Testing & Polish
- [x] 10.1 Test page-turn auto-marking with various scenarios
- [x] 10.2 Test FSRS scheduling produces reasonable intervals
- [x] 10.3 Test review session flow (start → rate → finish)
- [x] 10.4 Test cross-book vocabulary merging
- [x] 10.5 Test word status sync between reading view and review
- [x] 10.6 Polish animations and transitions in review UI

---

## Dependencies

```
Task 2 depends on Task 1 (seen status must exist)
Task 3 depends on Task 1 (status transitions)
Task 5 depends on Task 4 (global vocab store for FSRS data)
Task 6 depends on Task 5 (FSRS for interval display)
Task 7 depends on Task 5 and Task 6 (FSRS + UI)
Task 8 depends on Task 4 (global vocab store)
Task 9 depends on Task 4 (schema changes)
Task 10 depends on all above
```

## Parallelizable Work

| Can run in parallel |
|---------------------|
| Task 1 (status) with Task 4 (schema design) |
| Task 5 (FSRS service) with Task 6 (UI skeleton) |
| Task 8 (AI storage) with Task 7 (review logic) |
