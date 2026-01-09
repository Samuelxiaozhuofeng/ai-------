## ADDED Requirements

### Requirement: Drag-Select Phrase Lookup
The system SHALL allow users to select a phrase in the reading content (via drag selection) and run instant AI analysis on the selected text.

#### Scenario: Drag-select a phrase
- **WHEN** the user drag-selects text within the reading content
- **THEN** the system uses the selected text as the analysis query
- **AND** renders the analysis result in the vocabulary panel
- **AND** does not change vocabulary status by default

## MODIFIED Requirements

### Requirement: AutoStudy Toggle Controls Status Changes
When AutoStudy is disabled, clicking a word SHALL NOT automatically change its vocabulary status.

#### Scenario: AutoStudy OFF
- **GIVEN** AutoStudy is OFF
- **WHEN** the user clicks a word in the reading content
- **THEN** the system does not set the word to `learning`

