## ADDED Requirements

### Requirement: Backend Server
The system SHALL provide a Python FastAPI backend server for persistent storage of vocabulary and reading progress.

#### Scenario: Backend server starts successfully
- **WHEN** user runs the backend server
- **THEN** server starts on configured port (default 8000)
- **AND** health check endpoint returns 200 OK
- **AND** CORS is configured to allow frontend requests

#### Scenario: Backend uses SQLite database
- **WHEN** backend initializes
- **THEN** SQLite database file is created if not exists
- **AND** required tables (vocabulary, progress) are created
- **AND** database persists between server restarts

---

### Requirement: Vocabulary API
The backend SHALL provide REST API endpoints for vocabulary CRUD operations.

#### Scenario: List all vocabulary
- **WHEN** GET request to `/api/v1/vocabulary`
- **THEN** response contains array of all vocabulary items
- **AND** each item includes: id, word, status, context, meaning, timestamps

#### Scenario: Add vocabulary item
- **WHEN** POST request to `/api/v1/vocabulary` with word data
- **THEN** new vocabulary item is created in database
- **AND** response returns created item with generated ID
- **AND** status code is 201 Created

#### Scenario: Update vocabulary status
- **WHEN** PUT request to `/api/v1/vocabulary/{id}` with new status
- **THEN** vocabulary item status is updated
- **AND** `lastUpdated` timestamp is refreshed
- **AND** response returns updated item

#### Scenario: Delete vocabulary item
- **WHEN** DELETE request to `/api/v1/vocabulary/{id}`
- **THEN** vocabulary item is removed from database
- **AND** status code is 204 No Content

---

### Requirement: Reading Progress API
The backend SHALL provide REST API endpoints for reading progress persistence.

#### Scenario: Get reading progress for a book
- **WHEN** GET request to `/api/v1/progress/{book_id}`
- **THEN** response contains progress data: chapter_id, page_number, percentage
- **AND** if no progress exists, return empty object with 200 OK

#### Scenario: Update reading progress
- **WHEN** PUT request to `/api/v1/progress/{book_id}` with position data
- **THEN** progress is saved or updated in database
- **AND** response confirms saved position

---

### Requirement: Data Sync API
The backend SHALL provide bulk sync endpoint for efficient frontend synchronization.

#### Scenario: Bulk sync vocabulary
- **WHEN** POST request to `/api/v1/sync` with vocabulary array
- **THEN** backend merges data using last-write-wins strategy
- **AND** response returns merged state with any conflicts resolved
- **AND** sync timestamp is recorded

#### Scenario: Frontend syncs on app load
- **WHEN** frontend application loads
- **THEN** frontend fetches latest data from backend
- **AND** local IndexedDB is updated with merged data
- **AND** any local changes made offline are sent to backend

---

### Requirement: Frontend Sync Service
The frontend SHALL include a sync service module for backend communication.

#### Scenario: Background sync runs periodically
- **WHEN** user is actively using the app
- **THEN** sync service sends local changes to backend every 30 seconds
- **AND** sync happens in background without blocking UI

#### Scenario: Sync status is visible
- **WHEN** sync is in progress
- **THEN** UI shows subtle sync indicator (e.g., spinning icon)
- **AND** on completion, indicator shows "synced" or timestamp

#### Scenario: Offline mode is handled gracefully
- **WHEN** backend is unreachable
- **THEN** app continues to work with local IndexedDB
- **AND** sync queue stores pending changes
- **AND** sync resumes automatically when connection restored

#### Scenario: Manual sync is available
- **WHEN** user clicks "Sync Now" in settings
- **THEN** immediate sync is triggered
- **AND** success or failure message is displayed
