# Spec: Vocabulary Data Model

## ADDED Requirements

### Requirement: Global Vocabulary Store
A global vocabulary store SHALL hold cross-book learning vocabulary with FSRS scheduling data.

**Data Model**:
```javascript
{
  // Identity
  id: string,                    // normalizedWord (unique key)
  normalizedWord: string,        // lowercase, cleaned word
  displayWord: string,           // original casing from first encounter
  
  // AI Analysis Content
  meaning: string,               // translation or definition
  usage: string,                 // typical usage patterns
  contextualMeaning: string,     // meaning in original context
  context: string,               // source sentence
  
  // FSRS Scheduling Data
  fsrs: {
    due: Date,                   // next review date
    stability: number,           // memory stability
    difficulty: number,          // inherent difficulty
    elapsed_days: number,        // days since last review
    scheduled_days: number,      // interval to next review
    reps: number,                // total review count
    lapses: number,              // times forgotten
    state: number,               // 0=New, 1=Learning, 2=Review, 3=Relearning
    last_review: Date            // last review timestamp
  },
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  sourceBooks: string[]          // array of bookIds containing this word
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

#### Scenario: Deleting global entry when marked as known
- **Given** a global entry exists for word "ubiquitous"
- **When** the user marks the word as `known`
- **Then** the global entry is deleted
- **And** FSRS scheduling data is removed

---

### Requirement: Per-Book Vocabulary Store (Modified)
The existing per-book vocabulary store SHALL continue to track book-specific context.

**Modified Fields**:
```javascript
{
  // Existing fields
  id: string,                    // bookId:normalizedWord
  bookId: string,
  word: string,
  normalizedWord: string,
  status: 'new' | 'seen' | 'learning' | 'known',  // MODIFIED: added 'seen'
  context: string,
  chapterId: string,
  createdAt: Date,
  
  // NEW fields
  encounterCount: number,        // times word was encountered (for page-turn logic)
  clickedOnPage: boolean,        // whether word was clicked on current page
  lastPageIndex: number          // page where word was last seen
}
```

#### Scenario: Tracking encounter count
- **Given** a word with status `new` and encounterCount = 0
- **When** the user turns the page containing this word
- **Then** encounterCount is incremented to 1
- **And** status changes to `seen`

#### Scenario: Linking per-book to global vocabulary
- **Given** a word is marked as `learning` in book A
- **And** the same word exists in book B with status `new`
- **When** checking the word status in book B's reader
- **Then** the word should show as `learning` (status synced from global)
