## ADDED Requirements
### Requirement: Known Words Stats and Detail Modal
The bookshelf view SHALL provide a Known Words stats card showing total known words and today's known words, and a detail modal with tabs, search, language filter, and pagination for known-word entries.

#### Scenario: Stats card is visible and actionable
- **WHEN** the user views the bookshelf header
- **THEN** a Known Words card shows total known words and today's known words
- **AND** clicking the card opens the detail modal

#### Scenario: Tabs show all vs. today's known words
- **GIVEN** the Known Words modal is open
- **WHEN** the user selects the All Known Words tab
- **THEN** all known words are shown
- **AND** when the user selects the Today's Words tab
- **THEN** only words mastered today are shown

#### Scenario: Search, language filter, and pagination apply
- **GIVEN** the Known Words modal is open
- **WHEN** the user enters a search query or selects a language filter
- **THEN** the list updates in real time and paging resets to page 1
- **AND** pagination limits the list to 50 items per page

#### Scenario: Stats and list update after new known words
- **GIVEN** the user marks new words as known
- **WHEN** the known word data is persisted
- **THEN** the stats card updates automatically
- **AND** any open Known Words modal refreshes its list
