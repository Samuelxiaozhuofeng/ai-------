# Tasks: Auto Analysis on Click + Drag-Select Phrase Lookup

## 1. Auto Analysis Flow
- [ ] 1.1 Make word click trigger analysis whenever AI is configured and analysis is missing
- [ ] 1.2 Debounce analysis and ignore/cancel stale in-flight results
- [ ] 1.3 Keep persistence rules: persist only for `learning` or existing saved vocab entries

## 2. Vocabulary Panel UI
- [ ] 2.1 Remove text "分析" button from the selected-word actions
- [ ] 2.2 Add a small retry icon button when analysis is missing (click to retry)
- [ ] 2.3 Add a loading state while analysis is running

## 3. AutoStudy Behavior Alignment
- [ ] 3.1 Remove the special-case auto-add for `seen` words when AutoStudy is OFF
- [ ] 3.2 Keep existing AutoStudy toggle control and storage behavior

## 4. Drag-Select Phrase Lookup
- [ ] 4.1 Add mouse/touch selection handler in reading content to detect selected text
- [ ] 4.2 Trigger the same instant analysis for selected phrases (no status changes)
- [ ] 4.3 Ensure selection does not fight with single-word click handling

## 5. Manual Verification
- [ ] 5.1 Click word: shows loading then analysis without pressing "分析"
- [ ] 5.2 Rapid clicks: only latest selection completes; no UI corruption
- [ ] 5.3 Drag-select phrase: analysis renders; no vocab status changes
- [ ] 5.4 AutoStudy ON/OFF: status changes only when ON

