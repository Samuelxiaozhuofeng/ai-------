## ADDED Requirements
### Requirement: Effective Word Status Priority
The system SHALL resolve word status using the following priority order:
1) Book-level `learning` override
2) Global known (language-scoped)
3) Book-level `seen`
4) Default `new`

#### Scenario: Book-level learning overrides global known
- **Given** a word is global-known in English
- **And** the same word is marked as `learning` in the current book
- **When** the word is rendered
- **Then** the word displays as `learning`

#### Scenario: Global known is language-scoped
- **Given** a word is global-known in English
- **When** the same word appears in a French book
- **Then** the word is not treated as global-known

#### Scenario: Clicking a global-known word does not downgrade
- **Given** a word is global-known
- **When** the user clicks the word to view analysis
- **Then** the word remains `known`

## MODIFIED Requirements
### Requirement: Page Turn Auto-Marking
When the user turns a page, unclicked words SHALL automatically progress through passive learning states using global encounter counts scoped to the current book language.

**Rules**:
- Only words with effective status `new` or `seen` are affected
- Encounter counts are tracked globally per language
- Words that were clicked on the current page are excluded
- `learning` words are never auto-marked

#### Scenario: New word becomes seen on first global encounter
- **Given** a word has effective status `new`
- **And** the word has 0 global encounters for this language
- **And** the user did not click the word
- **When** the user navigates to the next page containing this word
- **Then** the word status changes to `seen`
- **And** the global encounter count is incremented to 1

#### Scenario: Seen word becomes known on second global encounter
- **Given** a word has effective status `seen`
- **And** the word has 1 global encounter for this language (from any book)
- **And** the user did not click the word
- **When** the user navigates to the next page containing this word
- **Then** a global-known record is set for the word
- **And** the word displays as `known`

#### Scenario: Learning word is not affected by page turn
- **Given** a word with status `learning` on the current page
- **When** the user navigates to the next page
- **Then** the word status remains `learning`

#### Scenario: Clicked word is not auto-marked
- **Given** a word with status `new` or `seen` on the current page
- **And** the user clicked the word to view analysis
- **When** the user navigates to the next page
- **Then** the word is not auto-marked
