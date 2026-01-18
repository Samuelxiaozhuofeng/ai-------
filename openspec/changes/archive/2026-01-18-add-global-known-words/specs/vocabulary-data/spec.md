## MODIFIED Requirements
### Requirement: Global Vocabulary Store
A global vocabulary store SHALL hold cross-book learning vocabulary with FSRS scheduling data and SHALL also store language-scoped global known tracking entries.

**Data Model**:
```javascript
{
  // Identity
  id: string,                    // `${language}:${normalizedWord}`
  kind: 'global' | 'global-known',
  language: string,
  normalizedWord: string,
  displayWord: string,

  // FSRS fields (kind = 'global')
  meaning: string,
  usage: string,
  contextualMeaning: string,
  context: string,
  fsrs: {
    due: Date,
    stability: number,
    difficulty: number,
    elapsed_days: number,
    scheduled_days: number,
    reps: number,
    lapses: number,
    state: number,
    last_review: Date
  },

  // Global known fields (kind = 'global-known')
  status: 'seen' | 'known',
  encounterCount: number,
  lastEncounteredAt: Date,
  sourceBooks: string[],

  // Metadata
  createdAt: Date,
  updatedAt: Date
}
```

#### Scenario: Creating a global vocabulary entry
- **Given** a word is marked as `learning` in any book
- **And** no global entry exists for this normalized word
- **When** the system creates a global entry
- **Then** the entry includes the word, AI analysis, and default FSRS card
- **And** the source book is added to `sourceBooks` array

#### Scenario: Updating existing global entry from another book
- **Given** a global entry exists for word "ubiquitous"
- **And** the word appears in a new book
- **When** the user marks the word as `learning` in the new book
- **Then** the new bookId is added to `sourceBooks` array
- **And** the existing FSRS data is preserved
- **And** AI analysis is not overwritten

#### Scenario: Marking a word as known
- **Given** a global learning entry exists for word "ubiquitous"
- **When** the user marks the word as `known`
- **Then** the global learning entry is deleted
- **And** a global-known entry is created or updated with `status = known`

## ADDED Requirements
### Requirement: Global Known Migration
The system SHALL migrate existing book-level known entries into global-known records grouped by language while preserving the original book-level entries.

#### Scenario: Book-level known is migrated
- **Given** book A (language "en") has word "ubiquitous" marked as `known`
- **When** the migration runs
- **Then** a global-known record exists for `en:ubiquitous`
- **And** the original book-level record remains intact
