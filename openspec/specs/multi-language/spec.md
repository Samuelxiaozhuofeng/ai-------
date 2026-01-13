# multi-language Specification

## Purpose
TBD - created by archiving change add-multi-language-support. Update Purpose after archive.
## Requirements
### Requirement: Supported Languages
The system SHALL support three target languages for vocabulary learning: English (en), Spanish (es), and Japanese (ja).

#### Scenario: Language codes are available
- **WHEN** the application initializes
- **THEN** the supported languages list contains `en`, `es`, and `ja` with display names `英语`, `西班牙语`, `日语`

---

### Requirement: Book Language Selection on Import
The system SHALL prompt the user to select a language when importing an EPUB book.

#### Scenario: User imports a book and selects language
- **WHEN** user selects an EPUB file for import
- **THEN** a modal appears with three language options (English, Spanish, Japanese)
- **AND** the user must select one before import proceeds

#### Scenario: User cancels language selection
- **WHEN** user opens language selection modal
- **AND** user closes the modal without selecting a language
- **THEN** the book import is cancelled
- **AND** no partial book data is saved

---

### Requirement: Book Language Storage
Each book SHALL store its language as a required attribute in IndexedDB.

#### Scenario: Book is saved with language
- **WHEN** a book is imported with language `ja`
- **THEN** the book record in IndexedDB contains `language: "ja"`

---

### Requirement: Vocabulary Language Tagging
Each vocabulary item SHALL be tagged with the language of its source book.

#### Scenario: Vocabulary inherits book language
- **WHEN** user clicks a word in a Spanish book
- **AND** the word is saved to vocabulary
- **THEN** the vocabulary item has `language: "es"`

---

### Requirement: Global Vocabulary Language Tagging
Each global vocabulary (FSRS card) SHALL be tagged with a language.

#### Scenario: Learning card has language
- **WHEN** a word is marked as "learning" from a Japanese book
- **THEN** the global vocabulary record has `language: "ja"`

---

### Requirement: Bookshelf Language Filter Tabs
The bookshelf SHALL display language filter tabs allowing users to view books by language.

#### Scenario: User filters books by language
- **WHEN** user clicks the "日语" tab on bookshelf
- **THEN** only Japanese language books are displayed
- **AND** the tab shows as active

#### Scenario: Language filter persists across sessions
- **WHEN** user selects "西班牙语" tab and closes the app
- **AND** user reopens the app
- **THEN** "西班牙语" tab is still selected

---

### Requirement: Per-Language Review Buttons
The bookshelf SHALL display separate review buttons for each language with due card counts.

#### Scenario: Review buttons show due counts
- **WHEN** user opens bookshelf
- **AND** English has 12 due cards, Japanese has 5, Spanish has 0
- **THEN** bookshelf shows `复习英语 (12)` and `复习日语 (5)` buttons
- **AND** Spanish button is hidden (zero due)

#### Scenario: User starts language-specific review
- **WHEN** user clicks `复习日语 (5)` button
- **THEN** review session starts with only Japanese vocabulary

---

### Requirement: Mixed Review Mode Option
The system SHALL allow users to choose between grouped (per-language) or mixed (all languages) review mode.

#### Scenario: User enables mixed review mode
- **WHEN** user sets review mode to "mixed" in FSRS settings
- **AND** user opens bookshelf
- **THEN** a single `复习 (17)` button appears (combining all languages)

#### Scenario: User enables grouped review mode
- **WHEN** user sets review mode to "grouped" in FSRS settings
- **THEN** separate per-language review buttons appear

---

### Requirement: FSRS Settings Tab
The settings modal SHALL include an FSRS tab with review mode and retention settings.

#### Scenario: User opens FSRS settings
- **WHEN** user opens Settings and clicks FSRS tab
- **THEN** user sees:
  - Review mode radio buttons (grouped / mixed)
  - Request Retention slider (range 0.70 - 0.97, default 0.90)

#### Scenario: User adjusts request retention
- **WHEN** user moves retention slider to 0.85
- **AND** user saves settings
- **THEN** the FSRS algorithm uses 0.85 as the target retention

---

### Requirement: Language-Specific AI Prompts
The AI vocabulary analysis SHALL use language-specific prompt templates.

#### Scenario: English word analysis
- **WHEN** user clicks a word in an English book
- **THEN** AI prompt requests meaning, usage patterns, and contextual meaning (bilingual)

#### Scenario: Japanese word analysis
- **WHEN** user clicks a word in a Japanese book
- **THEN** AI prompt requests furigana reading, meaning, kanji origin, and politeness level

#### Scenario: Spanish word analysis
- **WHEN** user clicks a word in a Spanish book
- **THEN** AI prompt requests meaning, verb conjugation/noun gender, and contextual meaning

---

### Requirement: Legacy Data Cleanup
The system SHALL silently remove any existing data without language attributes on first run after update.

#### Scenario: Legacy data is cleaned up
- **WHEN** application starts
- **AND** books exist without `language` field
- **THEN** all books, vocabulary, and global vocabulary are deleted
- **AND** no user prompt or confirmation is shown

