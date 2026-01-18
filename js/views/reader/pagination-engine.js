import {
  buildTokenizedChapterWrapperWithMeta,
  buildTokenizedChapterWrapperWithMetaForLanguage,
  hashCanonicalText,
  renderTokenizedChapterContent
} from '../../utils/tokenizer.js';
import { globalVocabByWord } from '../../core/global-vocab-cache.js';
import { makeGlobalVocabId, upsertGlobalKnownItems } from '../../db.js';
import { isGlobalKnownEnabled } from '../../storage.js';
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
  let paginationMeasureInner = null;
  let pageProgressSaveTimer = null;
  /** @type {((index: number, options?: any) => Promise<void>) | null} */
  let loadChapter = null;
  let renderRequestId = 0;
  let globalKnownFlushTimer = null;
  const pendingGlobalKnownUpdates = new Map();
  const GLOBAL_KNOWN_FLUSH_MS = 2000;

  function queueGlobalKnownUpdate(entry) {
    if (!entry?.id) return;
    pendingGlobalKnownUpdates.set(entry.id, entry);
    scheduleGlobalKnownFlush();
  }

  function scheduleGlobalKnownFlush() {
    if (globalKnownFlushTimer) return;
    globalKnownFlushTimer = setTimeout(() => {
      void flushGlobalKnownUpdates();
    }, GLOBAL_KNOWN_FLUSH_MS);
  }

  async function flushGlobalKnownUpdates() {
    if (globalKnownFlushTimer) {
      clearTimeout(globalKnownFlushTimer);
      globalKnownFlushTimer = null;
    }
    if (pendingGlobalKnownUpdates.size === 0) return;
    const items = Array.from(pendingGlobalKnownUpdates.values());
    pendingGlobalKnownUpdates.clear();
    try {
      const records = await upsertGlobalKnownItems(items);
      records.forEach((record) => {
        const key = record?.id;
        if (key) globalVocabByWord.set(key, record);
      });
    } catch (error) {
      console.warn('Failed to persist global-known updates:', error);
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      void flushGlobalKnownUpdates();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', () => void flushGlobalKnownUpdates());

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
      paginationMeasureInner = document.createElement('div');
      paginationMeasure.appendChild(paginationMeasureInner);
      document.body.appendChild(paginationMeasure);
    }

    if (!paginationMeasureInner) {
      paginationMeasureInner = document.createElement('div');
      paginationMeasure.appendChild(paginationMeasureInner);
    }

    const source = elements.readingContent;
    const computed = window.getComputedStyle(source);

    paginationMeasure.style.width = `${source.clientWidth}px`;
    paginationMeasure.style.height = `${heightPx}px`;
    paginationMeasure.style.padding = computed.padding;
    paginationMeasure.style.boxSizing = computed.boxSizing;
    paginationMeasure.style.fontFamily = computed.fontFamily;
    paginationMeasure.style.fontSize = computed.fontSize;
    paginationMeasure.style.lineHeight = computed.lineHeight;
    paginationMeasure.style.letterSpacing = computed.letterSpacing;
    paginationMeasure.style.wordSpacing = computed.wordSpacing;
    paginationMeasure.style.fontWeight = computed.fontWeight;
    paginationMeasure.style.fontStyle = computed.fontStyle;
    paginationMeasureInner.innerHTML = '';
    return paginationMeasureInner;
  }

  function findPageIndexByCharOffset(pageStartCharOffsets, charOffset) {
    if (!Array.isArray(pageStartCharOffsets) || pageStartCharOffsets.length === 0) return 0;
    const target = Math.max(0, Number(charOffset) || 0);

    let low = 0;
    let high = pageStartCharOffsets.length - 1;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const value = Number(pageStartCharOffsets[mid]) || 0;
      if (value <= target) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }

  function paginateTokenizedWrapper(wrapper, pageHeightPx) {
    const pageWrapper = ensurePaginationMeasure(pageHeightPx);
    const pageHeight = Math.max(0, pageWrapper.clientHeight || pageHeightPx);

    /** @type {string[]} */
    const pages = [];
    /** @type {number[]} */
    const pageStartCharOffsets = [];

    const paragraphSeparatorLen = 2; // '\n\n' in canonical text
    let currentPageStartOffset = 0;
    let paragraphOffsetCursor = 0;

    const paragraphs = Array.from(wrapper.children);
    for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
      const paragraph = paragraphs[paragraphIndex];
      const paragraphTextLen = (paragraph.textContent || '').length;
      const sepLen = paragraphIndex < paragraphs.length - 1 ? paragraphSeparatorLen : 0;
      const clone = paragraph.cloneNode(true);
      pageWrapper.appendChild(clone);

      if (pageWrapper.scrollHeight > pageHeight) {
        pageWrapper.removeChild(clone);
        if (paragraph.tagName === 'P') {
          currentPageStartOffset = splitParagraphIntoPages(
            paragraph,
            pageWrapper,
            pageHeight,
            pages,
            pageStartCharOffsets,
            paragraphOffsetCursor,
            currentPageStartOffset
          );
        } else {
          if (pageWrapper.childNodes.length > 0) {
            pages.push(pageWrapper.innerHTML);
            pageStartCharOffsets.push(currentPageStartOffset);
            pageWrapper.innerHTML = '';
            currentPageStartOffset = paragraphOffsetCursor;
          }

          pageWrapper.appendChild(clone);
          if (pageWrapper.scrollHeight > pageHeight) {
            pages.push(pageWrapper.innerHTML);
            pageStartCharOffsets.push(currentPageStartOffset);
            pageWrapper.innerHTML = '';
          }
        }
      }

      paragraphOffsetCursor += paragraphTextLen + sepLen;
      if (pageWrapper.childNodes.length === 0) {
        currentPageStartOffset = paragraphOffsetCursor;
      }
    }

    if (pageWrapper.childNodes.length > 0) {
      pages.push(pageWrapper.innerHTML);
      pageStartCharOffsets.push(currentPageStartOffset);
    }

    const safePages = pages.length > 0 ? pages : [''];
    const safeOffsets = pageStartCharOffsets.length === safePages.length ? pageStartCharOffsets : safePages.map(() => 0);
    return { pages: safePages, pageStartCharOffsets: safeOffsets };
  }

  function splitParagraphIntoPages(
    paragraph,
    pageWrapper,
    pageHeightPx,
    pages,
    pageStartCharOffsets,
    paragraphStartOffset,
    currentPageStartOffset
  ) {
    const tokens = Array.from(paragraph.childNodes);
    if (tokens.length === 0) {
      if (pageWrapper.childNodes.length > 0) {
        pages.push(pageWrapper.innerHTML);
        pageStartCharOffsets.push(currentPageStartOffset);
        pageWrapper.innerHTML = '';
        currentPageStartOffset = paragraphStartOffset;
      }

      const clone = paragraph.cloneNode(true);
      pageWrapper.appendChild(clone);
      if (pageWrapper.scrollHeight > pageHeightPx) {
        pages.push(pageWrapper.innerHTML);
        pageStartCharOffsets.push(currentPageStartOffset);
        pageWrapper.innerHTML = '';
      }

      return currentPageStartOffset;
    }

    const tokenPrefix = [0];
    for (const token of tokens) {
      const len = (token?.textContent || '').length;
      tokenPrefix.push(tokenPrefix[tokenPrefix.length - 1] + len);
    }
    let start = 0;

    while (start < tokens.length) {
      let end = findMaxFittingTokenEnd(tokens, start, pageWrapper, pageHeightPx);
      if (end <= start) {
        if (pageWrapper.childNodes.length > 0) {
          pages.push(pageWrapper.innerHTML);
          pageStartCharOffsets.push(currentPageStartOffset);
          pageWrapper.innerHTML = '';
          currentPageStartOffset = paragraphStartOffset + tokenPrefix[start];
          continue;
        }
        end = start + 1;
      }

      const piece = document.createElement('p');
      for (let i = start; i < end; i++) {
        piece.appendChild(tokens[i].cloneNode(true));
      }
      pageWrapper.appendChild(piece);

      if (end < tokens.length) {
        pages.push(pageWrapper.innerHTML);
        pageStartCharOffsets.push(currentPageStartOffset);
        pageWrapper.innerHTML = '';
        currentPageStartOffset = paragraphStartOffset + tokenPrefix[end];
      }

      start = end;
    }

    return currentPageStartOffset;
  }

  function findMaxFittingTokenEnd(tokens, start, pageWrapper, pageHeightPx) {
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
      const fits = pageWrapper.scrollHeight <= pageHeightPx;
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
        const charOffset = Array.isArray(state.pageStartCharOffsets) ? (state.pageStartCharOffsets[state.currentPageIndex] || 0) : 0;
        const chapterTextHash = typeof state.chapterTextHash === 'string' ? state.chapterTextHash : null;
        await updatePageProgressCloud(state.currentBookId, {
          chapterId,
          pageNumber: state.currentPageIndex,
          scrollPosition: 0,
          charOffset,
          chapterTextHash
        });
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
    const nowIso = new Date().toISOString();
    const language = getCurrentBookLanguage();
    const globalKnownEnabled = isGlobalKnownEnabled();

    snapshot.words.forEach((displayWord, normalizedWord) => {
      if (!normalizedWord) return;
      if (snapshot.clicked.has(normalizedWord)) return;

      const localEntry = state.vocabularyByWord.get(normalizedWord) || null;
      const localStatus = localEntry?.status || null;
      const effectiveStatus = getEffectiveWordStatus(normalizedWord);

      if (!globalKnownEnabled) {
        const prevCount = state.encounterCountByWord.get(normalizedWord) || 0;
        const nextCount = prevCount + 1;
        state.encounterCountByWord.set(normalizedWord, nextCount);

        if (effectiveStatus === WORD_STATUSES.NEW && nextCount >= 1) {
          updates.push({
            ...(localEntry || {}),
            bookId: snapshot.bookId,
            language,
            word: normalizedWord,
            displayWord: localEntry?.displayWord || displayWord,
            status: WORD_STATUSES.SEEN,
            sourceChapterId: localEntry?.sourceChapterId || snapshot.chapterId
          });
          return;
        }

        if (effectiveStatus === WORD_STATUSES.SEEN && nextCount >= 2) {
          updates.push({
            ...(localEntry || {}),
            bookId: snapshot.bookId,
            language: localEntry?.language || language,
            word: normalizedWord,
            displayWord: localEntry?.displayWord || displayWord,
            status: WORD_STATUSES.KNOWN,
            sourceChapterId: localEntry?.sourceChapterId || snapshot.chapterId
          });
        }
        return;
      }

      const globalKey = makeGlobalVocabId(language, normalizedWord);
      const globalEntry = globalVocabByWord.get(globalKey) || null;
      const globalKnown = globalEntry?.kind === 'global-known' ? globalEntry : null;
      const globalKnownStatus = globalKnown?.status || null;
      const prevGlobalCount = typeof globalKnown?.encounterCount === 'number'
        ? globalKnown.encounterCount
        : (globalKnownStatus === WORD_STATUSES.KNOWN ? 2 : globalKnownStatus === WORD_STATUSES.SEEN ? 1 : 0);

      if (effectiveStatus === WORD_STATUSES.NEW || effectiveStatus === WORD_STATUSES.SEEN) {
        const nextGlobalCount = prevGlobalCount + 1;
        const nextGlobalStatus = nextGlobalCount >= 2 ? WORD_STATUSES.KNOWN : WORD_STATUSES.SEEN;
        const sourceBooks = new Set(Array.isArray(globalKnown?.sourceBooks) ? globalKnown.sourceBooks : []);
        if (snapshot.bookId) sourceBooks.add(snapshot.bookId);

        const nextGlobalEntry = {
          ...(globalKnown || {}),
          id: globalKey,
          kind: 'global-known',
          language,
          normalizedWord,
          displayWord: globalKnown?.displayWord || displayWord,
          status: nextGlobalStatus,
          encounterCount: nextGlobalCount,
          lastEncounteredAt: nowIso,
          sourceBooks: Array.from(sourceBooks),
          createdAt: globalKnown?.createdAt || nowIso,
          updatedAt: nowIso
        };

        globalVocabByWord.set(globalKey, nextGlobalEntry);
        queueGlobalKnownUpdate(nextGlobalEntry);

        if (nextGlobalStatus === WORD_STATUSES.SEEN) {
          if (localStatus !== WORD_STATUSES.SEEN && localStatus !== WORD_STATUSES.LEARNING && localStatus !== WORD_STATUSES.KNOWN) {
            updates.push({
              ...(localEntry || {}),
              bookId: snapshot.bookId,
              language,
              word: normalizedWord,
              displayWord: localEntry?.displayWord || displayWord,
              status: WORD_STATUSES.SEEN,
              sourceChapterId: localEntry?.sourceChapterId || snapshot.chapterId
            });
          }
          return;
        }

        if (nextGlobalStatus === WORD_STATUSES.KNOWN) {
          if (localStatus !== WORD_STATUSES.KNOWN && localStatus !== WORD_STATUSES.LEARNING) {
            updates.push({
              ...(localEntry || {}),
              bookId: snapshot.bookId,
              language: localEntry?.language || language,
              word: normalizedWord,
              displayWord: localEntry?.displayWord || displayWord,
              status: WORD_STATUSES.KNOWN,
              sourceChapterId: localEntry?.sourceChapterId || snapshot.chapterId
            });
          }
        }
        return;
      }

      if (globalKnownStatus === WORD_STATUSES.KNOWN) {
        if (localStatus !== WORD_STATUSES.KNOWN && localStatus !== WORD_STATUSES.LEARNING) {
          updates.push({
            ...(localEntry || {}),
            bookId: snapshot.bookId,
            language: localEntry?.language || language,
            word: normalizedWord,
            displayWord: localEntry?.displayWord || displayWord,
            status: WORD_STATUSES.KNOWN,
            sourceChapterId: localEntry?.sourceChapterId || snapshot.chapterId
          });
        }
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
    const language = (getCurrentBookLanguage() || 'en').toString().trim().toLowerCase();

    if (state.isPageFlipMode) {
      if (language === 'ja') {
        const requestId = ++renderRequestId;
          let pageHeight = elements.readingContent.clientHeight || 520;
        if (elements.readerView?.classList.contains('zen-mode')) {
          pageHeight = Math.floor(pageHeight * 0.9);
        }
        elements.readingContent.innerHTML = '<p class="loading">Loading Japanese tokens...</p>';

        const bookId = state.currentBookId || null;
        const chapterId = state.currentBook?.chapters?.[state.currentChapterIndex]?.id || null;

        void (async () => {
          try {
            const { wrapper, canonicalText } = await buildTokenizedChapterWrapperWithMetaForLanguage(chapterContent, {
              language: 'ja',
              bookId,
              chapterId
            });
            if (requestId !== renderRequestId) return;

            const { pages, pageStartCharOffsets } = paginateTokenizedWrapper(wrapper, pageHeight);
            state.chapterPages = pages;
            state.pageStartCharOffsets = pageStartCharOffsets;
            state.chapterTextHash = hashCanonicalText(canonicalText);

            if (options?.startPage === 'last') {
              state.currentPageIndex = Math.max(0, state.chapterPages.length - 1);
            } else if (
              typeof options?.startCharOffset === 'number' &&
              typeof options?.chapterTextHash === 'string' &&
              options.chapterTextHash &&
              options.chapterTextHash === state.chapterTextHash
            ) {
              state.currentPageIndex = findPageIndexByCharOffset(state.pageStartCharOffsets, options.startCharOffset);
            } else if (typeof options?.startPage === 'number') {
              state.currentPageIndex = Math.min(Math.max(0, options.startPage), Math.max(0, state.chapterPages.length - 1));
            } else {
              state.currentPageIndex = 0;
            }

            renderCurrentPage('none');
          } catch (error) {
            console.warn('Japanese wrapper build failed:', error);
            if (requestId !== renderRequestId) return;
            elements.readingContent.innerHTML = '<p class="loading">Failed to load Japanese tokens.</p>';
          }
        })();
        return;
      }

        let pageHeight = elements.readingContent.clientHeight || 520;
        if (elements.readerView?.classList.contains('zen-mode')) {
          pageHeight = Math.floor(pageHeight * 0.9);
        }
      const { wrapper, canonicalText } = buildTokenizedChapterWrapperWithMeta(chapterContent);
      const { pages, pageStartCharOffsets } = paginateTokenizedWrapper(wrapper, pageHeight);
      state.chapterPages = pages;
      state.pageStartCharOffsets = pageStartCharOffsets;
      state.chapterTextHash = hashCanonicalText(canonicalText);

      if (options?.startPage === 'last') {
        state.currentPageIndex = Math.max(0, state.chapterPages.length - 1);
      } else if (
        typeof options?.startCharOffset === 'number' &&
        typeof options?.chapterTextHash === 'string' &&
        options.chapterTextHash &&
        options.chapterTextHash === state.chapterTextHash
      ) {
        state.currentPageIndex = findPageIndexByCharOffset(state.pageStartCharOffsets, options.startCharOffset);
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
    state.pageStartCharOffsets = [];
    state.chapterTextHash = null;

    if (language === 'ja') {
      const requestId = ++renderRequestId;
      elements.readingContent.innerHTML = '<p class="loading">Loading Japanese tokens...</p>';
      const bookId = state.currentBookId || null;
      const chapterId = state.currentBook?.chapters?.[state.currentChapterIndex]?.id || null;

      void (async () => {
        try {
          const { wrapper, canonicalText } = await buildTokenizedChapterWrapperWithMetaForLanguage(chapterContent, {
            language: 'ja',
            bookId,
            chapterId
          });
          if (requestId !== renderRequestId) return;
          elements.readingContent.innerHTML = '';
          elements.readingContent.appendChild(wrapper);
          state.chapterTextHash = hashCanonicalText(canonicalText);
          applyWordStatusesToContainer(elements.readingContent);
          updatePageControls();
        } catch (error) {
          console.warn('Japanese wrapper build failed:', error);
          if (requestId !== renderRequestId) return;
          elements.readingContent.innerHTML = '<p class="loading">Failed to load Japanese tokens.</p>';
          updatePageControls();
        }
      })();

      return;
    }

    renderTokenizedChapterContent(elements.readingContent, chapterContent);
    updatePageControls();
  }

  return {
    renderChapterContent,
    updatePageControls,
    schedulePageProgressSave,
    setLoadChapter,
    goToNextPage,
    goToPreviousPage,
    getCurrentCharOffset: () => {
      return Array.isArray(state.pageStartCharOffsets)
        ? (state.pageStartCharOffsets[state.currentPageIndex] || 0)
        : 0;
    },
    getChapterTextHash: () => state.chapterTextHash
  };
}
