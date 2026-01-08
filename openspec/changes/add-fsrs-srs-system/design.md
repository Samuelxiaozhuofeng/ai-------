# Design: FSRS-based Spaced Repetition System

## Context

### Current State
- **Word Status**: Three-state model (`new` | `learning` | `known`)
- **Status Transitions**: Manual only (click word → UI action)
- **Review**: None (users rely on external tools like Anki)
- **Vocabulary Scope**: Per-book (same word in different books = separate entries)
- **Auto Toggle**: Exists for Anki export, needs repurposing

### Target State
- **Word Status**: Four-state model (`new` | `seen` | `learning` | `known`)
- **Status Transitions**: Automatic (page-turn) + Manual (click)
- **Review**: Built-in FSRS-powered review interface
- **Vocabulary Scope**: Global (cross-book merging for learning words)
- **Auto Toggle**: Controls whether click = auto-learning

## Goals / Non-Goals

### Goals
- Provide effective vocabulary retention through FSRS scheduling
- Reduce friction with automatic status progression on page turns
- Create a unified review experience across all books
- Maintain simplicity with minimal configuration

### Non-Goals
- Custom FSRS parameter tuning (use defaults)
- Review history/analytics dashboard
- Spaced repetition for sentences/phrases (words only)
- Syncing FSRS state to backend (IndexedDB only for now)

## Decisions

### Decision 1: Word Status State Machine

**Choice**: Four-state model with two parallel paths

```
           PASSIVE PATH (no interaction)
           ┌──────────────────────────────┐
           │                              │
     page-turn(1st)              page-turn(2nd)
new ─────────────────→ seen ─────────────────→ known
  │                      │                       ▲
  │ click                │ click                 │
  ▼                      ▼                       │
learning ────────────────────────────────────────┘
           user marks as "known" (deletes FSRS card)
```

**State Definitions**:
| Status | Color | Meaning | FSRS Card |
|--------|-------|---------|-----------|
| `new` | 🔵 Blue | Never seen before | ❌ No |
| `seen` | 🟢 Green | Encountered once, not studied | ❌ No |
| `learning` | 🟡 Yellow | Actively studying | ✅ Yes |
| `known` | ⚪ White/None | Mastered, no review needed | ❌ No (deleted) |

**Rationale**:
- `seen` acts as a "probably known" buffer - if a user reads past a word twice without looking it up, they likely know it
- This reduces the cognitive load of marking every known word manually
- `learning` is the only state that enters FSRS, keeping the review queue focused

### Decision 2: Page Turn Logic

**Choice**: Track word encounters per book session, apply transitions on page turn

**Algorithm**:
```javascript
onPageTurn(previousPageWords) {
  for (word of previousPageWords) {
    if (word.wasClicked) continue;  // User interacted, skip auto-marking
    
    switch (word.status) {
      case 'new':
        word.status = 'seen';
        word.encounterCount = 1;
        break;
      case 'seen':
        if (word.encounterCount >= 1) {
          word.status = 'known';
        }
        break;
      // 'learning' and 'known' are not affected
    }
  }
}
```

**Key Points**:
- Only `new` and `seen` words are affected
- `learning` words are immune to auto-marking (user explicitly wants to study)
- Encounter count is tracked to ensure "second encounter" rule works

### Decision 3: Global Vocabulary Store

**Choice**: Separate IndexedDB store for global vocabulary, linked by normalized word

**Data Model**:
```javascript
// Per-book vocabulary (existing, modified)
{
  id: "book123:ubiquitous",     // bookId:normalizedWord
  bookId: "book123",
  word: "ubiquitous",
  normalizedWord: "ubiquitous",
  status: "learning",           // book-local status
  context: "AI is becoming ubiquitous...",
  chapterId: "ch01",
  createdAt: "2026-01-08T12:00:00Z"
}

// Global vocabulary (NEW) - for FSRS
{
  id: "ubiquitous",             // normalizedWord only
  normalizedWord: "ubiquitous",
  displayWord: "ubiquitous",    // Original casing from first encounter
  
  // AI Analysis (stored once, used in review)
  meaning: "存在于各处的",
  usage: "This word is often used in tech contexts...",
  contextualMeaning: "In this context, it means...",
  
  // FSRS Card Data
  fsrs: {
    due: "2026-01-10T12:00:00Z",
    stability: 1.0,
    difficulty: 5.0,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 0,  // 0=New, 1=Learning, 2=Review, 3=Relearning
    last_review: "2026-01-08T12:00:00Z"
  },
  
  // Metadata
  createdAt: "2026-01-08T12:00:00Z",
  updatedAt: "2026-01-08T15:00:00Z",
  sourceBooks: ["book123", "book456"]  // Which books contain this word
}
```

**Rationale**:
- Allows reviewing the same word once, even if encountered in multiple books
- Keeps per-book context separate (different contexts in different books)
- FSRS data lives in global store only

