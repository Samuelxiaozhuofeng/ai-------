import { WORD_STATUSES } from '../../word-status.js';
import { showNotification } from '../../ui/notifications.js';
import { ensureGlobalLearningCard, removeBookFromGlobalLearningCard, upsertGlobalAnalysis } from '../../srs-service.js';
import { getSettings, isGlobalKnownEnabled } from '../../storage.js';
import {
  makeGlobalVocabId,
  upsertGlobalKnownItem,
  // keep makeGlobalVocabId from IndexedDB helpers
} from '../../db.js';
import { deleteBookVocabularyItem, listBookVocabulary, upsertBookVocabularyItem } from '../../supabase/vocabulary-repo.js';
import { globalVocabByWord, refreshGlobalVocabCache } from '../../core/global-vocab-cache.js';
import { escapeHtml } from '../../utils/html.js';

export function createVocabPanel({
  elements,
  state,
  getCurrentBookLanguage,
  getEffectiveWordStatus,
  getGlobalVocabEntryForWord
}) {
  const AUTO_OPEN_MAX_AGE_MS = 3500;
  const AUTO_OPEN_MIN_DELAY_MS = 250;
  const SCROLL_IDLE_MS = 400;
  const MOBILE_SHEET_GAP_PX = 16;
  const MOBILE_SHEET_MIN_HEIGHT_PX = 160;

  /** @type {((container: HTMLElement) => void) | null} */
  let applyWordStatusesToContainer = null;

  function setApplyWordStatusesToContainer(fn) {
    applyWordStatusesToContainer = typeof fn === 'function' ? fn : null;
  }

  function ensureVocabUiState() {
    if (!state.vocabUi) state.vocabUi = {};
    if (!('feedbackState' in state.vocabUi)) state.vocabUi.feedbackState = 'idle';
    if (!('peekPillState' in state.vocabUi)) state.vocabUi.peekPillState = 'hidden';
    if (!('sheetState' in state.vocabUi)) state.vocabUi.sheetState = 'closed';
    if (!('isExpanded' in state.vocabUi)) state.vocabUi.isExpanded = false;
    if (!('expandedSelectionId' in state.vocabUi)) state.vocabUi.expandedSelectionId = null;
    if (!('isUserScrolling' in state.vocabUi)) state.vocabUi.isUserScrolling = false;
    if (!('scrollIdleTimer' in state.vocabUi)) state.vocabUi.scrollIdleTimer = null;
    if (!('autoOpenCandidateSelectionId' in state.vocabUi)) state.vocabUi.autoOpenCandidateSelectionId = null;
    if (!('autoOpenTimer' in state.vocabUi)) state.vocabUi.autoOpenTimer = null;
  }

  function isMobileViewport() {
    return window.innerWidth <= 768;
  }

  function setSelectedWordProcessing(isProcessing) {
    if (!state.selectedWordEl) return;
    state.selectedWordEl.classList.toggle('word-processing', Boolean(isProcessing));
  }

  function canUseMobileVocabUi() {
    return Boolean(elements.mobileVocabOverlay && elements.mobileVocabContent);
  }

  function clearMobileVocabSheetPosition() {
    if (!elements.mobileVocabSheet) return;
    delete elements.mobileVocabSheet.dataset.position;
    elements.mobileVocabSheet.style.removeProperty('--sheet-max-height');
  }

  function applyMobileVocabSheetPosition() {
    if (!elements.mobileVocabSheet) return;
    if (!isMobileViewport()) {
      clearMobileVocabSheetPosition();
      return;
    }

    const wordEl = state.selectedWordEl;
    if (!wordEl || typeof wordEl.getBoundingClientRect !== 'function') {
      clearMobileVocabSheetPosition();
      return;
    }

    const rect = wordEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    if (!viewportHeight) return;

    const inViewport = rect.bottom >= 0 && rect.top <= viewportHeight;
    if (!inViewport) {
      clearMobileVocabSheetPosition();
      return;
    }

    const centerY = rect.top + rect.height / 2;
    const preferTop = centerY > viewportHeight / 2;

    const spaceAbove = Math.max(0, rect.top - MOBILE_SHEET_GAP_PX);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - MOBILE_SHEET_GAP_PX);

    let position = preferTop ? 'top' : 'bottom';
    let maxHeight = position === 'top' ? spaceAbove : spaceBelow;

    if (maxHeight < MOBILE_SHEET_MIN_HEIGHT_PX) {
      const alternative = position === 'top' ? spaceBelow : spaceAbove;
      if (alternative > maxHeight) {
        position = position === 'top' ? 'bottom' : 'top';
        maxHeight = alternative;
      }
    }

    elements.mobileVocabSheet.dataset.position = position;
    elements.mobileVocabSheet.style.setProperty('--sheet-max-height', `${Math.max(0, Math.min(viewportHeight, Math.floor(maxHeight)))}px`);
  }

  function renderMobileVocabSheetContent() {
    if (!elements.mobileVocabContent || !elements.mobileVocabSheet) return;
    ensureVocabUiState();

    const selectionId = state.selectedWordSelectionId || null;
    if (state.vocabUi.expandedSelectionId !== selectionId) {
      state.vocabUi.isExpanded = false;
      state.vocabUi.expandedSelectionId = null;
    }

    const isExpanded = Boolean(state.vocabUi.isExpanded);
    elements.mobileVocabSheet.classList.toggle('mobile-vocab-sheet--expanded', isExpanded);
    elements.mobileVocabSheet.classList.toggle('mobile-vocab-sheet--compact', !isExpanded);

    if (!state.selectedWord) {
      elements.mobileVocabContent.innerHTML = `
        <div class="vocab-compact-view">
          <div class="vocab-compact-empty">点击正文中的单词开始</div>
        </div>
      `;
      return;
    }

    const displayWord = state.selectedWordDisplay || state.selectedWord;
    const analysis = state.selectedWordAnalysis;
    const isLoading = Boolean(state.isSelectedAnalysisLoading && !analysis);

    if (isLoading) {
      elements.mobileVocabContent.innerHTML = `
        <div class="vocab-compact-view">
          <div class="vocab-compact-word">${escapeHtml(displayWord)}</div>
          <div class="vocab-compact-status">正在分析...</div>
        </div>
      `;
      return;
    }

    if (!analysis) {
      elements.mobileVocabContent.innerHTML = `
        <div class="vocab-compact-view">
          <div class="vocab-compact-word">${escapeHtml(displayWord)}</div>
          <div class="vocab-compact-status">暂无解释</div>
        </div>
      `;
      return;
    }

    const wordLabel = analysis.word || displayWord;
    const meaning = (analysis.meaning || '').trim();
    const usage = (analysis.usage || '').trim();
    const contextualMeaning = (analysis.contextualMeaning || '').trim();

    if (!isExpanded) {
      const canExpand = Boolean(usage || contextualMeaning);
      elements.mobileVocabContent.innerHTML = `
        <div class="vocab-compact-view">
          <div class="vocab-compact-word">${escapeHtml(wordLabel)}</div>
          <div class="vocab-compact-meaning">${escapeHtml(meaning || '暂无释义')}</div>
          ${canExpand ? `
            <button class="vocab-expand-btn" type="button" data-action="expand-vocab" aria-label="展开更多">
              <span class="expand-icon" aria-hidden="true">⌄</span>
              查看详情
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    elements.mobileVocabContent.innerHTML = `
      <div class="vocab-expanded-view">
        <div class="vocab-expanded-header">
          <div class="vocab-expanded-word">${escapeHtml(wordLabel)}</div>
          <button class="vocab-collapse-btn" type="button" data-action="collapse-vocab" aria-label="收起">×</button>
        </div>
        <div class="vocab-expanded-body">
          ${meaning ? `
            <div class="vocab-row">
              <div class="vocab-label">含义</div>
              <div class="vocab-value">${escapeHtml(meaning)}</div>
            </div>
          ` : ''}
          ${usage ? `
            <div class="vocab-row">
              <div class="vocab-label">用法</div>
              <div class="vocab-value">${escapeHtml(usage)}</div>
            </div>
          ` : ''}
          ${contextualMeaning ? `
            <div class="vocab-row">
              <div class="vocab-label">上下文含义</div>
              <div class="vocab-value">${escapeHtml(contextualMeaning)}</div>
            </div>
          ` : ''}
          ${(!meaning && !usage && !contextualMeaning) ? `<p class="empty-state">暂无可显示内容</p>` : ''}
        </div>
      </div>
    `;
  }

  function setupMobileSheetPositionTracking() {
    if (!canUseMobileVocabUi()) return;

    window.addEventListener('resize', () => {
      ensureVocabUiState();
      if (state.vocabUi.sheetState !== 'open') return;
      applyMobileVocabSheetPosition();
    }, { passive: true });
  }

  function hideMobilePeekPill() {
    if (!elements.mobileVocabPeekPill) return;
    elements.mobileVocabPeekPill.classList.remove('active', 'is-analyzing', 'is-ready', 'is-error');
    elements.mobileVocabPeekPill.setAttribute('aria-hidden', 'true');
  }

  function showMobilePeekPill({ mode, word, message }) {
    if (!elements.mobileVocabPeekPill || !elements.mobileVocabPeekPillLabel || !elements.mobileVocabPeekPillWord) return;
    if (!isMobileViewport()) return;

    elements.mobileVocabPeekPill.classList.add('active');
    elements.mobileVocabPeekPill.classList.toggle('is-analyzing', mode === 'analyzing');
    elements.mobileVocabPeekPill.classList.toggle('is-ready', mode === 'ready');
    elements.mobileVocabPeekPill.classList.toggle('is-error', mode === 'error');
    elements.mobileVocabPeekPill.setAttribute('aria-hidden', 'false');

    const label =
      mode === 'analyzing' ? (message || '正在解释') :
        mode === 'ready' ? (message || '解释已就绪') :
          (message || '解释失败');
    elements.mobileVocabPeekPillLabel.textContent = label;
    elements.mobileVocabPeekPillWord.textContent = word || '';
  }

  function openMobileVocabSheet({ reason = 'manual' } = {}) {
    ensureVocabUiState();
    state.vocabUi.sheetState = 'open';
    state.vocabUi.isExpanded = false;
    state.vocabUi.expandedSelectionId = null;
    state.vocabUi.peekPillState = 'hidden';
    hideMobilePeekPill();
    renderVocabularyPanel();
  }

  function closeMobileVocabSheet({ clearSelection = true } = {}) {
    ensureVocabUiState();
    state.vocabUi.sheetState = 'closed';
    state.vocabUi.isExpanded = false;
    state.vocabUi.expandedSelectionId = null;
    state.vocabUi.autoOpenCandidateSelectionId = null;
    if (state.vocabUi.autoOpenTimer) {
      clearTimeout(state.vocabUi.autoOpenTimer);
      state.vocabUi.autoOpenTimer = null;
    }
    hideMobilePeekPill();

    if (elements.mobileVocabOverlay) elements.mobileVocabOverlay.classList.remove('active');
    clearMobileVocabSheetPosition();

    if (clearSelection) {
      state.selectedWord = null;
      state.selectedWordDisplay = null;
      state.selectedWordContext = null;
      state.selectedWordAnalysis = null;
      state.isSelectedAnalysisLoading = false;
      if (state.selectedWordEl) {
        state.selectedWordEl.classList.remove('word-selected', 'word-processing');
        state.selectedWordEl = null;
      }
    }

    cancelPendingAnalysis();
    renderVocabularyPanel();
  }

  function isSelectedWordElementVisible() {
    if (!state.selectedWordEl || !elements.readingContent) return true;
    const wordRect = state.selectedWordEl.getBoundingClientRect();
    const containerRect = elements.readingContent.getBoundingClientRect();
    const margin = 40;
    return !(wordRect.bottom < containerRect.top - margin || wordRect.top > containerRect.bottom + margin);
  }

  function canAutoOpenMobileSheetNow(selectionId) {
    ensureVocabUiState();
    if (!canUseMobileVocabUi()) return false;
    if (!isMobileViewport()) return false;
    if (!state.selectedWord) return false;
    if (!state.selectedWordAnalysis) return false;
    if (state.vocabUi.sheetState === 'open') return false;
    if (state.vocabUi.isUserScrolling) return false;
    if (!isSelectedWordElementVisible()) return false;

    const clickedAt = state.selectedWordSelectedAt || 0;
    const age = Date.now() - clickedAt;
    if (age < AUTO_OPEN_MIN_DELAY_MS) return false;
    if (age > AUTO_OPEN_MAX_AGE_MS) return false;

    if (selectionId != null && selectionId !== state.selectedWordSelectionId) return false;
    return true;
  }

  function maybeAutoOpenMobileSheet(selectionId) {
    if (!canAutoOpenMobileSheetNow(selectionId)) return false;
    openMobileVocabSheet({ reason: 'auto' });
    return true;
  }

  function scheduleAutoOpenMobileSheet(selectionId) {
    ensureVocabUiState();
    if (!canUseMobileVocabUi() || !isMobileViewport()) return;
    if (state.vocabUi.autoOpenTimer) clearTimeout(state.vocabUi.autoOpenTimer);

    const clickedAt = state.selectedWordSelectedAt || 0;
    const age = Date.now() - clickedAt;
    if (age > AUTO_OPEN_MAX_AGE_MS) return;

    const waitMs = Math.max(0, AUTO_OPEN_MIN_DELAY_MS - age);
    state.vocabUi.autoOpenTimer = setTimeout(() => {
      state.vocabUi.autoOpenTimer = null;
      void maybeAutoOpenMobileSheet(selectionId);
    }, waitMs);
  }

  function setupMobileScrollTracking() {
    ensureVocabUiState();
    if (!elements.readingContent) return;
    if (!canUseMobileVocabUi()) return;

    elements.readingContent.addEventListener('scroll', () => {
      state.vocabUi.isUserScrolling = true;
      if (state.vocabUi.scrollIdleTimer) clearTimeout(state.vocabUi.scrollIdleTimer);
      state.vocabUi.scrollIdleTimer = setTimeout(() => {
        state.vocabUi.scrollIdleTimer = null;
        state.vocabUi.isUserScrolling = false;

        const candidate = state.vocabUi.autoOpenCandidateSelectionId;
        if (candidate != null) {
          const clickedAt = state.selectedWordSelectedAt || 0;
          if (Date.now() - clickedAt > AUTO_OPEN_MAX_AGE_MS) {
            state.vocabUi.autoOpenCandidateSelectionId = null;
            return;
          }
          const didOpen = maybeAutoOpenMobileSheet(candidate);
          if (didOpen) state.vocabUi.autoOpenCandidateSelectionId = null;
        }
      }, SCROLL_IDLE_MS);
    }, { passive: true });
  }

  function setupMobilePeekPillControls() {
    if (!elements.mobileVocabPeekPillMain) return;
    elements.mobileVocabPeekPillMain.addEventListener('click', () => {
      ensureVocabUiState();
      if (state.vocabUi.peekPillState === 'ready') {
        openMobileVocabSheet({ reason: 'pill' });
        return;
      }
      if (state.vocabUi.peekPillState === 'error') {
        queueSelectedWordAnalysis({ debounceMs: 0, force: true, requestId: state.selectedWordSelectionId, autoOpenOnReady: true });
      }
    });

    elements.mobileVocabPeekPillClose?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureVocabUiState();
      state.vocabUi.peekPillState = 'hidden';
      hideMobilePeekPill();
    });
  }

  async function refreshVocabularyCache() {
    if (!state.currentBookId) {
      state.vocabularyByWord = new Map();
      return;
    }

    const items = await listBookVocabulary(state.currentBookId, null);
    state.vocabularyByWord = new Map(items.map((item) => [item.word, item]));
  }

  function getVocabCounts() {
    let learning = 0;
    let seen = 0;
    let known = 0;
    state.vocabularyByWord.forEach((item) => {
      if (item.status === WORD_STATUSES.LEARNING) learning += 1;
      if (item.status === WORD_STATUSES.SEEN) seen += 1;
      if (item.status === WORD_STATUSES.KNOWN) known += 1;
    });
    return { learning, seen, known, all: learning + seen + known };
  }

  function switchTab(tabName) {
    [elements.tabVocabAnalysis, elements.tabChapterAnalysis].forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    elements.vocabAnalysisTab.classList.toggle('active', tabName === 'vocab-analysis');
    elements.chapterAnalysisTab.classList.toggle('active', tabName === 'chapter-analysis');
  }

  function getCachedAnalysisForSelectedWord(normalizedWord, existingEntry = null) {
    const local = existingEntry || (normalizedWord ? state.vocabularyByWord.get(normalizedWord) : null);
    if (local?.analysis) return local.analysis;

    const global = normalizedWord ? getGlobalVocabEntryForWord(normalizedWord, getCurrentBookLanguage()) : null;
    if (global && (global.meaning || global.usage || global.contextualMeaning)) {
      return {
        word: global.displayWord || normalizedWord,
        meaning: global.meaning || '',
        usage: global.usage || '',
        contextualMeaning: global.contextualMeaning || ''
      };
    }

    return null;
  }

  async function ensureGlobalKnownEntry({ normalizedWord, displayWord, bookId, language }) {
    if (!isGlobalKnownEnabled()) return null;
    const lang = typeof language === 'string' ? language.trim() : '';
    if (!lang || !normalizedWord) return null;
    const key = makeGlobalVocabId(lang, normalizedWord);
    const nowIso = new Date().toISOString();
    const existing = globalVocabByWord.get(key) || null;
    const sourceBooks = new Set(Array.isArray(existing?.sourceBooks) ? existing.sourceBooks : []);
    if (bookId) sourceBooks.add(bookId);
    const encounterCount = Math.max(
      typeof existing?.encounterCount === 'number' ? existing.encounterCount : 0,
      2
    );

    const entry = await upsertGlobalKnownItem({
      ...(existing || {}),
      id: key,
      language: lang,
      normalizedWord,
      displayWord: existing?.displayWord || displayWord || normalizedWord,
      status: WORD_STATUSES.KNOWN,
      encounterCount,
      lastEncounteredAt: existing?.lastEncounteredAt || nowIso,
      sourceBooks: Array.from(sourceBooks),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso
    });
    if (entry) globalVocabByWord.set(key, entry);
    return entry;
  }

  function isAiConfigured() {
    const settings = getSettings();
    return Boolean(settings.apiUrl && settings.apiKey && settings.model);
  }

  function cancelPendingAnalysis() {
    if (state.analysisDebounceTimer) {
      clearTimeout(state.analysisDebounceTimer);
      state.analysisDebounceTimer = null;
    }
    if (state.analysisAbortController) {
      try { state.analysisAbortController.abort(); } catch { /* ignore */ }
      state.analysisAbortController = null;
    }
  }

  function makeInstantCacheKey(normalizedWord, context) {
    const lang = getCurrentBookLanguage();
    const contextText = (context?.currentSentence || context?.fullContext || '').trim();
    const contextKey = contextText.length > 240 ? contextText.slice(0, 240) : contextText;
    return `${lang}::${normalizedWord}::${contextKey}`;
  }

  function queueSelectedWordAnalysis({ debounceMs = 250, force = false, requestId = null, autoOpenOnReady = false } = {}) {
    if (!state.selectedWord || !state.selectedWordDisplay) return;
    ensureVocabUiState();
    if (state.vocabUi.autoOpenTimer) {
      clearTimeout(state.vocabUi.autoOpenTimer);
      state.vocabUi.autoOpenTimer = null;
    }

    const normalizedWord = state.selectedWord;
    const display = state.selectedWordDisplay;
    const context = state.selectedWordContext;

    if (!isAiConfigured()) {
      state.vocabUi.feedbackState = 'error';
      state.vocabUi.peekPillState = 'error';
      setSelectedWordProcessing(false);
      if (canUseMobileVocabUi()) showMobilePeekPill({ mode: 'error', word: display, message: '请先配置 AI' });
      return;
    }

    const cacheKey = makeInstantCacheKey(normalizedWord, context);
    const cached = state.instantAnalysisCache?.get?.(cacheKey) || null;
    if (!force && (state.selectedWordAnalysis || cached)) {
      if (!state.selectedWordAnalysis && cached) state.selectedWordAnalysis = cached;
      state.isSelectedAnalysisLoading = false;
      state.vocabUi.feedbackState = 'ready';
      state.vocabUi.peekPillState = 'ready';
      setSelectedWordProcessing(false);
      if (canUseMobileVocabUi()) showMobilePeekPill({ mode: 'ready', word: display });
      if (autoOpenOnReady) {
        const selectionId = requestId ?? state.selectedWordSelectionId;
        if (state.vocabUi.isUserScrolling) {
          state.vocabUi.autoOpenCandidateSelectionId = selectionId;
        } else {
          scheduleAutoOpenMobileSheet(selectionId);
        }
      }
      renderVocabularyPanel();
      return;
    }

    cancelPendingAnalysis();

    state.isSelectedAnalysisLoading = true;
    state.vocabUi.feedbackState = 'processing';
    state.vocabUi.peekPillState = 'analyzing';
    setSelectedWordProcessing(true);
    if (canUseMobileVocabUi()) showMobilePeekPill({ mode: 'analyzing', word: display });
    renderVocabularyPanel();

    const actualRequestId = requestId ?? state.selectedWordSelectionId ?? (++state.analysisRequestSeq);
    state.analysisRequestSeq = actualRequestId;

    state.analysisDebounceTimer = setTimeout(() => {
      state.analysisDebounceTimer = null;
      void runInstantAnalysisRequest(actualRequestId, normalizedWord, display, context, { autoOpenOnReady, cacheKey });
    }, Math.max(0, debounceMs));
  }

  function storeGlobalVocabEntry(entry) {
    if (!entry) return;
    const language = entry.language || getCurrentBookLanguage();
    const normalized = entry.normalizedWord || entry.word || '';
    const key = entry.id || makeGlobalVocabId(language, normalized);
    if (!key) return;
    globalVocabByWord.set(key, entry);
  }

  async function runInstantAnalysisRequest(requestId, normalizedWord, displayWord, context, { autoOpenOnReady = false, cacheKey = null } = {}) {
    if (!normalizedWord || !displayWord) return;

    const controller = new AbortController();
    state.analysisAbortController = controller;
    const signal = controller.signal;

    try {
      const { analyzeWordInstant } = await import('../../ai-service.js');
      const result = await analyzeWordInstant(displayWord, context || { fullContext: '' }, { signal, bookLanguage: getCurrentBookLanguage() });

      if (requestId !== state.analysisRequestSeq) return;
      if (state.selectedWord !== normalizedWord) return;
      if (requestId !== state.selectedWordSelectionId) return;

      state.selectedWordAnalysis = result;
      if (cacheKey && state.instantAnalysisCache?.set) state.instantAnalysisCache.set(cacheKey, result);

      const existing = state.vocabularyByWord.get(normalizedWord) || null;
      if (existing) {
        const updated = await upsertBookVocabularyItem({
          ...existing,
          bookId: state.currentBookId,
          language: existing.language || getCurrentBookLanguage(),
          word: normalizedWord,
          displayWord: existing.displayWord || displayWord,
          lemma: existing.lemma || (typeof result?.lemma === 'string' && result.lemma.trim() ? result.lemma.trim() : null),
          analysis: result,
          context: existing.context || context,
          sourceChapterId: existing.sourceChapterId || state.currentBook?.chapters?.[state.currentChapterIndex]?.id || null
        });
        state.vocabularyByWord.set(updated.word, updated);
      }

      if (getEffectiveWordStatus(normalizedWord) === WORD_STATUSES.LEARNING) {
        const updatedGlobal = await upsertGlobalAnalysis(
          normalizedWord,
          result,
          context?.currentSentence || null,
          displayWord,
          state.currentBook?.language || null
        );
        storeGlobalVocabEntry(updatedGlobal);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Instant analysis error:', error);
      ensureVocabUiState();
      state.vocabUi.feedbackState = 'error';
      state.vocabUi.peekPillState = 'error';
      setSelectedWordProcessing(false);
      if (canUseMobileVocabUi()) showMobilePeekPill({ mode: 'error', word: displayWord, message: '分析失败，点此重试' });
      showNotification('分析失败: ' + error.message, 'error');
    } finally {
      if (state.analysisAbortController === controller) {
        state.analysisAbortController = null;
      }
      if (requestId === state.analysisRequestSeq && state.selectedWord === normalizedWord) {
        state.isSelectedAnalysisLoading = false;
        setSelectedWordProcessing(false);
        if (state.selectedWordAnalysis) {
          ensureVocabUiState();
          state.vocabUi.feedbackState = 'ready';
          state.vocabUi.peekPillState = 'ready';
          if (canUseMobileVocabUi()) showMobilePeekPill({ mode: 'ready', word: displayWord });

          if (autoOpenOnReady) {
            if (state.vocabUi.isUserScrolling) {
              state.vocabUi.autoOpenCandidateSelectionId = requestId;
            } else {
              scheduleAutoOpenMobileSheet(requestId);
            }
          }
        }
        renderVocabularyPanel();
      }
    }
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function selectWordFromVocabulary(normalizedWord) {
    const entry = state.vocabularyByWord.get(normalizedWord) || null;
    state.selectedWordSelectionId = (state.selectedWordSelectionId || 0) + 1;
    state.selectedWordSelectedAt = Date.now();
    state.selectedWord = normalizedWord;
    state.selectedWordDisplay = entry?.displayWord || normalizedWord;
    state.selectedWordContext = entry?.context || null;
    state.selectedWordAnalysis = entry?.analysis || null;

    const el = elements.readingContent.querySelector(`.word[data-word="${cssEscape(normalizedWord)}"]`);
    if (el) {
      if (state.selectedWordEl) state.selectedWordEl.classList.remove('word-selected');
      state.selectedWordEl = el;
      state.selectedWordEl.classList.add('word-selected');
      state.selectedWordEl.scrollIntoView({ block: 'center' });
    }
  }

  async function setSelectedWordStatus(nextStatus, options = {}) {
    if (!state.currentBookId || !state.selectedWord) return;

    const existingEntry = state.vocabularyByWord.get(state.selectedWord) || null;
    const prevStatus = existingEntry?.status || WORD_STATUSES.NEW;

    if (nextStatus === WORD_STATUSES.NEW) {
      if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(state.selectedWord, state.currentBookId, state.currentBook?.language || null);
        await refreshGlobalVocabCache();
      }
      await deleteBookVocabularyItem(state.currentBookId, state.selectedWord);
      state.vocabularyByWord.delete(state.selectedWord);
      if (applyWordStatusesToContainer) applyWordStatusesToContainer(elements.readingContent);
      renderVocabularyPanel();
      return;
    }

    const existing = existingEntry || {};
    const inferredLemma =
      existing.lemma
      || (typeof existing?.analysis?.lemma === 'string' ? existing.analysis.lemma.trim() : '')
      || (typeof state?.selectedWordAnalysis?.lemma === 'string' ? state.selectedWordAnalysis.lemma.trim() : '')
      || null;
    const updated = await upsertBookVocabularyItem({
      ...existing,
      bookId: state.currentBookId,
      language: getCurrentBookLanguage(),
      word: state.selectedWord,
      displayWord: existing.displayWord || state.selectedWordDisplay || state.selectedWord,
      lemma: inferredLemma,
      status: nextStatus,
      context: existing.context || state.selectedWordContext || null,
      analysis: existing.analysis || state.selectedWordAnalysis || null,
      sourceChapterId: existing.sourceChapterId || state.currentBook?.chapters?.[state.currentChapterIndex]?.id || null
    });

    state.vocabularyByWord.set(updated.word, updated);

    if (nextStatus === WORD_STATUSES.LEARNING) {
      const global = await ensureGlobalLearningCard({
        language: getCurrentBookLanguage(),
        normalizedWord: updated.word,
        displayWord: updated.displayWord || state.selectedWordDisplay || updated.word,
        bookId: state.currentBookId,
        analysis: updated.analysis || state.selectedWordAnalysis || null,
        contextSentence: updated?.context?.currentSentence || state.selectedWordContext?.currentSentence || null
      });
      storeGlobalVocabEntry(global);
    } else {
      if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, state.currentBookId, state.currentBook?.language || null);
        await refreshGlobalVocabCache();
      }
      if (nextStatus === WORD_STATUSES.KNOWN) {
        await ensureGlobalKnownEntry({
          language: getCurrentBookLanguage(),
          normalizedWord: updated.word,
          displayWord: updated.displayWord || state.selectedWordDisplay || updated.word,
          bookId: state.currentBookId
        });
      }
    }

    if (applyWordStatusesToContainer) applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();

    if (options?.trigger === 'click' && nextStatus === WORD_STATUSES.LEARNING) {
      showNotification('已加入学习', 'success');
    }
  }

  async function toggleVocabularyStatus(normalizedWord) {
    const entry = state.vocabularyByWord.get(normalizedWord);
    if (!entry) return;

    const prevStatus = entry.status;
    const nextStatus =
      entry.status === WORD_STATUSES.LEARNING ? WORD_STATUSES.KNOWN
        : entry.status === WORD_STATUSES.SEEN ? WORD_STATUSES.LEARNING
          : WORD_STATUSES.LEARNING;

    const inferredLemma =
      entry.lemma
      || (typeof entry?.analysis?.lemma === 'string' ? entry.analysis.lemma.trim() : '')
      || null;
    const updated = await upsertBookVocabularyItem({
      ...entry,
      bookId: state.currentBookId,
      language: getCurrentBookLanguage(),
      word: normalizedWord,
      lemma: inferredLemma,
      status: nextStatus
    });
    if (nextStatus === WORD_STATUSES.LEARNING) {
      const global = await ensureGlobalLearningCard({
        language: getCurrentBookLanguage(),
        normalizedWord: updated.word,
        displayWord: updated.displayWord || updated.word,
        bookId: state.currentBookId,
        analysis: updated.analysis || null,
        contextSentence: updated?.context?.currentSentence || null
      });
      storeGlobalVocabEntry(global);
    } else {
      if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, state.currentBookId, state.currentBook?.language || null);
        await refreshGlobalVocabCache();
      }
      if (nextStatus === WORD_STATUSES.KNOWN) {
        await ensureGlobalKnownEntry({
          language: getCurrentBookLanguage(),
          normalizedWord: updated.word,
          displayWord: updated.displayWord || updated.word,
          bookId: state.currentBookId
        });
      }
    }

    await refreshVocabularyCache();
    if (applyWordStatusesToContainer) applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();
  }

  async function handleVocabPanelClick(event) {
    const actionEl = event.target.closest?.('[data-action]');
    if (!actionEl) return;
    const inDesktop = Boolean(elements.vocabAnalysisContent?.contains(actionEl));
    const inMobile = Boolean(elements.mobileVocabContent?.contains(actionEl));
    if (!inDesktop && !inMobile) return;

    const action = actionEl.dataset.action;

    if (inMobile && action === 'expand-vocab') {
      ensureVocabUiState();
      state.vocabUi.isExpanded = true;
      state.vocabUi.expandedSelectionId = state.selectedWordSelectionId || null;
      renderMobileVocabSheetContent();
      applyMobileVocabSheetPosition();
      return;
    }

    if (inMobile && action === 'collapse-vocab') {
      ensureVocabUiState();
      state.vocabUi.isExpanded = false;
      state.vocabUi.expandedSelectionId = null;
      renderMobileVocabSheetContent();
      applyMobileVocabSheetPosition();
      return;
    }

    if (action === 'filter') {
      state.vocabFilter = actionEl.dataset.filter || WORD_STATUSES.LEARNING;
      renderVocabularyPanel();
      return;
    }

    if (action === 'select') {
      const word = actionEl.dataset.word;
      if (word) {
        selectWordFromVocabulary(word);
        renderVocabularyPanel();
      }
      return;
    }

    if (action === 'set-status') {
      const status = actionEl.dataset.status;
      if (status) await setSelectedWordStatus(status);
      return;
    }

    if (action === 'toggle-status') {
      const word = actionEl.dataset.word;
      if (word) await toggleVocabularyStatus(word);
      return;
    }

    if (action === 'retry-analysis') {
      queueSelectedWordAnalysis({ debounceMs: 0, force: true, requestId: state.selectedWordSelectionId, autoOpenOnReady: true });
    }
  }

  function createWordAnalysisCard(word, analysis, isLoading, context = null) {
    const card = document.createElement('div');
    card.className = 'vocab-card';

    if (isLoading) {
      card.innerHTML = `
            <div class="vocab-card-header">
                <span class="vocab-card-word">${escapeHtml(word)}</span>
            </div>
            <div class="vocab-card-body">
                <p class="loading">Analyzing...</p>
            </div>
        `;
      return card;
    }

    card.dataset.word = word;
    card.dataset.context = context?.currentSentence || '';
    card.dataset.meaning = analysis.meaning || '';
    card.dataset.usage = analysis.usage || '';
    card.dataset.contextualMeaning = analysis.contextualMeaning || '';

    card.innerHTML = `
        <div class="vocab-card-header">
            <span class="vocab-card-word">${escapeHtml(analysis.word || word)}</span>
            ${analysis.partOfSpeech ? `<span class="vocab-card-pos">${escapeHtml(analysis.partOfSpeech)}</span>` : ''}
        </div>
        <div class="vocab-card-body">
            ${analysis.furigana ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">读音</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.furigana)}</div>
                </div>
            ` : ''}
            ${analysis.meaning ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">含义</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.meaning)}</div>
                </div>
            ` : ''}
            ${analysis.kanjiOrigin ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">词源</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.kanjiOrigin)}</div>
                </div>
            ` : ''}
            ${analysis.politenessLevel ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">语体</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.politenessLevel)}</div>
                </div>
            ` : ''}
            ${analysis.conjugation ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">变位</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.conjugation)}</div>
                </div>
            ` : ''}
            ${analysis.genderPlural ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">性数</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.genderPlural)}</div>
                </div>
            ` : ''}
            ${analysis.usage ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">用法</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.usage)}</div>
                </div>
            ` : ''}
            ${analysis.contextualMeaning ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">上下文含义</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.contextualMeaning)}</div>
                </div>
            ` : ''}
        </div>
    `;

    return card;
  }

  function renderVocabularyPanel() {
    const isMobile = window.innerWidth <= 768;
    const container = elements.vocabAnalysisContent;
    ensureVocabUiState();

    if (!state.currentBookId) {
      container.innerHTML = '<p class="empty-state">导入书籍后开始学习</p>';
      return;
    }

    const counts = getVocabCounts();
    const activeFilter = state.vocabFilter || WORD_STATUSES.LEARNING;

    const items = Array.from(state.vocabularyByWord.values())
      .filter((item) => activeFilter === 'all' ? true : item.status === activeFilter)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    const selectedStatus = state.selectedWord ? getEffectiveWordStatus(state.selectedWord) : WORD_STATUSES.NEW;
    const selectedEntry = state.selectedWord ? state.vocabularyByWord.get(state.selectedWord) : null;
    const aiConfigured = isAiConfigured();
    const canRetryAnalysis = Boolean(state.selectedWord && !state.selectedWordAnalysis && !state.isSelectedAnalysisLoading && aiConfigured);

    const html = `
        <div class="vocab-panel-controls">
          <div class="vocab-filters">
            <button class="vocab-filter ${activeFilter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">
              All <span class="vocab-count">${counts.all}</span>
            </button>
            <button class="vocab-filter ${activeFilter === WORD_STATUSES.LEARNING ? 'active' : ''}" data-action="filter" data-filter="${WORD_STATUSES.LEARNING}">
              Learning <span class="vocab-count">${counts.learning}</span>
            </button>
            <button class="vocab-filter ${activeFilter === WORD_STATUSES.SEEN ? 'active' : ''}" data-action="filter" data-filter="${WORD_STATUSES.SEEN}">
              Seen <span class="vocab-count">${counts.seen}</span>
            </button>
            <button class="vocab-filter ${activeFilter === WORD_STATUSES.KNOWN ? 'active' : ''}" data-action="filter" data-filter="${WORD_STATUSES.KNOWN}">
              Known <span class="vocab-count">${counts.known}</span>
            </button>
          </div>
        </div>

        <div class="vocab-selected" id="selectedWordSlot">
          ${state.selectedWord ? `
            <div class="vocab-selected-header">
              <div class="vocab-selected-title">
                <span class="status-dot status-dot-${escapeHtml(selectedStatus)}"></span>
                <span class="vocab-selected-word">${escapeHtml(state.selectedWordDisplay || state.selectedWord)}</span>
              </div>
              <div class="vocab-selected-actions">
                <button class="btn btn-ghost btn-small ${selectedStatus === WORD_STATUSES.LEARNING ? 'active' : ''}" data-action="set-status" data-status="${WORD_STATUSES.LEARNING}">Learning</button>
                <button class="btn btn-ghost btn-small ${selectedStatus === WORD_STATUSES.SEEN ? 'active' : ''}" data-action="set-status" data-status="${WORD_STATUSES.SEEN}">Seen</button>
                <button class="btn btn-ghost btn-small ${selectedStatus === WORD_STATUSES.KNOWN ? 'active' : ''}" data-action="set-status" data-status="${WORD_STATUSES.KNOWN}">Known</button>
                <button class="btn btn-ghost btn-small ${selectedStatus === WORD_STATUSES.NEW ? 'active' : ''}" data-action="set-status" data-status="${WORD_STATUSES.NEW}">New</button>
                ${canRetryAnalysis ? `<button class="btn btn-ghost btn-small" data-action="retry-analysis" title="Retry">⟳</button>` : ''}
              </div>
            </div>
            <div class="vocab-selected-body" id="selectedWordAnalysisSlot">
              ${!state.selectedWordAnalysis && !state.isSelectedAnalysisLoading
          ? `<p class="empty-state">${aiConfigured ? '未分析或分析失败，可点 ⟳ 获取解释' : '请先在设置中配置 AI 以自动分析'}</p>`
          : ''}
            </div>
          ` : `
            <p class="empty-state">点击正文中的单词开始</p>
          `}
        </div>

        <div class="vocab-list" id="vocabList">
          ${items.length === 0 ? `<p class="empty-state">暂无词汇</p>` : items.map((item) => `
            <div class="vocab-list-item" data-word="${escapeHtml(item.word)}">
              <button class="vocab-list-main" data-action="select" data-word="${escapeHtml(item.word)}">
                <span class="status-dot status-dot-${escapeHtml(item.status)}"></span>
                <span class="vocab-list-word">${escapeHtml(item.displayWord || item.word)}</span>
              </button>
              <div class="vocab-list-actions">
                <button class="btn btn-ghost btn-small" data-action="toggle-status" data-word="${escapeHtml(item.word)}">↻</button>
              </div>
            </div>
          `).join('')}
        </div>
    `;

    container.innerHTML = html;

    // Mirror to mobile sheet if needed (only when explicitly opened)
    if (elements.mobileVocabContent && elements.mobileVocabOverlay) {
      const shouldShowSheet = Boolean(state.selectedWord && isMobile && state.vocabUi.sheetState === 'open');
      if (shouldShowSheet) {
        applyMobileVocabSheetPosition();
        renderMobileVocabSheetContent();
        elements.mobileVocabOverlay.classList.add('active');
      } else {
        elements.mobileVocabOverlay.classList.remove('active');
        clearMobileVocabSheetPosition();
      }
    }

    if (state.selectedWord && (state.isSelectedAnalysisLoading || state.selectedWordAnalysis)) {
      const slots = document.querySelectorAll('#selectedWordAnalysisSlot');
      slots.forEach(slot => {
        slot.innerHTML = '';
        const card = createWordAnalysisCard(
          state.selectedWordDisplay || state.selectedWord,
          state.selectedWordAnalysis || { word: state.selectedWordDisplay || state.selectedWord },
          Boolean(state.isSelectedAnalysisLoading && !state.selectedWordAnalysis),
          selectedEntry?.context || state.selectedWordContext
        );
        slot.appendChild(card);
      });
    }
  }

  // Handle mobile overlay click
  if (elements.mobileVocabOverlay) {
    elements.mobileVocabOverlay.addEventListener('click', (e) => {
      if (e.target === elements.mobileVocabOverlay) {
        closeMobileVocabSheet({ clearSelection: true });
      }
    });
  }

  if (elements.mobileVocabContent) {
    elements.mobileVocabContent.addEventListener('click', handleVocabPanelClick);
  }

  setupMobileScrollTracking();
  setupMobilePeekPillControls();
  setupMobileSheetPositionTracking();

  return {
    setApplyWordStatusesToContainer,
    refreshVocabularyCache,
    renderVocabularyPanel,
    switchTab,
    handleVocabPanelClick,
    queueSelectedWordAnalysis,
    getCachedAnalysisForSelectedWord,
    setSelectedWordStatus,
    openMobileVocabSheet,
    closeMobileVocabSheet
  };
}
