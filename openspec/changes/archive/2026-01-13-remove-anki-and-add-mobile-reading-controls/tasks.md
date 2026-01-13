# Tasks: Remove Anki + Mobile Reading Controls

## 1. Remove Anki UI
- [x] 1.1 Remove Anki settings tab + content from `index.html`
- [x] 1.2 Remove auto-anki toggle UI from reader sidebar and mobile vocab sheet (or rename to non-Anki IDs/labels if still needed)
- [x] 1.3 Remove Anki-related CSS (`.vocab-card-anki-btn`, auto-anki toggle styles)

## 2. Remove Anki Code
- [x] 2.1 Remove `js/anki-service.js` and imports/usages
- [x] 2.2 Remove Anki export logic from `js/views/reader/vocab-panel.js`
- [x] 2.3 Remove Anki settings persistence from `js/storage.js`

## 3. Preserve Study Behavior Without Anki
- [x] 3.1 Update `js/core/auto-study.js` to read/write a dedicated auto-study preference (not tied to Anki)
- [x] 3.2 Update `js/ui/settings-modal.js` to remove Anki save/load paths

## 4. Mobile Reading Controls
- [x] 4.1 Add a reader UI button (Apple Books-style typography) to open Reading settings while reading
- [x] 4.2 Update settings modal controller to support opening directly to the Reading tab
- [x] 4.3 Ensure settings modal layout remains usable on small screens (scrolling/overflow as needed)

## 5. Manual Validation
- [x] 5.1 Desktop: open reader → open typography control → changes apply live + persist
- [x] 5.2 Mobile: open reader → open typography control → changes apply live + persist
- [x] 5.3 Verify no remaining Anki UI and no `localhost:8765` requests
