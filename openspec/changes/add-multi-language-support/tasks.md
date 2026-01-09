# Tasks: Add Multi-Language Support

## 1. Data Layer

- [x] 1.1 Add `SUPPORTED_LANGUAGES` constant to `storage.js` with `{ en: '英语', es: '西班牙语', ja: '日语' }`
- [x] 1.2 Extend book schema in `db.js` to include `language` field (required string)
- [x] 1.3 Extend vocabulary item schema in `db.js` to include `language` field
- [x] 1.4 Extend global vocabulary schema in `db.js` to include `language` field
- [x] 1.5 Add migration logic in `initDB()` to detect and clear legacy data without language field
- [x] 1.6 Add `FSRS_SETTINGS_KEY` to storage.js with `getFsrsSettings()` and `saveFsrsSettings()` functions
- [x] 1.7 Define FSRS settings schema: `{ reviewMode: 'grouped' | 'mixed', requestRetention: 0.9 }`

## 2. Import Flow UI

- [x] 2.1 Add language selection modal HTML to `index.html` with three language buttons
- [x] 2.2 Style the language selection modal in `main.css`
- [x] 2.3 Create `openLanguageSelectModal()` and `closeLanguageSelectModal()` functions in `app.js`
- [x] 2.4 Modify `handleFileImport()` to show language modal before parsing EPUB
- [x] 2.5 Pass selected language to `saveBook()` when storing new book
- [x] 2.6 Handle cancel case: close modal and abort import if no language selected

## 3. Bookshelf UI

- [x] 3.1 Add language filter tabs HTML to bookshelf header in `index.html`
- [x] 3.2 Style language filter tabs in `main.css` (active state, hover, etc.)
- [x] 3.3 Add state variable `currentLanguageFilter` in `app.js` (default: 'en')
- [x] 3.4 Store/restore `currentLanguageFilter` in localStorage
- [x] 3.5 Modify `renderBookshelf()` to filter books by `currentLanguageFilter`
- [x] 3.6 Add click handlers for language tabs to update filter and re-render
- [x] 3.7 Hide tabs with zero books (optional: show all tabs but dim empty ones)

## 4. Per-Language Review Buttons

- [x] 4.1 Add review buttons container HTML to bookshelf header
- [x] 4.2 Style review buttons in `main.css`
- [x] 4.3 Create `countDueCardsByLanguage()` function in `db.js` or `srs-service.js`
- [x] 4.4 Modify bookshelf render to dynamically show review buttons with due counts
- [x] 4.5 Add click handlers for per-language review buttons
- [x] 4.6 Modify `switchToReview()` to accept optional `language` parameter
- [x] 4.7 Modify mixed-mode review to show single combined button if FSRS setting is 'mixed'

## 5. FSRS Settings Tab

- [x] 5.1 Add FSRS tab button to settings modal tabs in `index.html`
- [x] 5.2 Add FSRS settings content section with radio buttons and slider
- [x] 5.3 Style FSRS settings content in `main.css`
- [x] 5.4 Add event listeners for FSRS tab switching
- [x] 5.5 Load FSRS settings into form on modal open
- [x] 5.6 Save FSRS settings on settings save button click
- [x] 5.7 Connect Request Retention slider to actual FSRS algorithm in `srs-service.js`

## 6. Review Flow Updates

- [x] 6.1 Modify `getDueCards()` in `srs-service.js` to accept optional `language` filter
- [x] 6.2 Modify `getReviewStats()` to accept optional `language` filter
- [x] 6.3 Update review session initialization to respect language filter or mixed mode
- [x] 6.4 Update review UI header to show current language (if grouped mode)

## 7. AI Service: Language-Specific Prompts

- [x] 7.1 Create prompt template constants for English, Spanish, Japanese
- [x] 7.2 Modify `analyzeWordInstant()` to accept `language` parameter
- [x] 7.3 Select appropriate prompt template based on language
- [x] 7.4 Pass book language to AI analysis calls from `app.js`
- [x] 7.5 Update response parsing if needed for different language outputs

## 8. Vocabulary Panel Updates

- [x] 8.1 Display language-specific fields in vocabulary analysis panel (e.g., furigana for Japanese)
- [x] 8.2 Update vocabulary list to show language badge if viewing mixed content (optional)

## 9. Integration & Polish

- [x] 9.1 Test import flow for each language
- [x] 9.2 Test bookshelf filtering for each language
- [x] 9.3 Test per-language review session
- [x] 9.4 Test mixed review session
- [x] 9.5 Test FSRS settings persistence
- [x] 9.6 Test legacy data migration (create fake legacy data, verify cleanup)
- [x] 9.7 Review all Chinese UI strings for consistency
