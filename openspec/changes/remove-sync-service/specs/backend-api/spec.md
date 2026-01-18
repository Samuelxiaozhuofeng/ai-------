## REMOVED Requirements
### Requirement: Data Sync API
**Reason**: Supabase is the single source of truth and the app no longer performs local-first sync.
**Migration**: Remove `/api/v1/sync` usage and rely on direct Supabase CRUD calls.

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
**Reason**: Background sync, offline queueing, and manual sync are no longer part of the architecture.
**Migration**: Remove the sync service module and all sync UI indicators/buttons.

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
