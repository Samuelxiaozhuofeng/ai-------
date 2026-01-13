# Spec: SRS Review System

## ADDED Requirements

### Requirement: Review Interface Access
Users SHALL be able to access a global vocabulary review session from the main navigation.

#### Scenario: Opening review from bookshelf
- **Given** the user is on the bookshelf view
- **When** the user clicks the "Review" button in the header
- **Then** the review view is displayed
- **And** the review session is loaded with due cards from all books

#### Scenario: Review with no due cards
- **Given** the user opens the review view
- **And** there are no cards due for review
- **Then** a message "No cards due for review" is displayed
- **And** the next review time is shown (if any cards exist)

---

### Requirement: Review Card Display
Each review card SHALL show the word and its AI-generated analysis.

**Card Content**:
- Word (large, prominent)
- Meaning (translation/definition)
- Usage (how the word is typically used)
- Contextual Meaning (meaning in the original sentence context)
- Source context sentence (where the word was first encountered)

#### Scenario: Displaying a review card
- **Given** the user is in a review session
- **And** there are due cards in the queue
- **When** the next card is shown
- **Then** the word is displayed prominently
- **And** the meaning, usage, and contextual meaning are visible
- **And** the source context is shown

#### Scenario: Card with missing AI analysis
- **Given** a card in the review queue
- **And** the AI analysis was not generated or failed
- **When** the card is displayed
- **Then** the word and source context are shown
- **And** a message indicates analysis is unavailable

---

### Requirement: FSRS Rating System
Users SHALL rate their recall using the FSRS four-button system.

**Rating Buttons**:
| Button | FSRS Rating | Description |
|--------|-------------|-------------|
| Again | Rating.Again | Did not recall |
| Hard | Rating.Hard | Recalled with difficulty |
| Good | Rating.Good | Recalled correctly |
| Easy | Rating.Easy | Recalled perfectly |

#### Scenario: Rating a card as Good
- **Given** a card is displayed in review
- **When** the user clicks "Good" (or presses key 3)
- **Then** the FSRS algorithm calculates the next review date
- **And** the card's due date is updated
- **And** the next card in the queue is displayed

#### Scenario: Rating a card as Again
- **Given** a card is displayed in review
- **When** the user clicks "Again" (or presses key 1)
- **Then** the card enters relearning state
- **And** the card will be shown again soon (within this session)

#### Scenario: Keyboard shortcuts for rating
- **Given** a card is displayed in review
- **When** the user presses key "1"
- **Then** the rating "Again" is submitted
- **And** when the user presses key "2", rating "Hard" is submitted
- **And** when the user presses key "3", rating "Good" is submitted
- **And** when the user presses key "4", rating "Easy" is submitted

---

### Requirement: Review Session Statistics
The review interface SHALL display session progress and queue statistics.

**Displayed Stats**:
- Due: number of cards due for review now
- New: number of new cards (never reviewed)
- Remaining: cards left in current session

#### Scenario: Stats update after rating
- **Given** the review session shows "Due: 10, Remaining: 15"
- **When** the user rates a card
- **Then** the remaining count decreases by 1
- **And** if the queue is empty, the session complete message is shown

---

### Requirement: Interval Preview
Each rating button SHALL show the predicted next review interval.

#### Scenario: Interval preview display
- **Given** a card is displayed in review
- **Then** the "Again" button shows interval (e.g., "<1m")
- **And** the "Hard" button shows interval (e.g., "<10m")
- **And** the "Good" button shows interval (e.g., "1d")
- **And** the "Easy" button shows interval (e.g., "4d")
