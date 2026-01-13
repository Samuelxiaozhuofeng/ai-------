## ADDED Requirements

### Requirement: Cloud Processing Job
The system SHALL enqueue a cloud processing job when a logged-in user imports a book.

#### Scenario: User imports a Japanese EPUB
- **WHEN** the user selects language `ja` and uploads an EPUB
- **THEN** the system uploads the source file to Supabase Storage
- **AND** creates a job with status `queued`
- **AND** the UI displays progress until completion

---

### Requirement: TOC-Based Chapter Extraction
The processing worker SHALL extract chapters according to the EPUB table-of-contents (EPUB3 `nav.xhtml` preferred, EPUB2 `toc.ncx` fallback).

#### Scenario: EPUB3 TOC with fragments
- **GIVEN** a TOC entry points to `chapter.xhtml#sec2`
- **WHEN** processing runs
- **THEN** the chapter content is extracted starting at the fragment
- **AND** stops before the next TOC fragment in the same file (if present)

---

### Requirement: Japanese Pre-Tokenization
For Japanese books, the worker SHALL generate Kuromoji-based tokens with offsets aligned to the frontend canonical text rules.

#### Scenario: Tokens match frontend canonicalText
- **WHEN** a processed Japanese chapter is downloaded to the client
- **THEN** the client can populate its token cache using `bookId`, `chapterId`, and `textHash`
- **AND** reader rendering does not require in-browser dictionary downloads

---

### Requirement: Source Deletion After Success
The system SHALL delete the source EPUB from Storage after processing completes successfully.

#### Scenario: Successful processing deletes source
- **WHEN** the job reaches `done`
- **THEN** the source object is removed from Storage
- **AND** the processed bundle remains accessible

---

### Requirement: User-Visible Progress and Retry
The system SHALL expose job status, progress, and errors to the UI and support retry.

#### Scenario: Processing fails
- **WHEN** processing errors
- **THEN** the UI shows an error state for the book
- **AND** the user can trigger a retry which enqueues a new job

