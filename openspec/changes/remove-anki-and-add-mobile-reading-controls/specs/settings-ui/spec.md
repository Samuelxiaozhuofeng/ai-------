# Spec: Settings & Controls UI

## ADDED Requirements

### Requirement: Mobile Reader Typography Controls
The app SHALL provide an in-reader entry point on mobile to adjust reading typography settings (font preset, font size, line height).

#### Scenario: User opens typography controls while reading on mobile
- **Given** the user is viewing the reader on a mobile viewport
- **When** the user taps the typography control (e.g. “Aa”)
- **Then** the app opens the Reading settings UI
- **And** the UI shows controls for font preset, font size, and line height

#### Scenario: User adjusts typography settings
- **Given** the Reading settings UI is open
- **When** the user changes font preset, font size, or line height
- **Then** the reader updates immediately
- **And** the selection is persisted

---

### Requirement: No Anki Integration
The app SHALL NOT expose any AnkiConnect-related UI or make AnkiConnect network requests.

#### Scenario: Settings UI does not include Anki
- **When** the user opens Settings
- **Then** there is no Anki settings tab
- **And** there are no Anki deck/model/field mapping controls

#### Scenario: Vocabulary UI does not include Anki export
- **When** the user views vocabulary cards
- **Then** there is no “Add to Anki” action
- **And** no AnkiConnect request is attempted
