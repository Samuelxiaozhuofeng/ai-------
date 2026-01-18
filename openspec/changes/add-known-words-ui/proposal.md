# Change: Add Known Words stats and detail modal

## Why
Users need quick visibility into their known-word progress and a focused list view without leaving the bookshelf view.

## What Changes
- Add a Known Words stats card in the bookshelf header showing total and today counts
- Add a modal with tabs for all known words vs. today's known words, with search, language filter, and pagination
- Add UI wiring and data access helpers to query known words from IndexedDB

## Impact
- Affected specs: vocab-library
- Affected code: index.html, styles/components/known-words.css, styles/main.css, js/ui/known-words-ui.js, js/ui/dom-refs.js, js/app.js, js/db.js, README.md
