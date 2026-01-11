# Change: Remove Anki Integration + Add Mobile Reading Controls

## Why
- Mobile reading experience currently lacks a convenient way to access typography controls while reading.
- The project no longer needs Anki integration; keeping AnkiConnect code/UI increases maintenance and surface area.

## What Changes

### Reading Settings (Mobile + Desktop)
- Add a dedicated **reading typography control entry point** in the reader UI (Apple Books-style, e.g. “Aa”).
- When opened from the reader, the settings UI should land directly on the **Reading** section.
- Reading typography remains persisted (font preset, font size, line height) and applied on startup.

### Remove Anki Integration (Breaking)
- Remove AnkiConnect export support:
  - Remove Anki settings tab and all related form fields.
  - Remove “Add to Anki” buttons and related handlers.
  - Remove AnkiConnect service module and any calls to `localhost:8765`.
- Remove Anki-related storage keys and persistence.
- Keep non-Anki study/FSRS features intact.

## Impact

### Breaking / User-Facing
- Users can no longer export vocabulary to Anki from within the app.

### Affected Code
- `index.html`: remove Anki UI, add reader typography button.
- `js/ui/settings-modal.js`: remove Anki tab logic; support opening directly to Reading.
- `js/anki-service.js`: removed.
- `js/views/reader/vocab-panel.js`: remove Anki export button + handlers.
- `js/storage.js`, `js/core/auto-study.js`: decouple “auto study” from Anki settings storage.
- `styles/components/settings.css`, `styles/views/review.css`, `styles/views/reader.css`, `styles/base/responsive.css`: remove Anki-related styling and ensure typography controls are accessible on mobile.

## Out of Scope
- Adding new fonts beyond the existing presets.
- Changing FSRS behavior or review scheduling.
