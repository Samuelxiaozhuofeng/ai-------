# Design: LingQ-style Reader Refactoring

## Context

### Current State
- **Reading Mode**: Continuous vertical scroll
- **Word Marking**: Simple highlight with Ctrl+B, binary state (marked/unmarked)
- **Navigation**: Left sidebar with chapter list
- **Storage**: IndexedDB for books, localStorage for settings
- **Backend**: None (fully client-side)

### Target State
- **Reading Mode**: Page-flip with smooth transitions
- **Word Marking**: Click words → status tracking (new → learning → known)
- **Navigation**: In-page progress bar + prev/next buttons
- **Storage**: IndexedDB (offline) + SQLite backend (persistence)
- **Backend**: Python FastAPI with REST API

## Goals / Non-Goals

### Goals
- Create immersive, distraction-free reading experience like Apple Books
- Track vocabulary learning progress with visual feedback (colors)
- Persist data reliably with a lightweight backend
- Maintain fast, responsive UI with smooth animations

### Non-Goals
- Mobile-first design (desktop focus)
- Audio/TTS integration
- Multi-device real-time sync
- User authentication (single-user, local deployment)

## Decisions

### Decision 1: Page-Flip Implementation
**Choice**: CSS-based page container with JavaScript pagination

**Rationale**:
- No external library needed
- Smooth CSS transitions for page turns
- Content split by viewport height, not fixed character count
- Supports variable font sizes

**Alternatives Considered**:
| Option | Pros | Cons |
|--------|------|------|
| turn.js library | Real book-flip animation | Heavy, jQuery dependency |
| CSS columns | Native browser support | Poor text selection, complex layout |
| **Viewport pagination** ✓ | Lightweight, flexible | Requires JS calculation |

**Implementation**:
```
┌─────────────────────────────────────────┐
│  Header: Book Title + Progress Bar      │
├─────────────────────────────────────────┤
│                                         │
│           Page Content                  │
│      (viewport-sized container)         │
│                                         │
│    Words are clickable for status       │
│                                         │
├─────────────────────────────────────────┤
│  Footer: [←] Page 3/12 [→] | 25%        │
└─────────────────────────────────────────┘
```

### Decision 2: Word Status System
**Choice**: Three-state model with color coding

**States**:
| Status | Color | Meaning | Trigger |
|--------|-------|---------|---------|
| `new` | 🔵 Blue underline | First encounter | Automatic on render |
| `learning` | 🟡 Yellow background | Saved for study | Click + save |
| `known` | ⚪ No highlight | Mastered | Click "Known" button |

**Data Model**:
```javascript
{
  word: "ubiquitous",
  status: "learning",        // "new" | "learning" | "known"
  context: "AI is becoming ubiquitous...",
  meaning: "存在于各处的",
  createdAt: "2026-01-08T12:00:00Z",
  lastReviewed: "2026-01-08T15:00:00Z",
  bookId: "abc123",
  chapterId: "ch01"
}
```

### Decision 3: Backend Architecture
**Choice**: Python FastAPI + SQLite

**Rationale**:
- FastAPI: Modern, fast, auto-generated OpenAPI docs
- SQLite: Zero-config, file-based, perfect for single-user
- Easy to run alongside the frontend dev server

**Alternatives Considered**:
| Option | Pros | Cons |
|--------|------|------|
| Node.js/Express | Same language as frontend | More boilerplate |
| Go/Gin | Fast, single binary | Overkill for this use case |
| **Python/FastAPI** ✓ | Simple, good DX, batteries included | Requires Python |
| Supabase/Firebase | Managed, real-time | External dependency, overkill |

**API Design**:
```
/api/v1/
├── vocabulary/
│   ├── GET    /           # List all vocabulary
│   ├── POST   /           # Add new word
│   ├── PUT    /{id}       # Update word status
│   └── DELETE /{id}       # Remove word
├── progress/
│   ├── GET    /{book_id}  # Get reading progress
│   └── PUT    /{book_id}  # Update progress
└── sync/
    └── POST   /           # Bulk sync from frontend
```

### Decision 4: Data Sync Strategy
**Choice**: Frontend-first with background sync

**Flow**:
1. All writes go to IndexedDB first (instant response)
2. Background worker syncs to backend every 30 seconds
3. On app load, merge backend data with local
4. Conflict resolution: Last-write-wins with timestamps

### Decision 5: UI Component Library
**Choice**: No library, custom CSS with Apple design tokens

**Rationale**:
- Current CSS is already Apple-inspired
- Adding a library would change the entire look
- Custom CSS gives full control over animations

**Enhancements**:
- Refine CSS variables for Apple Books palette
- Add page-flip transition keyframes
- Create word status color classes
- Implement hover states for interactive words

## Risks / Trade-offs

### Risk 1: Page Break Calculation
**Risk**: Text may break awkwardly mid-paragraph
**Mitigation**: Use CSS `break-inside: avoid` for paragraphs, allow partial overflow with "continue on next page" indicator

### Risk 2: Word Tokenization
**Risk**: Clicking on words requires accurate word boundary detection
**Mitigation**: Wrap each word in `<span>` during render, use regex for tokenization

### Risk 3: Backend Complexity
**Risk**: Adding a backend increases deployment complexity
**Mitigation**: 
- Provide simple `docker-compose.yml` for one-command startup
- Backend is optional; app works offline with IndexedDB only
- Clear documentation for setup

## Migration Plan

### Phase 1: Frontend Refactoring (No backend yet)
1. Implement page-flip mode
2. Add word status colors
3. Update navigation UI
4. Keep all data in IndexedDB

### Phase 2: Backend Integration
1. Create FastAPI backend
2. Add sync service
3. Migrate existing data

### Rollback
- Feature flag to toggle between scroll and page-flip modes
- Backend is additive; frontend works without it

## Open Questions

1. **Page size preference**: Should users be able to adjust how much content appears per page (font size affects this)?
2. **Known word threshold**: Should words automatically become "known" after N encounters?
3. **Backend hosting**: Will this be run locally only, or potentially deployed to a server?
