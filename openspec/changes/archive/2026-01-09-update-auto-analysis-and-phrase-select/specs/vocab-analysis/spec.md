## ADDED Requirements

### Requirement: Debounced Instant Analysis
The system SHALL debounce instant AI analysis triggered by user selection, and SHALL ignore stale responses for previous selections.

#### Scenario: Rapidly clicking multiple words
- **GIVEN** AI is configured
- **WHEN** the user clicks multiple words rapidly
- **THEN** only the last selected word's analysis is rendered
- **AND** earlier in-flight responses are ignored

### Requirement: Retry Control
The system SHALL provide a lightweight retry control when analysis is missing.

#### Scenario: Analysis fails and user retries
- **GIVEN** analysis for the selected item is missing
- **WHEN** the user clicks the retry control
- **THEN** the system retries analysis for the current selection

## MODIFIED Requirements

### Requirement: Click-to-Analyze
The system SHALL automatically run instant AI analysis when the user selects a word (and analysis is not already available), without requiring an explicit "分析" button click.

#### Scenario: Click a word with no existing analysis
- **GIVEN** AI is configured
- **WHEN** the user clicks a word in the reading content
- **THEN** the system runs analysis automatically
- **AND** renders the analysis in the vocabulary panel when complete

