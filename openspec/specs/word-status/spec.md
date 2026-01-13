# word-status Specification

## Purpose
TBD - created by archiving change refactor-reader-lingq-style. Update Purpose after archive.
## Requirements
### Requirement: Word Status Tracking
The system SHALL track vocabulary status using a four-state model: `new`, `seen`, `learning`, and `known`, with visual color coding.

#### Scenario: New words are identified
- **WHEN** user opens a chapter for the first time
- **THEN** words not in the vocabulary list are marked as `new`
- **AND** new words display with blue underline styling

#### Scenario: User views a word and sees analysis
- **WHEN** user selects a word in the reading content
- **THEN** the system shows (or begins loading) AI analysis in the vocabulary panel

#### Scenario: User sets a word to learning
- **GIVEN** a word with status `new` or `seen`
- **WHEN** the user sets the word status to `learning`
- **THEN** a global FSRS card is created or updated for that word

#### Scenario: User marks a word as known
- **GIVEN** a word with status `learning`
- **WHEN** the user sets the word status to `known`
- **THEN** the global FSRS card is deleted for that word

#### Scenario: Word status is persistent
- **WHEN** user returns to a chapter previously read
- **THEN** words display with their saved status colors
- **AND** status is consistent across all occurrences in the book

---

### Requirement: Word Status Color Coding
The system SHALL apply distinct visual styles to words based on their status.

#### Scenario: New word styling
- **WHEN** a word has `new` status
- **THEN** word displays with blue underline styling

#### Scenario: Seen word styling
- **WHEN** a word has `seen` status
- **THEN** word displays with teal/green underline styling

#### Scenario: Learning word styling
- **WHEN** a word has `learning` status
- **THEN** word displays with yellow/gold semi-transparent background

#### Scenario: Known word styling
- **WHEN** a word has `known` status
- **THEN** word displays with no special styling

---

### Requirement: Vocabulary Panel Status Integration
The vocabulary panel SHALL display word status and provide controls to change status.

#### Scenario: Vocabulary card shows status
- **WHEN** user views a vocabulary card in the sidebar
- **THEN** card displays a status indicator (dot or badge)
- **AND** current status is clearly labeled

#### Scenario: User changes status from panel
- **WHEN** user changes status from the vocabulary panel
- **THEN** the word status updates immediately
- **AND** the change is reflected in reading content

#### Scenario: Vocabulary list is filterable by status
- **WHEN** user selects a status filter (All | Learning | Seen | Known)
- **THEN** vocabulary list shows only words matching the selected status

---

### Requirement: Reading Progress Tracking
The system SHALL track and display reading progress at both chapter and book level.

#### Scenario: Chapter progress is displayed
- **WHEN** user is reading a chapter
- **THEN** progress bar shows percentage of chapter completed
- **AND** page count (e.g., "Page 3/12") is visible

#### Scenario: Book progress is displayed
- **WHEN** user is reading any chapter
- **THEN** overall book progress percentage is shown
- **AND** progress considers completed chapters plus current chapter position

#### Scenario: Progress is saved automatically
- **WHEN** user navigates pages or closes the app
- **THEN** exact reading position is saved to database
- **AND** user can resume from same position on next visit

### Requirement: Page Turn Auto-Marking
When the user turns a page, unclicked words SHALL automatically progress through passive learning states.

**Rules**:
- Only `new` and `seen` words are affected
- Words that were clicked on the current page are excluded
- `learning` words are never auto-marked

#### Scenario: New word becomes seen on first page turn
- **Given** a word with status `new` on the current page
- **And** the user did not click the word
- **When** the user navigates to the next page
- **Then** the word status changes to `seen`
- **And** the word's encounter count is set to 1

#### Scenario: Seen word becomes known on second encounter
- **Given** a word with status `seen`
- **And** the word has encounter count >= 1
- **And** the user did not click the word
- **When** the user navigates to the next page containing this word
- **Then** the word status changes to `known`

#### Scenario: Learning word is not affected by page turn
- **Given** a word with status `learning` on the current page
- **When** the user navigates to the next page
- **Then** the word status remains `learning`

#### Scenario: Clicked word is not auto-marked
- **Given** a word with status `new` on the current page
- **And** the user clicked the word to view analysis
- **When** the user navigates to the next page
- **Then** the word status is not changed by auto-marking

