# Change: Add Zen Mode (Immersive Reading)

## Why
Readers report visual distractions during long sessions. Zen Mode provides a focused, immersive view that hides non-essential UI while preserving navigation and vocabulary workflows.

## What Changes
- Add a Zen Mode toggle in the reader header and a keyboard shortcut (Z).
- Hide header, toolbar, footer, and vocabulary panel in Zen Mode, with edge-reveal behavior.
- Adjust page navigation edge zones and keyboard handling while in Zen Mode.
- Exit Zen Mode when a word is clicked to open the vocabulary panel.

## Impact
- Affected specs: reader-interface
- Affected code: index.html, styles/views/reader.css, js/views/reader/reader-controller.js, js/views/reader/zen-mode-controller.js
