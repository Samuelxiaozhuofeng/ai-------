## ADDED Requirements

### Requirement: Modular Frontend Entry
The system SHALL keep `js/app.js` as a thin entrypoint that wires UI, routing, and view modules using ES Modules without introducing a bundler.

#### Scenario: App initializes with modules
- **WHEN** the user opens `index.html` via a static server
- **THEN** the application initializes without module import errors
- **AND** the bookshelf view is shown as the default view

### Requirement: Centralized Modal Management
The system SHALL use a shared modal manager to implement consistent modal behavior (open/close, overlay-click close, close buttons, Escape close) across all UI modals.

#### Scenario: Modal open and close behaviors are consistent
- **WHEN** the user opens the Rename Book modal from the bookshelf context menu
- **THEN** clicking the overlay closes the modal
- **AND** pressing Escape closes the modal

### Requirement: Centralized View Routing
The system SHALL centralize view show/hide logic for `bookshelf`, `reader`, `review`, and `vocab-library` views via a router abstraction.

#### Scenario: Navigating between views hides the others
- **WHEN** the user opens a book from the bookshelf
- **THEN** the reader view is shown
- **AND** the bookshelf view is hidden
- **AND** the review view is hidden

### Requirement: Bookshelf Rendering Uses Delegation
The system SHALL handle bookshelf interactions (open book, open context menu) using event delegation rather than per-item listeners.

#### Scenario: Open book and context menu still work
- **WHEN** the user clicks a book item in the bookshelf
- **THEN** the reader opens the selected book
- **WHEN** the user clicks the book menu button
- **THEN** the context menu opens for that book

