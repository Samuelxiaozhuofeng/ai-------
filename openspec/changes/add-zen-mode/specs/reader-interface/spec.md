## ADDED Requirements
### Requirement: Zen Mode Toggle
The reader SHALL provide a Zen Mode that can be entered via a dedicated UI control or keyboard shortcut and exited via Escape or the same control.

#### Scenario: User enters Zen Mode
- **WHEN** the user clicks the Zen Mode button or presses the Z key while reading
- **THEN** the reader enters Zen Mode
- **AND** the UI reflects the active Zen Mode state

#### Scenario: User exits Zen Mode
- **WHEN** the user presses Escape or toggles Zen Mode off
- **THEN** the reader exits Zen Mode
- **AND** the standard reading UI is restored

### Requirement: Zen Mode UI Suppression and Reveal
The reader SHALL hide non-reading UI in Zen Mode and temporarily reveal it when the pointer reaches the top or bottom edge, auto-hiding after inactivity.

#### Scenario: Zen Mode hides non-reading UI
- **WHEN** Zen Mode is active
- **THEN** the header, toolbar, footer, vocabulary panel, and resize handle are hidden
- **AND** the reading area expands to use the available space

#### Scenario: Zen Mode reveals UI at edges
- **WHEN** the pointer moves within the top or bottom edge threshold
- **THEN** the header and footer are revealed
- **AND** the UI auto-hides after a short idle period

### Requirement: Zen Mode Navigation and Word Lookup
The reader SHALL support page navigation in Zen Mode and exit Zen Mode when initiating a word lookup.

#### Scenario: User navigates pages in Zen Mode
- **WHEN** Zen Mode is active and page mode is enabled
- **THEN** the left/right arrow keys and spacebar navigate pages
- **AND** edge clicks use the Zen Mode edge ratio for paging

#### Scenario: User clicks a word in Zen Mode
- **WHEN** Zen Mode is active and the user clicks a word
- **THEN** Zen Mode exits
- **AND** the vocabulary panel is shown for that word
