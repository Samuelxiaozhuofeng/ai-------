## 1. UI + Confirmation
- [x] 1.1 Add Data Management tab to settings modal and render destructive warning copy.
- [x] 1.2 Implement confirmation modal with typed "DELETE" gate and disabled confirm button.
- [x] 1.3 Add loading/disabled state and success feedback.

## 2. Deletion Orchestration
- [x] 2.1 Implement a centralized erase function that deletes Supabase data (tables + storage) with user scoping.
- [x] 2.2 Clear IndexedDB stores and localStorage preferences after remote deletion.
- [x] 2.3 Handle errors (log + continue) and return a summary.

## 3. UX Flow
- [x] 3.1 Redirect to empty bookshelf or log out after completion.
- [x] 3.2 Ensure cancel closes modal without side effects.

## 4. Documentation
- [x] 4.1 Update README or docs with a brief data-erasure note and what is preserved.
- [x] 4.2 Add inline comments about deletion order and account preservation.
