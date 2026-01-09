# Tasks: Split `js/app.js` and remove duplication

## 0. Baseline (manual smoke checklist)
- [x] 0.1 Import an EPUB and open it from bookshelf
- [x] 0.2 Page navigation works (prev/next + ←/→)
- [x] 0.3 Word click selects + shows vocab panel; status changes still persist
- [x] 0.4 Review view loads due cards; rating buttons + keyboard shortcuts work
- [x] 0.5 Settings modal opens/closes; model fetch still works; sync toggle still works
- [x] 0.6 Vocab library opens; edit/delete vocab modals work
- [x] 0.7 Bookshelf context menu rename/delete works

## 1. Extract low-risk utilities
- [x] 1.1 Move `showNotification()` into `js/ui/notifications.js`
- [x] 1.2 Move tokenization helpers (`getWordRegex`, `tokenizeParagraphInto`, etc.) into `js/utils/tokenizer.js`
- [x] 1.3 Keep runtime behavior identical (module boundaries only)

## 2. Centralize DOM references
- [x] 2.1 Create `js/ui/dom-refs.js` to build and export the `elements` object
- [x] 2.2 Update `js/app.js` to import `elements` rather than inline `document.getElementById` calls

## 3. ModalManager (P0)
- [x] 3.1 Create `js/ui/modal-manager.js` with a small API:
  - `open()`, `close()`, `isOpen()`
  - overlay-click close
  - register close buttons
  - optional focus target
- [x] 3.2 Migrate bookshelf modals: rename + delete
- [x] 3.3 Migrate settings modal
- [x] 3.4 Migrate vocab-library modals: edit vocab + delete vocab
- [x] 3.5 Keep special-case async modal (`languageSelectModal`) separate (see 3.6)
- [x] 3.6 Create a dedicated helper for async choice modals (Promise-based) and migrate `languageSelectModal`

## 4. ViewRouter (P1)
- [x] 4.1 Create `js/core/view-router.js` that centralizes show/hide for:
  - `bookshelfView`, `readerView`, `reviewView`, `vocabLibraryView`
- [x] 4.2 Refactor `switchToBookshelf/switchToReader/switchToReview/switchToVocabLibrary` to use router
- [x] 4.3 Ensure view transitions still perform required side effects (save progress, start/stop sync)

## 5. Bookshelf rendering refactor (P1)
- [x] 5.1 Reduce duplication between `renderBooksGrid` and `renderBooksList`:
  - share a single `renderBookItem(book, mode)` helper
  - or unify to one renderer with mode-specific template fragments
- [x] 5.2 Replace per-item listeners with event delegation on the bookshelf container
- [x] 5.3 Keep context menu behavior identical

## 6. Split into view modules (P0/P1; incremental)
- [x] 6.1 Create `js/views/bookshelf.js` and migrate bookshelf-only functions
- [x] 6.2 Create `js/views/review.js` and migrate review-only functions
- [x] 6.3 Create `js/views/vocab-library.js` and migrate vocab library-only functions
- [x] 6.4 Create `js/views/reader.js` and migrate reader-only functions (chapter loading + pagination glue)
- [x] 6.5 Keep `js/app.js` as the orchestrator: global init + dependency wiring only
- [x] 6.6 Further split reader into `js/views/reader/*` submodules (controller/highlighter/pagination/vocab/chapter)

## 7. Optional organization (P2)
- [x] 7.1 Split `styles/main.css` into `styles/base|components|views` with multiple `<link>` tags (avoid `@import` waterfall)
- [x] 7.2 Deferred: Reduce repetitive modal/form markup in `index.html` using `<template>` + JS factory helpers (no behavior change)
