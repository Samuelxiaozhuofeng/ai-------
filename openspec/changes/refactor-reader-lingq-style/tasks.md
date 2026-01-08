# Tasks: LingQ-style Reader Refactoring

## 1. Foundation & Data Model
- [x] 1.1 Define word status TypeScript/JSDoc types (`new` | `learning` | `known`)
- [x] 1.2 Update IndexedDB schema in `db.js` for vocabulary status tracking
- [x] 1.3 Add migration logic for existing marked words → `learning` status
- [x] 1.4 Create `word-status.js` module for status management logic

## 2. Word Tokenization & Rendering
- [x] 2.1 Create word tokenizer function (split text into clickable spans)
- [x] 2.2 Wrap chapter content words in `<span class="word" data-word="...">` on render
- [x] 2.3 Add CSS classes for word status colors (`.word-new`, `.word-learning`, `.word-known`)
- [x] 2.4 Implement word click handler to update status and trigger sidebar

## 3. Page-Flip Mode
- [x] 3.1 Create page container component with fixed viewport height
- [x] 3.2 Implement pagination algorithm (calculate content per page)
- [x] 3.3 Add page state management (current page, total pages per chapter)
- [x] 3.4 Create page navigation controls (prev/next buttons)
- [x] 3.5 Add keyboard shortcuts (←/→ arrow keys for page flip)
- [x] 3.6 Implement smooth page transition animation (CSS transform)
- [x] 3.7 Handle edge cases: chapter start/end, empty pages

## 4. Navigation & Progress UI
- [x] 4.1 Remove left sidebar chapter list from `index.html`
- [x] 4.2 Add header progress bar (chapter progress + book progress)
- [x] 4.3 Create footer navigation: [← Prev] Page X/Y [Next →]
- [x] 4.4 Add chapter dropdown/modal for quick chapter selection
- [x] 4.5 Implement progress percentage display
- [x] 4.6 Save page position in IndexedDB on navigation

## 5. Apple Books Aesthetic Refinements
- [x] 5.1 Update CSS color palette for refined Apple Books look
- [x] 5.2 Enhance typography: adjust line-height, letter-spacing, margins
- [x] 5.3 Add subtle page shadow/depth effect
- [x] 5.4 Refine dark mode colors for comfortable night reading
- [x] 5.5 Add page turn animation (subtle slide or fade)
- [x] 5.6 Polish header/footer with frosted glass effect

## 6. Sidebar Vocabulary Panel Updates
- [x] 6.1 Update sidebar to show word status indicator (color dot)
- [x] 6.2 Add "Mark as Known" button to vocabulary cards
- [x] 6.3 Add filter tabs: All | Learning | Known
- [x] 6.4 Show vocabulary count per status in panel header
- [x] 6.5 Implement quick status toggle on vocabulary cards

## 7. Backend: FastAPI Setup
- [x] 7.1 Create `backend/` directory structure
- [x] 7.2 Set up FastAPI project with `requirements.txt`
- [x] 7.3 Create SQLite database models (Vocabulary, Progress)
- [x] 7.4 Implement CRUD endpoints for vocabulary
- [x] 7.5 Implement progress endpoints (get/update)
- [x] 7.6 Add CORS middleware for frontend access
- [x] 7.7 Create health check endpoint
- [x] 7.8 Write `docker-compose.yml` for easy deployment

## 8. Frontend-Backend Sync
- [x] 8.1 Create `sync-service.js` module for API communication
- [x] 8.2 Implement background sync worker (every 30 seconds)
- [x] 8.3 Add sync status indicator in UI (synced/syncing/offline)
- [x] 8.4 Implement merge logic for backend → frontend data
- [x] 8.5 Handle offline mode gracefully
- [x] 8.6 Add manual "Sync Now" button in settings

## 9. Testing & Validation
- [ ] 9.1 Test page-flip with various content lengths
- [ ] 9.2 Test word status persistence across page loads
- [ ] 9.3 Test chapter navigation and progress saving
- [ ] 9.4 Test backend API endpoints with curl/httpie
- [ ] 9.5 Test sync behavior (online/offline transitions)
- [ ] 9.6 Test migration of existing books and marks

## 10. Documentation & Cleanup
- [x] 10.1 Update README with new features and backend setup
- [x] 10.2 Document API endpoints
- [x] 10.3 Update `openspec/project.md` with new tech stack
- [x] 10.4 Remove deprecated code and unused CSS
- [x] 10.5 Add user guide for word status system

---

## Dependencies

```
Task 2 depends on Task 1 (data model)
Task 3 depends on Task 2 (need word spans for page calculation)
Task 4 depends on Task 3 (navigation requires page mode)
Task 6 depends on Task 1 and Task 2 (word status)
Task 8 depends on Task 7 (backend must exist)
```

## Parallelizable Work

| Can run in parallel |
|---------------------|
| Task 5 (CSS) with Task 3 (page logic) |
| Task 7 (backend) with Tasks 2-5 (frontend) |
| Task 6 (sidebar) with Task 3-4 (page mode) |
