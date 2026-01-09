# Change: Add Multi-Language Support

## Why

Language learners often study multiple foreign languages simultaneously. Currently, the app assumes a single target language (English) for vocabulary analysis, FSRS review, and AI prompts. This prevents users from effectively learning Japanese, Spanish, or other languages in the same application instance.

## What Changes

- **Book Language Selection**: Add a language selection modal when importing EPUB books (English, Spanish, Japanese as initial options)
- **Book Language Storage**: Store language attribute per book in IndexedDB
- **Vocabulary Language Tagging**: All vocabulary items are tagged with their source book's language
- **Bookshelf Language Filter**: Add top tabs to filter books by language (英语 | 西班牙语 | 日语)
- **Per-Language Review Buttons**: Display separate review buttons per language on bookshelf with due counts
- **FSRS Settings Tab**: Add FSRS configuration in Settings with:
  - Review mode toggle (grouped by language vs mixed)
  - Request Retention parameter (default 0.9)
- **Language-Specific AI Prompts**: Different prompt templates for vocabulary analysis:
  - English: Meaning + usage (Chinese-English bilingual)
  - Japanese: Meaning + furigana + kanji origin + politeness level
  - Spanish: Meaning + verb conjugation + noun gender/plurality
- **Data Migration**: Silently clear legacy data without language attributes on first run

## Impact

- Affected code:
  - `js/db.js` - Book schema, vocabulary schema, migration logic
  - `js/storage.js` - FSRS settings storage
  - `js/app.js` - Import flow, bookshelf UI, review entry points
  - `js/ai-service.js` - Language-aware prompt templates
  - `js/srs-service.js` - Language-filtered review queue
  - `index.html` - New UI elements (language tabs, import modal, settings tab)
  - `styles/main.css` - Styling for new components
