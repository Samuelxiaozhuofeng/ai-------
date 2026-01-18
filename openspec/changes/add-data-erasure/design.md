## Context
Users want a safe, irreversible way to wipe all reading data while keeping their login. This requires a destructive flow in settings, with a strong confirmation gate and careful delete ordering.

## Goals / Non-Goals
- Goals:
  - Add a "Data Management" settings tab and a two-step confirmation flow.
  - Delete all user-scoped data in Supabase and local caches.
  - Preserve the Supabase Auth account and allow re-login.
- Non-Goals:
  - Data export or selective deletion.
  - Account deletion.

## Decisions
- Use a typed confirmation ("DELETE") to enable the final action.
- Delete Supabase data in a safe order (children before parents), then clear IndexedDB + localStorage.
- Keep the user signed in but redirect to empty library after completion.

## Risks / Trade-offs
- Partial deletion due to network failures; mitigate by continuing deletions and showing a summary.
- Accidental use; mitigate with explicit warnings and typed confirmation.

## Migration Plan
- No schema changes. Pure UI + client-side deletion calls.

## Open Questions
- None.
