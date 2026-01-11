# Project Context

## Purpose
**Language Reader** (📚 我的书架) is an AI-powered EPUB reader designed for language learners. It enables users to:
- Import and read EPUB books in a clean, distraction-free interface
- Click words to view **instant AI explanations** and manage word learning status (**new → seen → learning → known**)
- Get chapter-level analysis with summaries, key themes, and vocabulary lists
- Review vocabulary via a built-in **FSRS**-based spaced repetition session (cross-book)
- Persist vocabulary status and reading progress (chapter + page) across sessions
- Optionally sync vocabulary + progress to a lightweight backend (FastAPI + SQLite)

The app provides a bilingual experience (Chinese/English UI) and supports multiple reading levels (beginner, intermediate, advanced) for customized learning.

## Tech Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES Modules)
- **Styling**: Custom CSS with CSS variables for theming (dark/light mode)
- **Typography**: Inter font (Google Fonts)
- **EPUB Parsing**: JSZip (CDN) for EPUB extraction and processing
- **Data Storage**: 
  - IndexedDB for book data and chapter content
  - IndexedDB for vocabulary status and page-level progress
  - localStorage for user settings, theme, layout preferences, and optional sync config
- **AI Integration**: OpenAI-compatible API for vocabulary and chapter analysis
- **Backend (Optional)**: Python FastAPI + SQLite (for persistence across devices)

## Project Conventions

### Code Style
- **Pure JavaScript**: No TypeScript, no build tools, no bundlers
- **ES Modules**: All JS files use `import`/`export` syntax
- **JSDoc Comments**: Functions are documented with `@param` and `@returns` annotations
- **Naming Conventions**:
  - `camelCase` for functions and variables
  - `PascalCase` for classes (e.g., `MarkerManager`)
  - `UPPER_SNAKE_CASE` for constants (e.g., `DB_NAME`, `STORAGE_KEYS`)
  - Element IDs use `camelCase` (e.g., `bookshelfView`, `chaptersList`)
- **Async/Await**: Prefer async/await over raw Promises
- **Chinese Comments**: Some inline comments and UI strings are in Chinese

### Architecture Patterns
- **Modular Design**: Code is split into focused modules under `/js/`:
  - `app.js` - Main application logic and UI coordination
  - `epub-parser.js` - EPUB file parsing and chapter extraction
  - `word-status.js` - Word normalization + status helpers
  - `sync-service.js` - Optional backend sync (vocabulary + progress)
  - `ai-service.js` - AI API calls for vocabulary and chapter analysis
  - `db.js` - IndexedDB operations for book persistence
  - `storage.js` - localStorage for settings and preferences
- **Single Page Application**: One `index.html` with view switching (bookshelf ↔ reader ↔ review)
- **Event-Driven UI**: DOM event listeners coordinated in `setupEventListeners()`
- **Progressive Enhancement**: Core reading works without AI; AI features enhance the experience

### Testing Strategy
- **Manual Testing**: Currently no automated tests
- **Local Development**: Run via `python3 -m http.server 8000` (or any static server)
- **Browser DevTools**: Use for debugging and network inspection

### Git Workflow
- **Main Branch**: Primary development branch
- **Commit Style**: Descriptive commit messages in English
- **No CI/CD**: Simple project without automated pipelines

## Domain Context
This is a **language learning application** that helps readers study foreign language books. Key concepts:

- **Vocabulary Tracking**: Words can be passively auto-marked on page turn (`new → seen → known`) or actively added to study (`learning`)
- **Contextual Analysis**: AI explains words within their sentence context, not just dictionary definitions
- **Chapter Analysis**: AI provides summaries, themes, and vocabulary lists adjusted to the user's reading level
- **FSRS Review**: Learning words are scheduled globally (one card per word across all books) and reviewed with Again/Hard/Good/Easy
- **Reading Progress**: Tracked per book and persisted in IndexedDB

## Important Constraints
- **Backend Optional**: App works offline with IndexedDB; backend sync is optional
- **CORS**: AI API must allow browser requests
- **Browser Storage Limits**: IndexedDB is used for large book data; localStorage for small settings
- **EPUB Only**: Only EPUB format is supported (no PDF, MOBI, etc.)

## External Dependencies
| Service | URL | Purpose |
|---------|-----|---------|
| OpenAI-compatible API | Configurable (`apiUrl` setting) | Vocabulary and chapter analysis |
| Optional Backend | `http://localhost:8000` | Vocabulary + progress sync (FastAPI) |
| Google Fonts | `fonts.googleapis.com` | Inter font family |
| JSZip CDN | `cdnjs.cloudflare.com/ajax/libs/jszip` | EPUB file extraction |
