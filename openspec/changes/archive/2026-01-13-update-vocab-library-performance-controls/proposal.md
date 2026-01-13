# Change: Vocab Library Pagination + Bulk Actions + Search/Filters

## Why
- Current vocab library renders all vocab items at once, which causes poor performance as the dataset grows.
- Users need basic library workflows: paging through large lists, quickly selecting items, bulk deletion, and fast search/filtering.

## What Changes

### Pagination (30 items/page)
- The vocab library list renders **30 items per page** with **page-number navigation** (1, 2, 3 … last).
- Sorting remains **by update time descending** (existing behavior).
- Pagination state is **remembered across refresh** (localStorage).

### Bulk Select + Bulk Delete
- Each vocab card includes a checkbox for selection.
- A top control provides **select all / clear selection** for the current page only.
- The UI shows **selected count** and a **bulk delete** action when at least one item is selected.
- Bulk delete shows a confirmation modal with:
  - Number of items to delete
  - Preview list of vocab (max 10)
  - Confirm / cancel actions
- Deletion uses existing `deleteGlobalVocabItem` to remove both local and cloud records.

### Search + Filters
- Real-time search over vocab + definition (case-insensitive).
- Filters:
  - Review status: all / overdue / due today / future
  - Language: all / English / other
- Search/filter changes reset to page 1 and show result count.
- Selection is not persisted and is cleared when paging.

## Impact
- UI additions in vocab library view (search, filters, pagination, selection affordances).
- LocalStorage gets a few new keys for vocab-library view state.
- No changes to FSRS scheduling logic or review calculations.

## Out of Scope
- Changing the FSRS algorithm or review scheduling semantics.
- Server-side pagination (this change is UI-layer pagination over the existing loaded dataset).

