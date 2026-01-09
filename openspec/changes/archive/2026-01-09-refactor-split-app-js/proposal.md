# Change: Refactor frontend by splitting `js/app.js`

## Why
`js/app.js` is ~3,300 LOC and mixes unrelated responsibilities (DOM refs, event wiring, view routing, modals, bookshelf rendering, reader logic, review logic, settings). This increases regression risk, makes changes hard to review, and drives duplication (modals + view switching + bookshelf rendering).

This change refactors the frontend to be modular while preserving behavior.

## What Changes
- Split `js/app.js` into focused modules (UI, routing, views, utilities) while keeping the existing vanilla ES module setup (no bundler).
- Introduce a reusable `ModalManager` to remove repetitive open/close/overlay-click/escape logic across modals.
- Introduce a `ViewRouter` to centralize view show/hide and view transition side effects.
- Refactor bookshelf rendering to reduce grid/list duplication and move to event delegation.
- (Optional / later) Organize `styles/main.css` into smaller files and reduce repeated `index.html` modal/form markup using templates.

## Impact
- Affected code:
  - `js/app.js` (main refactor; size reduced significantly)
  - **NEW** modules under `js/core/`, `js/ui/`, `js/views/`, `js/utils/`
  - `index.html` (script imports may change; DOM ids remain stable)
  - `styles/main.css` (small adjustments; optional modular split later)
- Non-goals:
  - No new features or UX redesign
  - No schema changes to IndexedDB
  - No dependency / tooling changes (still pure HTML/CSS/JS)

## Risks & Mitigations
- **Regression risk** from moving code:
  - Keep DOM ids and public module APIs stable.
  - Migrate in small steps (utilities → modal manager → router → views).
  - Use a manual smoke checklist after each task block (import, read, analyze, review, sync, settings, vocab library, rename/delete).

