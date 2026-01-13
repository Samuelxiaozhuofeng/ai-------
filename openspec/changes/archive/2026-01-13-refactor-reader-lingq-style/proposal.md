# Change: Refactor Reader to LingQ-style Experience with Backend Support

## Why
The current reader uses continuous scrolling and basic word marking without progress tracking. Users need a more immersive, book-like reading experience similar to LingQ, with:
- Page-flip navigation instead of scrolling
- Word status tracking (new → learning → known)
- A backend to persist vocabulary and reading progress across devices

This change transforms Language Reader into a more powerful language learning tool with Apple Books-inspired aesthetics.

## What Changes

### UI/UX Changes
- **BREAKING**: Replace continuous scroll with **page-flip mode** (swipe/click to turn pages)
- **BREAKING**: Remove left sidebar chapter list, replace with **in-page navigation** (progress bar + prev/next buttons)
- Add **word status colors**: 🔵 blue (new), 🟡 yellow (learning), ⚪ white (known)
- Enhance **Apple Books aesthetic**: refined typography, elegant page transitions, minimal chrome
- Add **reading progress indicator**: mini progress bar showing chapter/book completion
- Improve **dark mode**: deeper contrast, comfortable night reading

### Data Model Changes
- **BREAKING**: New word status model (`new` | `learning` | `known`) replaces simple marks
- Add vocabulary items with metadata: word, context, status, timestamp, AI analysis
- Add reading progress: book_id, chapter_id, page_number, scroll_position

### Backend Changes (NEW)
- **NEW**: Python FastAPI backend for data persistence
- **NEW**: SQLite database for vocabulary and progress storage
- **NEW**: REST API endpoints for CRUD operations
- **NEW**: Data sync between frontend IndexedDB and backend

## Impact

### Affected Specs (New)
- `reader-interface` - Page-flip mode, navigation, progress bar
- `word-status` - Word tracking system with status colors
- `backend-api` - REST API for persistence

### Affected Code
| Area | Files | Changes |
|------|-------|---------|
| UI | `index.html` | Remove left sidebar, add page container, navigation controls |
| Styles | `styles/main.css` | Page-flip animations, word status colors, Apple Books refinements |
| Reader Logic | `js/app.js` | Page calculation, flip navigation, status management |
| Marker | `js/marker.js` | Word status integration, color-coded highlighting |
| Database | `js/db.js` | New schemas for word status and progress |
| **NEW** Backend | `backend/` | FastAPI server, SQLite, API routes |

### Migration
- Existing marked words will be migrated to `learning` status
- Existing reading progress will be preserved
- No data loss expected

## Out of Scope
- Audio playback support
- Mobile-responsive design
- Real-time sync across devices (future enhancement)
