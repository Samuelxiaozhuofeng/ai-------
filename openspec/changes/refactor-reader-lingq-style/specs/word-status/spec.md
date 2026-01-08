## ADDED Requirements

### Requirement: Word Status Tracking
The system SHALL track vocabulary status using a three-state model: `new`, `learning`, and `known`, with visual color coding.

#### Scenario: New words are identified
- **WHEN** user opens a chapter for the first time
- **THEN** words not in the known vocabulary list are marked as `new`
- **AND** new words display with blue underline styling

#### Scenario: User saves a word for learning
- **WHEN** user clicks on a word and saves it via vocabulary panel
- **THEN** word status changes from `new` to `learning`
- **AND** word displays with yellow background highlight
- **AND** word is added to vocabulary list with context and AI analysis

#### Scenario: User marks a word as known
- **WHEN** user clicks "Mark as Known" on a vocabulary card
- **THEN** word status changes to `known`
- **AND** word no longer displays special highlighting (appears as normal text)
- **AND** word remains in vocabulary history but hidden from active list

#### Scenario: Word status is persistent
- **WHEN** user returns to a chapter previously read
- **THEN** words display with their saved status colors
- **AND** status is consistent across all occurrences in the book

---

### Requirement: Word Status Color Coding
The system SHALL apply distinct visual styles to words based on their learning status.

#### Scenario: New word styling
- **WHEN** a word has `new` status
- **THEN** word displays with blue dotted underline
- **AND** cursor changes to pointer on hover

#### Scenario: Learning word styling
- **WHEN** a word has `learning` status
- **THEN** word displays with yellow/gold semi-transparent background
- **AND** word is visually prominent but readable

#### Scenario: Known word styling
- **WHEN** a word has `known` status
- **THEN** word displays with no special styling
- **AND** word remains clickable for re-review if needed

---

### Requirement: Vocabulary Panel Status Integration
The vocabulary panel SHALL display word status and provide controls to change status.

#### Scenario: Vocabulary card shows status
- **WHEN** user views a vocabulary card in the sidebar
- **THEN** card displays a colored status indicator (dot or badge)
- **AND** current status is clearly labeled

#### Scenario: User changes status from panel
- **WHEN** user clicks status toggle on vocabulary card
- **THEN** word cycles to next status or specific status is selectable
- **AND** change is reflected immediately in reading content

#### Scenario: Vocabulary list is filterable by status
- **WHEN** user clicks filter tabs (All | Learning | Known)
- **THEN** vocabulary list shows only words matching selected status
- **AND** count for each status is displayed in tab

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
