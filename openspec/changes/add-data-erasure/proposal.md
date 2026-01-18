# Change: Data Erasure in Settings

## Why
Users need a safe way to fully reset the app without deleting their account so they can start fresh on the same login.

## What Changes
- Add a new Settings tab for Data Management with an Erase All Data flow.
- Require a typed confirmation to prevent accidental deletion.
- Delete all user data (books, vocabulary, progress, storage files, local caches) while preserving the Supabase Auth account.

## Impact
- Specs: `settings-ui`.
- Code: settings modal UI, new deletion orchestration helper, Supabase storage/table cleanup, IndexedDB + localStorage reset.
- Data: destructive user-scoped delete across tables + storage buckets.