### Decision 4: FSRS Implementation

**Choice**: Use `ts-fsrs` via ESM CDN (no bundler needed)

**Implementation Options**:
| Option | Pros | Cons |
|--------|------|------|
| npm + bundler | Official support | Breaks current no-bundler convention |
| **ESM CDN (esm.sh)** ✓ | Works with ES modules, no build step | CDN dependency |
| Self-implement | No dependencies | Complex, error-prone |

**Integration**:
```javascript
// Import via CDN
import { FSRS, createEmptyCard, Rating } from 'https://esm.sh/ts-fsrs@4';

// Create card when word becomes "learning"
function createFSRSCard(word) {
  return {
    ...word,
    fsrs: createEmptyCard(new Date())
  };
}

// Get next review on rating
function reviewCard(card, rating) {
  const f = new FSRS();
  const result = f.repeat(card.fsrs, new Date());
  return result[rating].card;
}
```

**FSRS Rating Mapping**:
| Button | FSRS Rating | Meaning |
|--------|-------------|---------|
| Again | `Rating.Again` | Forgot completely |
| Hard | `Rating.Hard` | Recalled with difficulty |
| Good | `Rating.Good` | Recalled correctly |
| Easy | `Rating.Easy` | Recalled instantly |

### Decision 5: Review Interface Design

**Choice**: Full-page review mode with card-flip interaction

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  [← Back to Bookshelf]     📚 Review Session                │
│                            Due: 15 | New: 3 | Total: 42     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                      ubiquitous                             │
│                                                             │
│    ─────────────────────────────────────────────────────    │
│                                                             │
│    💡 Meaning: 存在于各处的                                  │
│                                                             │
│    📖 Usage: Commonly used in technology and academic        │
│    contexts to describe something that is everywhere.       │
│                                                             │
│    🔍 Context: "AI is becoming ubiquitous in our daily      │
│    lives, from smartphones to smart homes."                 │
│                                                             │
│    📝 Contextual Meaning: Here it emphasizes the rapid      │
│    spread of AI technology into everyday applications.      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   [Again]        [Hard]        [Good]        [Easy]         │
│   <1m            <10m          1d            4d             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Shows next review interval under each button
- Keyboard shortcuts: 1=Again, 2=Hard, 3=Good, 4=Easy
- Progress indicator (cards remaining)
- "Finish" button when queue is empty

### Decision 6: Auto Toggle Behavior

**Choice**: Repurpose existing Auto toggle for "auto-learning" mode

**Behavior**:
| Auto Toggle | On Click Word | Effect |
|-------------|---------------|--------|
| ON ✅ | Click any `new`/`seen` word | → `learning` + create FSRS card + show AI analysis |
| OFF ❌ | Click any word | → show AI analysis only, no status change |
| OFF ❌ | Click "Add to Study" button | → `learning` + create FSRS card |

**UI Change**:
- Rename toggle label from "Auto Add to Anki" to "Auto Add to Study"
- Add explicit "Add to Study" button in word popup for manual mode

## Risks / Trade-offs

### Risk 1: CDN Dependency for FSRS
**Risk**: App won't work offline if CDN is down
**Mitigation**: 
- Cache the library in service worker (future enhancement)
- For now, document this limitation
- Could bundle later if needed

### Risk 2: Large Global Vocabulary Store
**Risk**: Performance issues with thousands of words
**Mitigation**:
- Use IndexedDB indexes for efficient querying
- Only load due cards at review time
- Implement pagination in vocabulary list

### Risk 3: AI Content Not Available
**Risk**: Review cards without meaning/usage if AI call failed
**Mitigation**:
- Show word and context (always available)
- Allow reviewing without AI content
- Encourage users to regenerate AI analysis

## Migration Plan

### Phase 1: Data Schema Update
1. Add `seen` status to word-status.js
2. Update IndexedDB schema for global vocabulary store
3. Migrate existing `learning` words to global store with default FSRS params

### Phase 2: Page Turn Logic
1. Implement encounter tracking
2. Add page-turn status transitions
3. Update UI colors for `seen` state

### Phase 3: FSRS Integration
1. Import ts-fsrs from CDN
2. Create srs-service.js module
3. Wire up card creation/review logic

### Phase 4: Review Interface
1. Add review view to index.html
2. Implement review logic in app.js
3. Style review cards

### Rollback
- Feature flag to disable SRS features
- Global vocabulary store is additive (doesn't break existing per-book data)
- Can revert to three-state model by ignoring `seen` status

## Resolved Design Decisions

The following decisions were confirmed by the user:

1. **Review order**: Cards SHALL be presented in **random order** to prevent predictability and improve long-term retention.
2. **Daily limits**: There SHALL be **no limit** on the number of cards reviewed per day. Users can review as many cards as they want.
3. **Seen color**: The `seen` status SHALL use **light green** (#90EE90 or similar) to visually distinguish from `new` (blue) and `learning` (yellow).

