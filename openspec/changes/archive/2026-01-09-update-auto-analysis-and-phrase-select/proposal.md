# Change: Auto Analysis on Click + Drag-Select Phrase Lookup

## Why
Currently, users often need to manually click the "分析" button after selecting a word during reading. This adds friction to the core workflow (tap → understand → decide to study).

Additionally, users want to select a multi-word phrase (drag selection) and get the same instant AI lookup, which is a common reading behavior.

## What Changes
- **MODIFIED**: Clicking a word in the reading content SHALL automatically trigger AI analysis when no cached analysis is available (and AI is configured).
- **MODIFIED**: The manual "分析" button SHALL be removed from the primary flow; a small retry icon remains available when there is no analysis result yet.
- **NEW**: Analysis triggering SHALL be debounced and previous in-flight requests should be cancelled/ignored to avoid excessive token usage when users click rapidly.
- **NEW**: Users SHALL be able to drag-select a phrase in the reading content to trigger an instant AI lookup (query-only, no vocabulary status changes).
- **MODIFIED**: AutoStudy toggle behavior:
  - **ON**: clicking a word auto-adds it to `learning`
  - **OFF**: clicking a word does NOT change its status (no special-case auto-add)

## Impact
- Affected code: `js/app.js` (reader click/selection handlers, vocabulary panel rendering, analysis orchestration)
- Potentially affected code: `js/ai-service.js` (no API change expected; uses existing `analyzeWordInstant`)

## Non-Goals
- Persisting phrase lookups as vocabulary items
- Changing existing chapter analysis behavior
- Adding a history UI for phrase lookups

