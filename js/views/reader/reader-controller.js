import { ModalManager } from '../../ui/modal-manager.js';
import { showNotification } from '../../ui/notifications.js';
import { hideLoading, showLoading } from '../../ui/loading.js';
import { saveLayout, SUPPORTED_LANGUAGES } from '../../storage.js';
import { getBook, makeGlobalVocabId } from '../../db.js';
import { getLanguageFilter } from '../../core/language-filter.js';
import { globalVocabByWord, refreshGlobalVocabCache } from '../../core/global-vocab-cache.js';
import { WORD_STATUSES } from '../../word-status.js';
import { ensureLocalBookCached } from '../../supabase/books-service.js';
import { getReadingProgressCloud } from '../../supabase/progress-repo.js';

import { createWordHighlighter } from './word-highlighter.js';
import { createVocabPanel } from './vocab-panel.js';
import { createPaginationEngine } from './pagination-engine.js';
import { createChapterManager } from './chapter-manager.js';

/**
 * @param {import('../../ui/dom-refs.js').elements} elements
 */
export function createReaderController(elements) {
  const state = {
    currentBook: null,
    currentBookId: null,
    currentChapterIndex: 0,
    isPageFlipMode: true,
    chapterPages: [],
    pageStartCharOffsets: [],
    currentPageIndex: 0,
    chapterTextHash: null,
    vocabularyByWord: new Map(),
    vocabFilter: WORD_STATUSES.LEARNING,
    selectedWordEl: null,
    selectedWord: null,
    selectedWordDisplay: null,
    selectedWordContext: null,
    selectedWordAnalysis: null,
    selectedWordSelectionId: 0,
    selectedWordSelectedAt: 0,
    isSelectedAnalysisLoading: false,
    analysisDebounceTimer: null,
    analysisRequestSeq: 0,
    analysisAbortController: null,
    instantAnalysisCache: new Map(),
    vocabUi: {
      feedbackState: 'idle', // idle | processing | ready | error
      peekPillState: 'hidden', // hidden | analyzing | ready | error
      sheetState: 'closed', // closed | open
      isUserScrolling: false,
      scrollIdleTimer: null,
      autoOpenCandidateSelectionId: null
    },
    suppressPageSwipeUntil: 0,
    isPhraseSelecting: false,
    suppressWordClickUntil: 0,
    clickedWordsOnPage: new Set(),
    encounterCountByWord: new Map(),
    isResizing: false
  };

  const chapterSelectModalManager = new ModalManager(elements.chapterSelectModal);
  chapterSelectModalManager.registerCloseButton(elements.closeChapterSelectBtn);

  function getCurrentBookLanguage() {
    const lang = (state.currentBook?.language || getLanguageFilter() || 'en').trim();
    if (Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, lang)) return lang;
    return 'en';
  }

  function getGlobalVocabEntryForWord(normalizedWord, language = null) {
    const key = makeGlobalVocabId(language || getCurrentBookLanguage(), normalizedWord);
    if (!key) return null;
    return globalVocabByWord.get(key) || null;
  }

  function getEffectiveWordStatus(normalizedWord) {
    const local = state.vocabularyByWord.get(normalizedWord)?.status || null;
    if (local) return local;
    const global = getGlobalVocabEntryForWord(normalizedWord, getCurrentBookLanguage());
    if (global?.status === 'learning') return WORD_STATUSES.LEARNING;
    return WORD_STATUSES.NEW;
  }

  const vocabPanel = createVocabPanel({
    elements,
    state,
    getCurrentBookLanguage,
    getEffectiveWordStatus,
    getGlobalVocabEntryForWord
  });

  const wordHighlighter = createWordHighlighter({
    elements,
    state,
    getEffectiveWordStatus,
    getCachedAnalysisForSelectedWord: vocabPanel.getCachedAnalysisForSelectedWord,
    queueSelectedWordAnalysis: vocabPanel.queueSelectedWordAnalysis,
    setSelectedWordStatus: vocabPanel.setSelectedWordStatus,
    renderVocabularyPanel: vocabPanel.renderVocabularyPanel,
    switchTab: vocabPanel.switchTab
  });

  vocabPanel.setApplyWordStatusesToContainer(wordHighlighter.applyWordStatusesToContainer);

  const pagination = createPaginationEngine({
    elements,
    state,
    getCurrentBookLanguage,
    getEffectiveWordStatus,
    applyWordStatusesToContainer: wordHighlighter.applyWordStatusesToContainer
  });

  const chapters = createChapterManager({
    elements,
    state,
    chapterSelectModalManager,
    pagination,
    refreshVocabularyCache: vocabPanel.refreshVocabularyCache,
    renderVocabularyPanel: vocabPanel.renderVocabularyPanel,
    applyWordStatusesToContainer: wordHighlighter.applyWordStatusesToContainer,
    switchTab: vocabPanel.switchTab
  });

  /** @type {{ onBackToBookshelf: () => void } | null} */
  let navigation = null;

  function init({ onBackToBookshelf }) {
    navigation = { onBackToBookshelf };

    elements.backToShelfBtn.addEventListener('click', () => navigation?.onBackToBookshelf?.());

    elements.readingContent.addEventListener('click', wordHighlighter.handleReadingWordClick);
    elements.readingContent.addEventListener('mouseup', wordHighlighter.handleReadingSelectionEnd);
    elements.readingContent.addEventListener('touchend', wordHighlighter.handleReadingSelectionEnd);

    // Mobile phrase selection (long-press + drag across words).
    elements.readingContent.addEventListener('touchstart', wordHighlighter.handleReadingTouchStart, { passive: true });
    elements.readingContent.addEventListener('touchmove', wordHighlighter.handleReadingTouchMove, { passive: true });
    elements.readingContent.addEventListener('touchend', wordHighlighter.handleReadingTouchEnd, { passive: true });
    elements.readingContent.addEventListener('touchcancel', wordHighlighter.resetPhraseSelection, { passive: true });

    // Tap/click edge zones to flip pages.
    const edgeZoneRatio = 0.3;
    let lastTouchEndAt = 0;

    function getEdgeAction(clientX) {
      const w = window.innerWidth || 0;
      if (!w) return null;
      const edge = w * edgeZoneRatio;
      if (clientX <= edge) return 'prev';
      if (clientX >= (w - edge)) return 'next';
      return null;
    }

    function shouldBlockPageFlip() {
      if (!state.isPageFlipMode) return true;
      if (Date.now() < (state.suppressPageSwipeUntil || 0)) return true;
      if (state.isPhraseSelecting) return true;
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return true;
      return false;
    }

    function handleEdgeFlip(clientX, event) {
      if (shouldBlockPageFlip()) return;
      const action = getEdgeAction(clientX);
      if (!action) return;
      event?.stopImmediatePropagation?.();
      event?.preventDefault?.();
      if (action === 'prev') {
        pagination.goToPreviousPage();
      } else {
        pagination.goToNextPage();
      }
    }

    elements.readingContent.addEventListener('touchend', (event) => {
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      lastTouchEndAt = Date.now();
      handleEdgeFlip(touch.clientX, event);
    }, { passive: false, capture: true });

    elements.readingContent.addEventListener('click', (event) => {
      if (Date.now() - lastTouchEndAt < 500) return;
      handleEdgeFlip(event.clientX, event);
    }, { capture: true });

    elements.chapterSelectBtn?.addEventListener('click', chapters.openChapterSelectModal);

    if (elements.toggleSidebarBtn) {
      elements.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }

    elements.tabVocabAnalysis.addEventListener('click', () => vocabPanel.switchTab('vocab-analysis'));
    elements.tabChapterAnalysis.addEventListener('click', () => vocabPanel.switchTab('chapter-analysis'));

    elements.vocabAnalysisContent.addEventListener('click', vocabPanel.handleVocabPanelClick);
    elements.chapterAnalysisBtn.addEventListener('click', chapters.handleChapterAnalysis);

    elements.prevPageBtn?.addEventListener('click', () => pagination.goToPreviousPage());
    elements.nextPageBtn?.addEventListener('click', () => pagination.goToNextPage());

    setupResizeHandle();
  }

  function getCurrentBookId() {
    return state.currentBookId;
  }

  function isPageMode() {
    return Boolean(state.isPageFlipMode);
  }

  function handleEscape() {
    chapters.closeChapterSelectModal();
  }

  function handleKeyDown(event) {
    if (!state.isPageFlipMode) return false;
    if (!state.currentBookId) return false;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      pagination.goToPreviousPage();
      return true;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      pagination.goToNextPage();
      return true;
    }
    return false;
  }

  function applyLayout(layout) {
    if (layout && layout.panelWidth) {
      elements.vocabPanel.style.width = `${layout.panelWidth}%`;
    }
  }

  async function openBook(bookId, { onShowReader } = {}) {
    try {
      showLoading('加载书籍...');

      let book = await getBook(bookId);
      if (!book) {
        try {
          await ensureLocalBookCached(bookId);
          book = await getBook(bookId);
        } catch (error) {
          console.warn('Failed to fetch book from cloud:', error);
        }
      } else if (!Array.isArray(book?.chapters) || book.chapters.length === 0) {
        try {
          await ensureLocalBookCached(bookId);
          book = await getBook(bookId);
        } catch (error) {
          console.warn('Failed to refresh placeholder book from cloud:', error);
        }
      }
      if (!book) throw new Error('书籍未找到');
      if (!Array.isArray(book?.chapters) || book.chapters.length === 0) {
        throw new Error('书籍尚未云端处理完成（章节为空）');
      }

      state.currentBook = book;
      state.currentBookId = bookId;
      state.currentChapterIndex = book.currentChapter || 0;
      state.encounterCountByWord = new Map();
      state.clickedWordsOnPage = new Set();

      const pageProgress = await getReadingProgressCloud(bookId);
      const progressChapterId = pageProgress?.chapterId || null;
      const progressPageNumber = typeof pageProgress?.pageNumber === 'number' ? pageProgress.pageNumber : 0;
      const progressCharOffset = typeof pageProgress?.charOffset === 'number' ? pageProgress.charOffset : 0;
      const progressChapterTextHash = typeof pageProgress?.chapterTextHash === 'string' ? pageProgress.chapterTextHash : null;
      if (progressChapterId && Array.isArray(book.chapters)) {
        const idx = book.chapters.findIndex((ch) => ch.id === progressChapterId);
        if (idx >= 0) state.currentChapterIndex = idx;
      }

      elements.bookTitle.textContent = book.title;
      chapters.renderChaptersList();

      if (typeof onShowReader === 'function') onShowReader();
      elements.readerView.classList.toggle('page-mode', state.isPageFlipMode);

      await refreshGlobalVocabCache();
      await vocabPanel.refreshVocabularyCache();

      await chapters.loadChapter(state.currentChapterIndex, {
        startPage: progressPageNumber,
        startCharOffset: progressCharOffset,
        chapterTextHash: progressChapterTextHash
      });

      hideLoading();
      return { ok: true, bookId: state.currentBookId };
    } catch (error) {
      hideLoading();
      showNotification('加载书籍失败: ' + error.message, 'error');
      console.error('Failed to load book:', error);
      return { ok: false };
    }
  }

  async function saveCurrentProgress() {
    if (!state.currentBookId) return;
    pagination.schedulePageProgressSave();
    await chapters.persistReadingProgress();
  }

  function toggleSidebar() {
    elements.vocabPanel.classList.toggle('collapsed');
    const isCollapsed = elements.vocabPanel.classList.contains('collapsed');
    elements.resizeHandle.style.display = isCollapsed ? 'none' : '';
  }

  function setupResizeHandle() {
    let startX, startPanelWidth;

    elements.resizeHandle.addEventListener('mousedown', (e) => {
      if (elements.vocabPanel.classList.contains('collapsed')) return;
      state.isResizing = true;
      startX = e.clientX;
      const mainRect = elements.mainContent.getBoundingClientRect();
      startPanelWidth = elements.vocabPanel.getBoundingClientRect().width;

      elements.resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!state.isResizing) return;

      const mainRect = elements.mainContent.getBoundingClientRect();
      const deltaX = startX - e.clientX;

      let newPanelWidth = startPanelWidth + deltaX;
      let newPanelPercent = (newPanelWidth / mainRect.width) * 100;

      newPanelPercent = Math.max(20, Math.min(50, newPanelPercent));

      elements.vocabPanel.style.width = `${newPanelPercent}%`;
    });

    document.addEventListener('mouseup', () => {
      if (!state.isResizing) return;

      state.isResizing = false;
      elements.resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const mainRect = elements.mainContent.getBoundingClientRect();
      const layout = {
        panelWidth: (elements.vocabPanel.getBoundingClientRect().width / mainRect.width) * 100
      };
      saveLayout(layout);
    });
  }

  return {
    init,
    openBook,
    saveCurrentProgress,
    getCurrentBookId,
    isPageMode,
    applyLayout,
    handleEscape,
    handleKeyDown
  };
}
