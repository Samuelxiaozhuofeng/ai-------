## ADDED Requirements

### Requirement: Page-Flip Reading Mode
The reader SHALL display chapter content in discrete pages that fit within the viewport, allowing users to navigate between pages with flip gestures or button clicks.

#### Scenario: User views a chapter in page mode
- **WHEN** user opens a chapter
- **THEN** content is paginated to fit viewport height
- **AND** current page number and total pages are displayed
- **AND** navigation controls (prev/next) are visible

#### Scenario: User navigates to next page
- **WHEN** user clicks the next button or presses right arrow key
- **THEN** content transitions to the next page with smooth animation
- **AND** progress indicator updates

#### Scenario: User navigates to previous page
- **WHEN** user clicks the prev button or presses left arrow key
- **THEN** content transitions to the previous page
- **AND** if on first page, navigation to previous chapter is triggered

#### Scenario: User reaches end of chapter
- **WHEN** user is on the last page and clicks next
- **THEN** system prompts or navigates to the next chapter

---

### Requirement: In-Page Chapter Navigation
The reader SHALL provide in-page navigation controls replacing the left sidebar, including a progress bar and chapter selector.

#### Scenario: User views reading progress
- **WHEN** user is reading a chapter
- **THEN** a mini progress bar shows current position in chapter
- **AND** overall book progress percentage is displayed
- **AND** current chapter name is visible in header

#### Scenario: User selects a different chapter
- **WHEN** user clicks on chapter indicator in header
- **THEN** a dropdown or modal displays all chapters
- **AND** user can click to navigate to any chapter

#### Scenario: Progress is persisted
- **WHEN** user navigates between pages or chapters
- **THEN** current position (chapter + page) is saved to storage
- **AND** on next app load, user resumes from saved position

---

### Requirement: Word Tokenization for Interactivity
The reader SHALL wrap each word in the chapter content with an interactive element, enabling click-to-reveal vocabulary features.

#### Scenario: Chapter content is rendered with clickable words
- **WHEN** a chapter is loaded
- **THEN** each word is wrapped in a `<span>` element with data attributes
- **AND** words are clickable for vocabulary lookup

#### Scenario: User clicks on a word
- **WHEN** user clicks on any word in the reading content
- **THEN** the word is highlighted
- **AND** vocabulary panel updates with word information
- **AND** AI analysis is triggered if word is new

---

### Requirement: Apple Books Visual Design
The reader SHALL follow Apple Books design principles with elegant typography, refined spacing, and subtle visual effects.

#### Scenario: Reader displays Apple Books aesthetic
- **WHEN** user views the reader interface
- **THEN** typography uses serif font optimized for reading
- **AND** generous margins and line spacing are applied
- **AND** page has subtle shadow/depth effect
- **AND** header/footer use frosted glass effect

#### Scenario: Dark mode provides comfortable reading
- **WHEN** user enables dark mode
- **THEN** background uses dark gray (not pure black)
- **AND** text uses warm off-white for reduced eye strain
- **AND** word highlight colors are adjusted for dark background
