# Tasks: Vocab Library Pagination + Bulk Actions + Search/Filters

## 1. State + Persistence
- [x] 1.1 Add view state for page, query, filters, selected IDs
- [x] 1.2 Persist page/query/filters to localStorage; do not persist selections

## 2. Pagination
- [x] 2.1 Add helpers: filter, paginate, total pages
- [x] 2.2 Render pagination controls and keep existing sort order
- [x] 2.3 If delete leaves page empty, go to previous page

## 3. Search + Filters
- [x] 3.1 Add search input (vocab + definition, case-insensitive)
- [x] 3.2 Add review status + language filters; reset to page 1 on change
- [x] 3.3 Show result count

## 4. Bulk Select + Delete
- [x] 4.1 Add per-card checkbox; add select-all/clear for current page
- [x] 4.2 Show selected count; show bulk delete action when selection non-empty
- [x] 4.3 Confirm modal (count + preview max 10) via ModalManager; delete via `deleteGlobalVocabItem`

## 5. Manual Validation
- [x] 5.1 Large dataset: switching pages remains responsive
- [x] 5.2 Search/filters: result count and paging behave correctly
- [x] 5.3 Bulk delete: modal contents correct; items removed locally + remotely
