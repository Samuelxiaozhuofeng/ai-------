import { buildTokenizedChapterWrapper, renderTokenizedChapterContent } from '../../utils/tokenizer.js';
import { updatePageProgressCloud } from '../../supabase/progress-repo.js';
import { upsertBookVocabularyItems } from '../../supabase/vocabulary-repo.js';
import { WORD_STATUSES } from '../../word-status.js';

export function createPaginationEngine({
  elements,
  state,
  getCurrentBookLanguage,
  getEffectiveWordStatus,
  applyWordStatusesToContainer
}) {
  let paginationMeasure = null;
  let pageProgressSaveTimer = null;
  /** @type {((index: number, options?: any) => Promise<void>) | null} */
  let loadChapter = null;

  function setLoadChapter(fn) {
    loadChapter = typeof fn === 'function' ? fn : null;
  }

  function ensurePaginationMeasure(heightPx) {
    if (!paginationMeasure) {
      paginationMeasure = document.createElement('div');
      paginationMeasure.className = 'reading-content page-measure';
      paginationMeasure.style.position = 'absolute';
      paginationMeasure.style.left = '-99999px';
      paginationMeasure.style.top = '0';
      paginationMeasure.style.pointerEvents = 'none';
      paginationMeasure.style.visibility = 'hidden';
      paginationMeasure.style.overflow = 'hidden';
      document.body.appendChild(paginationMeasure);
    }

    paginationMeasure.style.width = `${elements.readingContent.clientWidth}px`;
    paginationMeasure.style.height = `${heightPx}px`;
    paginationMeasure.innerHTML = '';
    return paginationMeasure;
  }

  function paginateTokenizedWrapper(wrapper, pageHeightPx) {
    const measure = ensurePaginationMeasure(pageHeightPx);
    const pageWrapper = document.createElement('div');
    measure.appendChild(pageWrapper);

    /** @type {string[]} */
    const pages = [];

    const paragraphs = Array.from(wrapper.children);
    for (const paragraph of paragraphs) {
      const clone = paragraph.cloneNode(true);
      pageWrapper.appendChild(clone);

      if (measure.scrollHeight > pageHeightPx) {
        pageWrapper.removeChild(clone);

        if (pageWrapper.childNodes.length > 0) {
          pages.push(pageWrapper.innerHTML);
          pageWrapper.innerHTML = '';
        }

        pageWrapper.appendChild(clone);
        if (measure.scrollHeight > pageHeightPx) {
          pageWrapper.removeChild(clone);
          splitOversizeParagraphIntoPages(paragraph, measure, pageWrapper, pageHeightPx, pages);
        }
      }
    }

    if (pageWrapper.childNodes.length > 0) {
      pages.push(pageWrapper.innerHTML);
    }

    return pages.length > 0 ? pages : [''];
  }

  function splitOversizeParagraphIntoPages(paragraph, measure, pageWrapper, pageHeightPx, pages) {
    const tokens = Array.from(paragraph.childNodes);
    let start = 0;

    while (start < tokens.length) {
      const maxEnd = findMaxFittingTokenEnd(tokens, start, measure, pageWrapper, pageHeightPx);
      const end = Math.max(start + 1, maxEnd);

      const piece = document.createElement('p');
      for (let i = start; i < end; i++) {
        piece.appendChild(tokens[i].cloneNode(true));
      }
      pageWrapper.appendChild(piece);

      pages.push(pageWrapper.innerHTML);
      pageWrapper.innerHTML = '';
      start = end;
    }
  }

  function findMaxFittingTokenEnd(tokens, start, measure, pageWrapper, pageHeightPx) {
    let low = start + 1;
    let high = tokens.length;
    let best = start;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const probe = document.createElement('p');
      for (let i = start; i < mid; i++) {
        probe.appendChild(tokens[i].cloneNode(true));
      }

      pageWrapper.appendChild(probe);
      const fits = measure.scrollHeight <= pageHeightPx;
      pageWrapper.removeChild(probe);

      if (fits) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }

  function updateProgressUI() {
    if (!state.currentBook) return;

    const totalPages = Math.max(1, state.chapterPages.length || 1);
    const chapterPct = Math.min(1, Math.max(0, (state.currentPageIndex + 1) / totalPages));
    const bookPct = Math.min(1, Math.max(0, (state.currentChapterIndex + chapterPct) / Math.max(1, state.currentBook.chapters.length || 1)));

    if (elements.chapterProgressFill) {
      elements.chapterProgressFill.style.width = `${Math.round(chapterPct * 100)}%`;
    }

    const bookPercentText = `${Math.round(bookPct * 100)}%`;
    if (elements.bookProgressPercent) elements.bookProgressPercent.textContent = bookPercentText;
    if (elements.bookProgressText) elements.bookProgressText.textContent = bookPercentText;
  }

  function updatePageControls() {
    const total = state.chapterPages.length || 1;
    const pageNumber = Math.min(state.currentPageIndex + 1, total);
    elements.pageIndicator.textContent = `${pageNumber} / ${total}`;

    const hasPrev = (state.chapterPages.length > 0) && (state.currentPageIndex > 0 || state.currentChapterIndex > 0);
    const hasNext = (state.chapterPages.length > 0) && (state.currentPageIndex < total - 1 || (state.currentBook && state.currentChapterIndex < state.currentBook.chapters.length - 1));

    if (elements.prevPageBtn) elements.prevPageBtn.disabled = !hasPrev;
    if (elements.nextPageBtn) elements.nextPageBtn.disabled = !hasNext;

    updateProgressUI();
  }

  function renderCurrentPage(direction = 'none') {
    elements.readingContent.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = state.chapterPages[state.currentPageIndex] || '';
    elements.readingContent.appendChild(wrapper);

    state.clickedWordsOnPage = new Set();
    if (state.selectedWordEl) state.selectedWordEl = null;
    applyWordStatusesToContainer(elements.readingContent);
    updatePageControls();
    schedulePageProgressSave();

    const fromX = direction === 'next' ? 18 : direction === 'prev' ? -18 : 0;
    if (fromX !== 0) {
      wrapper.animate(
        [
          { opacity: 0.5, transform: `translateX(${fromX}px)` },
          { opacity: 1, transform: 'translateX(0px)' }
        ],
        { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    }
  }

  function schedulePageProgressSave() {
    if (!state.currentBookId || !state.currentBook) return;
    if (!state.isPageFlipMode) return;

    if (pageProgressSaveTimer) {
      clearTimeout(pageProgressSaveTimer);
    }

    pageProgressSaveTimer = setTimeout(async () => {
      try {
        const chapterId = state.currentBook.chapters?.[state.currentChapterIndex]?.id || null;
        await updatePageProgressCloud(state.currentBookId, { chapterId, pageNumber: state.currentPageIndex, scrollPosition: 0 });
      } catch (error) {
        console.warn('Failed to save page progress:', error);
      }
    }, 250);
  }

  function getCurrentPageWordMap() {
    /** @type {Map<string, string>} */
    const words = new Map();
    elements.readingContent.querySelectorAll('.word').forEach((el) => {
      const normalized = el.dataset.word || '';
      if (!normalized || words.has(normalized)) return;
      words.set(normalized, (el.textContent || normalized).trim() || normalized);
    });
    return words;
  }

  function capturePageTurnSnapshot() {
    return {
      bookId: state.currentBookId,
      chapterId: state.currentBook?.chapters?.[state.currentChapterIndex]?.id || null,
      words: getCurrentPageWordMap(),
      clicked: new Set(state.clickedWordsOnPage)
    };
  }

  async function processPageTurn(snapshot) {
    if (!snapshot?.bookId) return;

    const updates = [];
    snapshot.words.forEach((displayWord, normalizedWord) => {
      const prevCount = state.encounterCountByWord.get(normalizedWord) || 0;
      const nextCount = prevCount + 1;
      state.encounterCountByWord.set(normalizedWord, nextCount);

      if (snapshot.clicked.has(normalizedWord)) return;

      const status = getEffectiveWordStatus(normalizedWord);
      if (status === WORD_STATUSES.NEW && nextCount >= 1) {
        updates.push({
          bookId: snapshot.bookId,
          language: getCurrentBookLanguage(),
          word: normalizedWord,
          displayWord,
          status: WORD_STATUSES.SEEN,
          sourceChapterId: snapshot.chapterId
        });
        return;
      }

      if (status === WORD_STATUSES.SEEN && nextCount >= 2) {
        const existing = state.vocabularyByWord.get(normalizedWord) || {};
        updates.push({
          ...existing,
          bookId: snapshot.bookId,
          language: existing.language || getCurrentBookLanguage(),
          word: normalizedWord,
          displayWord: existing.displayWord || displayWord,
          status: WORD_STATUSES.KNOWN,
          sourceChapterId: existing.sourceChapterId || snapshot.chapterId
        });
      }
    });

    if (updates.length === 0) return;

    try {
      const records = await upsertBookVocabularyItems(updates);
      records.forEach((record) => state.vocabularyByWord.set(record.word, record));
    } catch (error) {
      console.warn('Failed to persist page-turn word statuses:', error);
    }
  }

  function goToPreviousPage() {
    if (!state.isPageFlipMode) return;

    const snapshot = capturePageTurnSnapshot();
    void processPageTurn(snapshot);

    if (state.currentPageIndex > 0) {
      state.currentPageIndex -= 1;
      renderCurrentPage('prev');
      return;
    }

    if (state.currentBook && state.currentChapterIndex > 0) {
      if (loadChapter) {
        void loadChapter(state.currentChapterIndex - 1, { startPage: 'last' });
      }
    }
  }

  function goToNextPage() {
    if (!state.isPageFlipMode) return;

    const snapshot = capturePageTurnSnapshot();
    void processPageTurn(snapshot);

    if (state.currentPageIndex < state.chapterPages.length - 1) {
      state.currentPageIndex += 1;
      renderCurrentPage('next');
      return;
    }

    if (state.currentBook && state.currentChapterIndex < state.currentBook.chapters.length - 1) {
      if (loadChapter) {
        void loadChapter(state.currentChapterIndex + 1, { startPage: 'first' });
      }
    }
  }

  function renderChapterContent(chapterContent, options = {}) {
    if (state.isPageFlipMode) {
      const pageHeight = elements.readingContent.clientHeight || 520;
      const tokenized = buildTokenizedChapterWrapper(chapterContent);
      state.chapterPages = paginateTokenizedWrapper(tokenized, pageHeight);

      if (options?.startPage === 'last') {
        state.currentPageIndex = Math.max(0, state.chapterPages.length - 1);
      } else if (typeof options?.startPage === 'number') {
        state.currentPageIndex = Math.min(Math.max(0, options.startPage), Math.max(0, state.chapterPages.length - 1));
      } else {
        state.currentPageIndex = 0;
      }

      renderCurrentPage('none');
      return;
    }

    state.chapterPages = [];
    state.currentPageIndex = 0;
    renderTokenizedChapterContent(elements.readingContent, chapterContent);
    updatePageControls();
  }

  return {
    renderChapterContent,
    updatePageControls,
    schedulePageProgressSave,
    setLoadChapter,
    goToPreviousPage,
    goToNextPage
  };
}
