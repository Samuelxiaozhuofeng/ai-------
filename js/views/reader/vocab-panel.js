import { WORD_STATUSES } from '../../word-status.js';
import { showNotification } from '../../ui/notifications.js';
import { ensureGlobalLearningCard, removeBookFromGlobalLearningCard, upsertGlobalAnalysis } from '../../srs-service.js';
import { getSettings, getAnkiSettings } from '../../storage.js';
import { addNote } from '../../anki-service.js';
import {
  makeGlobalVocabId,
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
  /** @type {((container: HTMLElement) => void) | null} */
  let applyWordStatusesToContainer = null;

  function setApplyWordStatusesToContainer(fn) {
    applyWordStatusesToContainer = typeof fn === 'function' ? fn : null;
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

  function queueSelectedWordAnalysis({ debounceMs = 250, force = false } = {}) {
    if (!state.selectedWord || !state.selectedWordDisplay) return;
    if (!isAiConfigured()) return;
    if (!force && state.selectedWordAnalysis) return;

    cancelPendingAnalysis();

    state.isSelectedAnalysisLoading = true;
    renderVocabularyPanel();

    const requestId = ++state.analysisRequestSeq;
    const key = state.selectedWord;
    const display = state.selectedWordDisplay;
    const context = state.selectedWordContext;

    state.analysisDebounceTimer = setTimeout(() => {
      state.analysisDebounceTimer = null;
      void runInstantAnalysisRequest(requestId, key, display, context);
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

  async function runInstantAnalysisRequest(requestId, normalizedWord, displayWord, context) {
    if (!normalizedWord || !displayWord) return;

    const controller = new AbortController();
    state.analysisAbortController = controller;
    const signal = controller.signal;

    try {
      const { analyzeWordInstant } = await import('../../ai-service.js');
      const result = await analyzeWordInstant(displayWord, context || { fullContext: '' }, { signal, bookLanguage: getCurrentBookLanguage() });

      if (requestId !== state.analysisRequestSeq) return;
      if (state.selectedWord !== normalizedWord) return;

      state.selectedWordAnalysis = result;

      const existing = state.vocabularyByWord.get(normalizedWord) || null;
      if (existing) {
        const updated = await upsertBookVocabularyItem({
          ...existing,
          bookId: state.currentBookId,
          language: existing.language || getCurrentBookLanguage(),
          word: normalizedWord,
          displayWord: existing.displayWord || displayWord,
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
      showNotification('分析失败: ' + error.message, 'error');
    } finally {
      if (state.analysisAbortController === controller) {
        state.analysisAbortController = null;
      }
      if (requestId === state.analysisRequestSeq && state.selectedWord === normalizedWord) {
        state.isSelectedAnalysisLoading = false;
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
    const updated = await upsertBookVocabularyItem({
      ...existing,
      bookId: state.currentBookId,
      language: getCurrentBookLanguage(),
      word: state.selectedWord,
      displayWord: existing.displayWord || state.selectedWordDisplay || state.selectedWord,
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
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
      await removeBookFromGlobalLearningCard(updated.word, state.currentBookId, state.currentBook?.language || null);
      await refreshGlobalVocabCache();
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

    const updated = await upsertBookVocabularyItem({ ...entry, bookId: state.currentBookId, language: getCurrentBookLanguage(), word: normalizedWord, status: nextStatus });
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
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
      await removeBookFromGlobalLearningCard(updated.word, state.currentBookId, state.currentBook?.language || null);
      await refreshGlobalVocabCache();
    }

    await refreshVocabularyCache();
    if (applyWordStatusesToContainer) applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();
  }

  async function handleVocabPanelClick(event) {
    const actionEl = event.target.closest?.('[data-action]');
    if (!actionEl || !elements.vocabAnalysisContent.contains(actionEl)) return;

    const action = actionEl.dataset.action;
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
      queueSelectedWordAnalysis({ debounceMs: 0, force: true });
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
        <div class="vocab-card-footer">
            <button class="vocab-card-anki-btn" title="添加到 Anki">+</button>
        </div>
    `;

    const ankiBtn = card.querySelector('.vocab-card-anki-btn');
    ankiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleAddToAnki(card, ankiBtn);
    });

    return card;
  }

  async function handleAddToAnki(card, button) {
    if (button.classList.contains('added')) return;

    const ankiSettings = getAnkiSettings();

    if (!ankiSettings.deckName || !ankiSettings.modelName) {
      showNotification('请先在设置中配置 Anki 牌组和笔记类型', 'error');
      return;
    }

    const word = card.dataset.word || '';
    const context = card.dataset.context || '';
    const meaning = card.dataset.meaning || '';
    const usage = card.dataset.usage || '';
    const contextualMeaning = card.dataset.contextualMeaning || '';

    const fields = {};
    const { fieldMapping } = ankiSettings;

    if (fieldMapping.word && word) {
      fields[fieldMapping.word] = word;
    }
    if (fieldMapping.context && context) {
      fields[fieldMapping.context] = context;
    }
    if (fieldMapping.meaning && meaning) {
      fields[fieldMapping.meaning] = meaning;
    }
    if (fieldMapping.usage && usage) {
      fields[fieldMapping.usage] = usage;
    }
    if (fieldMapping.contextualMeaning && contextualMeaning) {
      fields[fieldMapping.contextualMeaning] = contextualMeaning;
    }

    if (Object.keys(fields).length === 0) {
      showNotification('请先在设置中配置字段映射', 'error');
      return;
    }

    button.classList.add('loading');
    button.textContent = '';

    try {
      await addNote(ankiSettings.deckName, ankiSettings.modelName, fields);

      button.classList.remove('loading');
      button.classList.add('added');
      button.textContent = '✓';
      button.title = '已添加到 Anki';
    } catch (error) {
      console.error('Failed to add to Anki:', error);
      button.classList.remove('loading');
      button.textContent = '+';
      showNotification(error.message, 'error');
    }
  }

  function renderVocabularyPanel() {
    const isMobile = window.innerWidth <= 768;
    const container = elements.vocabAnalysisContent;

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

    // Mirror to mobile sheet if needed
    if (elements.mobileVocabContent) {
      if (state.selectedWord && isMobile) {
        elements.mobileVocabContent.innerHTML = html;
        elements.mobileVocabOverlay.classList.add('active');
        // Attach event listeners to mirrored content
        elements.mobileVocabContent.addEventListener('click', handleVocabPanelClick);
      } else if (!state.selectedWord && isMobile) {
        elements.mobileVocabOverlay.classList.remove('active');
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
        state.selectedWord = null;
        if (state.selectedWordEl) {
          state.selectedWordEl.classList.remove('word-selected');
          state.selectedWordEl = null;
        }
        elements.mobileVocabOverlay.classList.remove('active');
        renderVocabularyPanel();
      }
    });
  }

  return {
    setApplyWordStatusesToContainer,
    refreshVocabularyCache,
    renderVocabularyPanel,
    switchTab,
    handleVocabPanelClick,
    queueSelectedWordAnalysis,
    getCachedAnalysisForSelectedWord,
    setSelectedWordStatus
  };
}
