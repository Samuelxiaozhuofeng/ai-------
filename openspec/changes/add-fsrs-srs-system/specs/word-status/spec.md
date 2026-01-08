# Spec: Word Status System

## MODIFIED Requirements

### Requirement: Word Status States
The word status system SHALL use a four-state model to track vocabulary learning progress.

**States**:
| Status | Description | FSRS Card | Visual |
|--------|-------------|-----------|--------|
| `new` | Word never encountered before | No | Blue underline |
| `seen` | Encountered once, not studied | No | Teal/green underline |
| `learning` | Actively being studied | Yes | Yellow background |
| `known` | Mastered, no review needed | No | No highlight |

#### Scenario: Status transitions from new to learning (Auto ON)
- **Given** a word with status `new`
- **And** the Auto toggle is ON
- **When** the user clicks the word
- **Then** the word status changes to `learning`
- **And** a global FSRS card is created
- **And** AI analysis is shown in the vocabulary panel

#### Scenario: Status transitions from new to learning (Auto OFF)
- **Given** a word with status `new`
- **And** the Auto toggle is OFF
- **When** the user clicks the word
- **Then** AI analysis is shown in the vocabulary panel
- **And** the word status remains `new`
- **When** the user clicks "Add to Study" button
- **Then** the word status changes to `learning`
- **And** a global FSRS card is created

#### Scenario: Status transitions from seen to learning
- **Given** a word with status `seen`
- **When** the user clicks the word
- **Then** the word status changes to `learning`
- **And** a global FSRS card is created
- **And** AI analysis is shown

#### Scenario: Status transitions from learning to known
- **Given** a word with status `learning`
- **When** the user clicks "Mark as Known" button
- **Then** the word status changes to `known`
- **And** the global FSRS card is deleted

---

## ADDED Requirements

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
