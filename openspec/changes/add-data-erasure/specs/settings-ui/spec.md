## ADDED Requirements
### Requirement: Data Erasure Settings
The app SHALL provide a Data Management tab in Settings that allows users to erase all local and cloud data while preserving their account.

#### Scenario: User opens data management tab
- **WHEN** the user opens Settings
- **THEN** a "数据管理" tab is available
- **AND** the tab displays a destructive "抹除所有数据" action with warnings

#### Scenario: User confirms erasure with typed phrase
- **GIVEN** the user selects "抹除所有数据"
- **WHEN** the confirmation modal requires typing "DELETE"
- **THEN** the confirm button remains disabled until the phrase matches

#### Scenario: Data is erased but account is preserved
- **GIVEN** the user confirms erasure
- **WHEN** deletion completes
- **THEN** all books, vocabulary, progress, storage files, and local caches are removed
- **AND** the Supabase Auth account remains intact
- **AND** the user is redirected to an empty library
