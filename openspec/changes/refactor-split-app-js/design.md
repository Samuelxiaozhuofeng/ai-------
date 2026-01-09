# Design: Split `js/app.js` into modules

## Goals
- Reduce `js/app.js` size by extracting self-contained concerns into modules.
- Preserve runtime behavior and UI structure (DOM ids/classes stay stable).
- Reduce duplicate patterns (modals, view switching, bookshelf rendering).

## Proposed Module Layout
```
js/
  app.js                 # entrypoint; wires modules together
  core/
    view-router.js        # view switching + transition hooks
  ui/
    dom-refs.js           # DOM lookup in one place
    modal-manager.js      # reusable modal open/close helpers
    notifications.js      # showNotification + (future) toast styling
    theme-manager.js      # initTheme/toggleTheme/applyTheme
  views/
    bookshelf.js          # bookshelf render + handlers
    reader.js             # reader view glue (chapter/page navigation)
    review.js             # review view glue
    vocab-library.js      # vocab library glue + modals
  utils/
    tokenizer.js          # word regex + tokenization helpers
```

## Design Principles
- **Dependency injection**: view modules should accept `elements`, `services` (db/ai/srs), and `state` objects rather than importing global singletons.
- **Single place for DOM refs**: `ui/dom-refs.js` creates a stable shape for all DOM nodes, making it easy to see what the UI depends on.
- **Event delegation**: prefer one click handler on a container rather than N handlers per rendered item (bookshelf cards/list items).
- **Router owns view visibility**: view functions become "enter/exit" hooks; router handles show/hide.
- **ModalManager owns common modal behavior**: overlay-click close, escape close, close buttons, focus management.

## Migration Strategy (low risk)
1. Extract pure utilities first (`tokenizer`, `notifications`), no behavior changes.
2. Introduce `ModalManager`, migrate one modal at a time (rename/delete/settings first).
3. Introduce `ViewRouter` and re-implement `switchTo*` wrappers using it.
4. Move bookshelf rendering + handlers into `views/bookshelf.js` while keeping `app.js` as coordinator.
5. Repeat for `review`, `vocab-library`, then reader (largest surface area).

