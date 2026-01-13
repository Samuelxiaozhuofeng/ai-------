# Tasks: Auto Analysis on Click + Drag-Select Phrase Lookup

## 1. Auto Analysis Flow
- [x] 1.1 Make word click trigger analysis whenever AI is configured and analysis is missing
- [x] 1.2 Debounce analysis and ignore/cancel stale in-flight results
- [x] 1.3 Keep persistence rules: persist only for `learning` or existing saved vocab entries

## 2. Vocabulary Panel UI
- [x] 2.1 Remove text "分析" button from the selected-word actions
- [x] 2.2 Add a small retry icon button when analysis is missing (click to retry)
- [x] 2.3 Add a loading state while analysis is running

## 3. AutoStudy Behavior Alignment
- [x] 3.1 Remove the special-case auto-add for `seen` words when AutoStudy is OFF
- [x] 3.2 Keep existing AutoStudy toggle control and storage behavior

## 4. Drag-Select Phrase Lookup
- [x] 4.1 Add mouse/touch selection handler in reading content to detect selected text
- [x] 4.2 Trigger the same instant analysis for selected phrases (no status changes)
- [x] 4.3 Ensure selection does not fight with single-word click handling

## 5. Manual Verification
- [x] 5.1 Click word: shows loading then analysis without pressing "分析"
- [x] 5.2 Rapid clicks: only latest selection completes; no UI corruption
- [x] 5.3 Drag-select phrase: analysis renders; no vocab status changes
- [x] 5.4 AutoStudy ON/OFF: status changes only when ON
