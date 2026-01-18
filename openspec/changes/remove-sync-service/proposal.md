# Change: Remove local-first sync service

## Why
The app now relies on Supabase as the single source of truth, so local-first sync is no longer needed. Removing sync simplifies the architecture and avoids stale or redundant sync behavior.

## What Changes
- Remove the sync service module and all UI/logic that triggers or reports sync
- Remove backend sync API requirement from the spec
- Keep Supabase direct CRUD and existing local caching where applicable

## Impact
- Affected specs: backend-api
- Affected code: js/sync-service.js, js/supabase/*-repo.js, js/ui/settings-modal.js, js/ui/dom-refs.js, index.html, localStorage sync settings
