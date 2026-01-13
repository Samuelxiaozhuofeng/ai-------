# vocab-library Specification

## Purpose
TBD - created by archiving change update-vocab-library-performance-controls. Update Purpose after archive.
## Requirements
### Requirement: Paginated Vocab Library Rendering
The vocab library MUST render items with page-number pagination at 30 items per page while preserving the existing sort order (update time descending).

#### Scenario: Paging through a large library
- **GIVEN** a library with more than 30 vocab items
- **WHEN** the user switches pages using the pagination control
- **THEN** only items for the selected page are rendered
- **AND** the visible items remain sorted by update time descending

#### Scenario: Page state is remembered
- **GIVEN** the user is on page N
- **WHEN** the user refreshes the page
- **THEN** the vocab library opens on page N (unless clamped by current result count)

### Requirement: Search and Filter Vocab Items
The vocab library MUST support real-time search over vocab and definition (case-insensitive) and provide filters for review status and language.

#### Scenario: Search filters the list
- **GIVEN** the user enters a search query
- **WHEN** the query changes
- **THEN** the visible items update in real time to match vocab or definition (case-insensitive)
- **AND** the page resets to 1
- **AND** the UI shows the result count

#### Scenario: Filters reset paging
- **GIVEN** the user changes review status or language filter
- **WHEN** the filter changes
- **THEN** the list updates according to the filter
- **AND** the page resets to 1

### Requirement: Bulk Select and Bulk Delete
The vocab library MUST allow selecting vocab items on the current page and bulk deleting them with confirmation.

#### Scenario: Select all affects only current page
- **GIVEN** the user is on a page with items
- **WHEN** the user clicks “select all”
- **THEN** all items on the current page become selected
- **AND** items on other pages are not automatically selected

#### Scenario: Bulk delete confirmation
- **GIVEN** one or more items are selected
- **WHEN** the user clicks bulk delete
- **THEN** a confirmation modal shows the count and a preview (max 10)
- **AND** on confirm, each item is deleted via existing delete logic for local + cloud

