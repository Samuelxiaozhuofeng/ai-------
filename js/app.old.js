/**
 * (legacy backup; kept for reference during refactor)
 * Language Reader - Main Application
 * Coordinates all modules and handles UI interactions
 */

import { getSyncStatus, setSyncStatusListener, startBackgroundSync, stopBackgroundSync, syncNow } from './sync-service.js';
import { elements } from './ui/dom-refs.js';
import { showNotification } from './ui/notifications.js';
import { ViewRouter } from './core/view-router.js';
import { initDB } from './db.js';
import { initTheme, toggleTheme } from './ui/theme-manager.js';
import { initLanguageFilter } from './core/language-filter.js';
import { initAutoStudyEnabled } from './core/auto-study.js';
import { refreshGlobalVocabCache } from './core/global-vocab-cache.js';
import { getLayout } from './storage.js';
import { createBookshelfController } from './views/bookshelf.js';
import { createReaderController } from './views/reader.js';
import { createReviewController } from './views/review.js';
import { createVocabLibraryController } from './views/vocab-library.js';
import { createSettingsModalController } from './ui/settings-modal.js';

// ============================================
// State
// ============================================
let currentView = 'bookshelf'; // 'bookshelf' | 'reader' | 'review' | 'vocab-library'

// ============================================
// Controllers / Router
// ============================================
const viewRouter = new ViewRouter({
    bookshelf: elements.bookshelfView,
    reader: elements.readerView,
    review: elements.reviewView,
    'vocab-library': elements.vocabLibraryView
});
viewRouter.currentView = currentView;

const bookshelfController = createBookshelfController(elements);
const readerController = createReaderController(elements);
const reviewController = createReviewController(elements);
const vocabLibraryController = createVocabLibraryController(elements);
const settingsModalController = createSettingsModalController(elements);

// ============================================
// Initialization
// ============================================
async function init() {
    try {
        await initDB();
        console.log('📚 Database initialized');

        initLanguageFilter();
        initAutoStudyEnabled();

        await refreshGlobalVocabCache();

        initTheme(elements);

        readerController.applyLayout(getLayout());

        bookshelfController.init({
            onOpenBook: switchToReader,
            onOpenReview: switchToReview,
            onOpenVocabLibrary: switchToVocabLibrary,
            onToggleTheme: () => toggleTheme(elements)
        });
        readerController.init({ onBackToBookshelf: switchToBookshelf });
        reviewController.init({ onBackToBookshelf: switchToBookshelf });
        vocabLibraryController.init({ onBackToBookshelf: switchToBookshelf, onStartReview: switchToReview });
        settingsModalController.init({
            getSyncStatus,
            onAfterSave: handleAfterSettingsSaved,
            onSyncNow: () => {
                const bookId = readerController.getCurrentBookId();
                if (bookId) syncNow(bookId);
            }
        });

        setupGlobalKeyHandlers();

        // Sync indicator
        setSyncStatusListener((status) => settingsModalController.updateSyncUI(status));
        settingsModalController.updateSyncUI(getSyncStatus());

        viewRouter.navigate('bookshelf');
        currentView = 'bookshelf';
        await bookshelfController.refreshBookshelf();

        console.log('📚 Language Reader initialized');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showNotification('初始化失败: ' + error.message, 'error');
    }
}

function setupGlobalKeyHandlers() {
    document.addEventListener('keydown', (e) => {
        const tag = e.target?.tagName?.toLowerCase?.() || '';
        const isTypingContext = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

        if (e.key === 'Escape') {
            settingsModalController.handleEscape();
            bookshelfController.handleEscape();
            vocabLibraryController.handleEscape();
            readerController.handleEscape();

            if (currentView === 'review' || currentView === 'vocab-library') {
                switchToBookshelf();
            }
            return;
        }

        if (!isTypingContext && currentView === 'review') {
            if (reviewController.handleKeyDown(e)) return;
        }

        if (!isTypingContext && currentView === 'reader') {
            if (readerController.handleKeyDown(e)) return;
        }
    });
}

function handleAfterSettingsSaved(settings) {
    void bookshelfController.refreshBookshelfReviewButtons();

    stopBackgroundSync();
    const bookId = readerController.getCurrentBookId();
    if (currentView === 'reader' && bookId) {
        startBackgroundSync(bookId);
        if (settings?.syncEnabled) syncNow(bookId);
    }
}

// ============================================
// Word Tokenization & Rendering
// ============================================

async function handleReadingWordClick(event) {
    if (Date.now() < suppressWordClickUntil) return;

    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;

    const target = event.target.closest?.('.word');
    if (!target || !elements.readingContent.contains(target)) return;

    if (selectedWordEl) selectedWordEl.classList.remove('word-selected');
    selectedWordEl = target;
    selectedWordEl.classList.add('word-selected');

    selectedWord = target.dataset.word || null;
    selectedWordDisplay = target.textContent || selectedWord;
    selectedWordContext = extractContextForWordSpan(target);
    if (selectedWord) clickedWordsOnPage.add(selectedWord);

    const existing = selectedWord ? vocabularyByWord.get(selectedWord) : null;
    selectedWordAnalysis = getCachedAnalysisForSelectedWord(selectedWord, existing) || null;
    isSelectedAnalysisLoading = false;

    switchTab('vocab-analysis');

    // Auto-study behavior:
    const effectiveStatus = selectedWord ? getEffectiveWordStatus(selectedWord) : WORD_STATUSES.NEW;
    const shouldAutoStudy = Boolean(
        selectedWord
        && getAutoStudyEnabled()
        && effectiveStatus !== WORD_STATUSES.KNOWN
        && effectiveStatus !== WORD_STATUSES.LEARNING
    );
    if (shouldAutoStudy) {
        await setSelectedWordStatus(WORD_STATUSES.LEARNING, { trigger: 'click' });
    }

    // Auto-analyze when AI is configured.
    if (selectedWord && !selectedWordAnalysis && isAiConfigured()) {
        queueSelectedWordAnalysis({ debounceMs: 250 });
    }

    renderVocabularyPanel();
}

function getCachedAnalysisForSelectedWord(normalizedWord, existingEntry = null) {
    const local = existingEntry || (normalizedWord ? vocabularyByWord.get(normalizedWord) : null);
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
    if (analysisDebounceTimer) {
        clearTimeout(analysisDebounceTimer);
        analysisDebounceTimer = null;
    }
    if (analysisAbortController) {
        try { analysisAbortController.abort(); } catch { /* ignore */ }
        analysisAbortController = null;
    }
}

function queueSelectedWordAnalysis({ debounceMs = 250, force = false } = {}) {
    if (!selectedWord || !selectedWordDisplay) return;
    if (!isAiConfigured()) return;
    if (!force && selectedWordAnalysis) return;

    cancelPendingAnalysis();

    isSelectedAnalysisLoading = true;
    renderVocabularyPanel();

    const requestId = ++analysisRequestSeq;
    const key = selectedWord;
    const display = selectedWordDisplay;
    const context = selectedWordContext;

    analysisDebounceTimer = setTimeout(() => {
        analysisDebounceTimer = null;
        void runInstantAnalysisRequest(requestId, key, display, context);
    }, Math.max(0, debounceMs));
}

async function runInstantAnalysisRequest(requestId, normalizedWord, displayWord, context) {
    if (!normalizedWord || !displayWord) return;

    const controller = new AbortController();
    analysisAbortController = controller;
    const signal = controller.signal;

    try {
        const { analyzeWordInstant } = await import('./ai-service.js');
        const result = await analyzeWordInstant(displayWord, context || { fullContext: '' }, { signal, bookLanguage: getCurrentBookLanguage() });

        if (requestId !== analysisRequestSeq) return;
        if (selectedWord !== normalizedWord) return;

        selectedWordAnalysis = result;

        // Persist analysis for saved words; keep it in-memory for new words until user saves.
        const existing = vocabularyByWord.get(normalizedWord) || null;
        if (existing) {
            const updated = await upsertVocabularyItem({
                ...existing,
                bookId: currentBookId,
                language: existing.language || getCurrentBookLanguage(),
                word: normalizedWord,
                displayWord: existing.displayWord || displayWord,
                analysis: result,
                context: existing.context || context,
                sourceChapterId: existing.sourceChapterId || currentBook?.chapters?.[currentChapterIndex]?.id || null
            });
            vocabularyByWord.set(updated.word, updated);
        }

        if (getEffectiveWordStatus(normalizedWord) === WORD_STATUSES.LEARNING) {
            const updatedGlobal = await upsertGlobalAnalysis(
                normalizedWord,
                result,
                context?.currentSentence || null,
                displayWord,
                currentBook?.language || null
            );
            if (updatedGlobal) {
                globalVocabByWord.set(updatedGlobal.id || updatedGlobal.normalizedWord, updatedGlobal);
            }
        }
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Instant analysis error:', error);
        showNotification('分析失败: ' + error.message, 'error');
    } finally {
        if (analysisAbortController === controller) {
            analysisAbortController = null;
        }
        if (requestId === analysisRequestSeq && selectedWord === normalizedWord) {
            isSelectedAnalysisLoading = false;
            renderVocabularyPanel();
        }
    }
}

function getSelectionParagraph(node) {
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el?.closest?.('p') || null;
}

function extractContextForRange(range) {
    const startP = getSelectionParagraph(range?.startContainer);
    const endP = getSelectionParagraph(range?.endContainer);
    if (!startP || !endP || startP !== endP) return null;

    const paragraphText = startP?.textContent?.trim?.() || '';
    if (!paragraphText) {
        return {
            previousSentence: '',
            currentSentence: paragraphText,
            nextSentence: '',
            fullContext: paragraphText
        };
    }

    const sentenceDelimiters = /[.!?¡¿。！？]+\s*/g;

    const preRange = document.createRange();
    preRange.selectNodeContents(startP);
    try {
        preRange.setEnd(range.startContainer, range.startOffset);
    } catch {
        // If setEnd fails, fall back to full paragraph context.
        return {
            previousSentence: '',
            currentSentence: paragraphText,
            nextSentence: '',
            fullContext: paragraphText
        };
    }

    const offset = preRange.toString().length;

    const boundaries = [0];
    let match;
    while ((match = sentenceDelimiters.exec(paragraphText)) !== null) {
        boundaries.push(match.index + match[0].length);
    }
    boundaries.push(paragraphText.length);

    let currentSentenceIndex = -1;
    for (let i = 0; i < boundaries.length - 1; i++) {
        if (offset >= boundaries[i] && offset < boundaries[i + 1]) {
            currentSentenceIndex = i;
            break;
        }
    }
    if (currentSentenceIndex === -1) {
        currentSentenceIndex = boundaries.length - 2;
    }

    const currentSentence = paragraphText.substring(
        boundaries[currentSentenceIndex],
        boundaries[currentSentenceIndex + 1]
    ).trim();

    return {
        previousSentence: '',
        currentSentence,
        nextSentence: '',
        fullContext: currentSentence
    };
}

function handleReadingSelectionEnd() {
    // Run after mouseup/touchend so selection text is final.
    setTimeout(() => {
        const selection = window.getSelection?.();
        if (!selection || selection.isCollapsed) return;

        const selectedText = collapseWhitespace(selection.toString());
        if (!selectedText) return;
        if (selectedText.length > 80) return;
        if (/\n/.test(selectedText)) return;

        const range = selection.rangeCount ? selection.getRangeAt(0) : null;
        if (!range) return;

        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;
        const anchorEl = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentNode : anchorNode;
        const focusEl = focusNode?.nodeType === Node.TEXT_NODE ? focusNode.parentNode : focusNode;
        if (!elements.readingContent.contains(anchorEl) || !elements.readingContent.contains(focusEl)) return;

        const context = extractContextForRange(range);
        if (!context) return;

        const normalized = normalizeTextToKey(selectedText);
        if (!normalized) return;

        suppressWordClickUntil = Date.now() + 300;

        if (selectedWordEl) selectedWordEl.classList.remove('word-selected');
        selectedWordEl = null;

        selectedWord = normalized;
        selectedWordDisplay = selectedText;
        selectedWordContext = context;
        selectedWordAnalysis = getCachedAnalysisForSelectedWord(selectedWord) || null;
        isSelectedAnalysisLoading = false;

        // Mark constituent words as "clicked" so page-turn auto-marking doesn't advance them.
        selectedWord.split(' ').forEach((part) => {
            const token = normalizeWord(part);
            if (token) clickedWordsOnPage.add(token);
        });

        switchTab('vocab-analysis');

        if (!selectedWordAnalysis && isAiConfigured()) {
            queueSelectedWordAnalysis({ debounceMs: 250 });
        }

        renderVocabularyPanel();
    }, 0);
}

function getWordStatus(normalizedWord) {
    return vocabularyByWord.get(normalizedWord)?.status || WORD_STATUSES.NEW;
}

function getCurrentBookLanguage() {
    const lang = (currentBook?.language || getLanguageFilter() || 'en').trim();
    if (Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, lang)) return lang;
    return 'en';
}

function getGlobalVocabKeyForWord(normalizedWord, language = null) {
    const lang = (typeof language === 'string' ? language : '') || getCurrentBookLanguage();
    return lang ? makeGlobalVocabId(lang, normalizedWord) : normalizedWord;
}

function getGlobalVocabEntryForWord(normalizedWord, language = null) {
    const key = getGlobalVocabKeyForWord(normalizedWord, language);
    if (!key) return null;
    return globalVocabByWord.get(key) || null;
}

function getEffectiveWordStatus(normalizedWord) {
    const local = vocabularyByWord.get(normalizedWord)?.status || null;
    if (local) return local;
    const global = getGlobalVocabEntryForWord(normalizedWord, getCurrentBookLanguage());
    if (global?.status === 'learning') return WORD_STATUSES.LEARNING;
    return WORD_STATUSES.NEW;
}

function applyWordStatusesToContainer(container) {
    container.querySelectorAll('.word').forEach((el) => {
        const normalizedWord = el.dataset.word || '';
        const status = normalizedWord ? getEffectiveWordStatus(normalizedWord) : WORD_STATUSES.NEW;
        el.classList.remove('word-new', 'word-seen', 'word-learning', 'word-known');
        el.classList.add(statusToClass(status));
    });
}

function extractContextForWordSpan(wordEl) {
    const paragraph = wordEl.closest('p');
    const paragraphText = paragraph?.textContent?.trim() || '';
    if (!paragraphText || !paragraph) {
        return {
            previousSentence: '',
            currentSentence: paragraphText,
            nextSentence: '',
            fullContext: paragraphText
        };
    }

    const sentenceDelimiters = /[.!?¡¿。！？]+\s*/g;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.setEndBefore(wordEl);
    const offset = range.toString().length;

    const boundaries = [0];
    let match;
    while ((match = sentenceDelimiters.exec(paragraphText)) !== null) {
        boundaries.push(match.index + match[0].length);
    }
    boundaries.push(paragraphText.length);

    let currentSentenceIndex = -1;
    for (let i = 0; i < boundaries.length - 1; i++) {
        if (offset >= boundaries[i] && offset < boundaries[i + 1]) {
            currentSentenceIndex = i;
            break;
        }
    }
    if (currentSentenceIndex === -1) {
        currentSentenceIndex = boundaries.length - 2;
    }

    const currentSentence = paragraphText.substring(
        boundaries[currentSentenceIndex],
        boundaries[currentSentenceIndex + 1]
    ).trim();

    return {
        previousSentence: '',
        currentSentence,
        nextSentence: '',
        fullContext: currentSentence
    };
}

async function refreshVocabularyCache() {
    if (!currentBookId) {
        vocabularyByWord = new Map();
        return;
    }

    const items = await listVocabulary(currentBookId, null);
    vocabularyByWord = new Map(items.map((item) => [item.word, item]));
}

function getVocabCounts() {
    let learning = 0;
    let seen = 0;
    let known = 0;
    vocabularyByWord.forEach((item) => {
        if (item.status === WORD_STATUSES.LEARNING) learning += 1;
        if (item.status === WORD_STATUSES.SEEN) seen += 1;
        if (item.status === WORD_STATUSES.KNOWN) known += 1;
    });
    return { learning, seen, known, all: learning + seen + known };
}

function renderVocabularyPanel() {
    const container = elements.vocabAnalysisContent;

    if (!currentBookId) {
        container.innerHTML = '<p class="empty-state">导入书籍后开始学习</p>';
        return;
    }

    const counts = getVocabCounts();
    const activeFilter = vocabFilter || WORD_STATUSES.LEARNING;

    const items = Array.from(vocabularyByWord.values())
        .filter((item) => activeFilter === 'all' ? true : item.status === activeFilter)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    const selectedStatus = selectedWord ? getEffectiveWordStatus(selectedWord) : WORD_STATUSES.NEW;
    const selectedEntry = selectedWord ? vocabularyByWord.get(selectedWord) : null;
    const aiConfigured = isAiConfigured();
    const canRetryAnalysis = Boolean(selectedWord && !selectedWordAnalysis && !isSelectedAnalysisLoading && aiConfigured);

    container.innerHTML = `
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

        <div class="vocab-selected-panel">
          ${selectedWord ? `
            <div class="vocab-selected-header">
              <div class="vocab-selected-left">
                <span class="status-dot status-dot-${selectedStatus}"></span>
                <span class="vocab-selected-word">${escapeHtml(selectedWordDisplay || selectedWord)}</span>
                <span class="vocab-selected-status">${escapeHtml(selectedStatus)}</span>
              </div>
              <div class="vocab-selected-actions">
                ${selectedStatus !== WORD_STATUSES.LEARNING ? `<button class="btn btn-secondary btn-small" data-action="set-status" data-status="${WORD_STATUSES.LEARNING}">加入学习</button>` : ''}
                ${selectedStatus !== WORD_STATUSES.KNOWN ? `<button class="btn btn-secondary btn-small" data-action="set-status" data-status="${WORD_STATUSES.KNOWN}">标记已掌握</button>` : ''}
                ${selectedStatus !== WORD_STATUSES.NEW ? `<button class="btn btn-ghost btn-small" data-action="set-status" data-status="${WORD_STATUSES.NEW}">移除</button>` : ''}
                ${canRetryAnalysis ? `<button class="btn btn-ghost btn-small" data-action="retry-analysis" title="重试分析">⟳</button>` : ''}
              </div>
            </div>
            <div class="vocab-selected-body" id="selectedWordAnalysisSlot">
              ${!selectedWordAnalysis && !isSelectedAnalysisLoading
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

    if (selectedWord && (isSelectedAnalysisLoading || selectedWordAnalysis)) {
        const slot = container.querySelector('#selectedWordAnalysisSlot');
        if (slot) {
            slot.innerHTML = '';
            const card = createWordAnalysisCard(
                selectedWordDisplay || selectedWord,
                selectedWordAnalysis || { word: selectedWordDisplay || selectedWord },
                Boolean(isSelectedAnalysisLoading && !selectedWordAnalysis),
                selectedEntry?.context || selectedWordContext
            );
            slot.appendChild(card);
        }
    }
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
}

function selectWordFromVocabulary(normalizedWord) {
    const entry = vocabularyByWord.get(normalizedWord) || null;
    selectedWord = normalizedWord;
    selectedWordDisplay = entry?.displayWord || normalizedWord;
    selectedWordContext = entry?.context || null;
    selectedWordAnalysis = entry?.analysis || null;

    // Try to highlight the first occurrence on the current page.
    const el = elements.readingContent.querySelector(`.word[data-word="${cssEscape(normalizedWord)}"]`);
    if (el) {
        if (selectedWordEl) selectedWordEl.classList.remove('word-selected');
        selectedWordEl = el;
        selectedWordEl.classList.add('word-selected');
        selectedWordEl.scrollIntoView({ block: 'center' });
    }
}

async function setSelectedWordStatus(nextStatus, options = {}) {
    if (!currentBookId || !selectedWord) return;

    const existingEntry = vocabularyByWord.get(selectedWord) || null;
    const prevStatus = existingEntry?.status || WORD_STATUSES.NEW;

    if (nextStatus === WORD_STATUSES.NEW) {
        if (prevStatus === WORD_STATUSES.LEARNING) {
            await removeBookFromGlobalLearningCard(selectedWord, currentBookId, currentBook?.language || null);
            await refreshGlobalVocabCache();
        }
        await deleteVocabularyItem(currentBookId, selectedWord);
        vocabularyByWord.delete(selectedWord);
        applyWordStatusesToContainer(elements.readingContent);
        renderVocabularyPanel();
        return;
    }

    const existing = existingEntry || {};
    const updated = await upsertVocabularyItem({
        ...existing,
        bookId: currentBookId,
        language: getCurrentBookLanguage(),
        word: selectedWord,
        displayWord: existing.displayWord || selectedWordDisplay || selectedWord,
        status: nextStatus,
        context: existing.context || selectedWordContext || null,
        analysis: existing.analysis || selectedWordAnalysis || null,
        sourceChapterId: existing.sourceChapterId || currentBook?.chapters?.[currentChapterIndex]?.id || null
    });

    vocabularyByWord.set(updated.word, updated);

    if (nextStatus === WORD_STATUSES.LEARNING) {
        const global = await ensureGlobalLearningCard({
            language: getCurrentBookLanguage(),
            normalizedWord: updated.word,
            displayWord: updated.displayWord || selectedWordDisplay || updated.word,
            bookId: currentBookId,
            analysis: updated.analysis || selectedWordAnalysis || null,
            contextSentence: updated?.context?.currentSentence || selectedWordContext?.currentSentence || null
        });
        globalVocabByWord.set(global.id || global.normalizedWord, global);
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, currentBookId, currentBook?.language || null);
        await refreshGlobalVocabCache();
    }

    applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();

    if (options?.trigger === 'click' && nextStatus === WORD_STATUSES.LEARNING) {
        showNotification('已加入学习', 'success');
    }
}

async function toggleVocabularyStatus(normalizedWord) {
    const entry = vocabularyByWord.get(normalizedWord);
    if (!entry) return;

    const prevStatus = entry.status;
    const nextStatus =
        entry.status === WORD_STATUSES.LEARNING ? WORD_STATUSES.KNOWN
            : entry.status === WORD_STATUSES.SEEN ? WORD_STATUSES.LEARNING
                : WORD_STATUSES.LEARNING;

    const updated = await upsertVocabularyItem({ ...entry, bookId: currentBookId, language: getCurrentBookLanguage(), word: normalizedWord, status: nextStatus });
    if (nextStatus === WORD_STATUSES.LEARNING) {
        const global = await ensureGlobalLearningCard({
            language: getCurrentBookLanguage(),
            normalizedWord: updated.word,
            displayWord: updated.displayWord || updated.word,
            bookId: currentBookId,
            analysis: updated.analysis || null,
            contextSentence: updated?.context?.currentSentence || null
        });
        globalVocabByWord.set(global.id || global.normalizedWord, global);
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, currentBookId, currentBook?.language || null);
        await refreshGlobalVocabCache();
    }
    await refreshVocabularyCache();
    applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();
}

async function handleVocabPanelClick(event) {
    const actionEl = event.target.closest?.('[data-action]');
    if (!actionEl || !elements.vocabAnalysisContent.contains(actionEl)) return;

    const action = actionEl.dataset.action;
    if (action === 'filter') {
        vocabFilter = actionEl.dataset.filter || WORD_STATUSES.LEARNING;
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

// ============================================
// Page-Flip Mode
// ============================================
let paginationMeasure = null;

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

            // Finish current page if it has content
            if (pageWrapper.childNodes.length > 0) {
                pages.push(pageWrapper.innerHTML);
                pageWrapper.innerHTML = '';
            }

            // Try again on a fresh page
            pageWrapper.appendChild(clone);
            if (measure.scrollHeight > pageHeightPx) {
                // Paragraph is too tall even on an empty page: split by tokens.
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

function updatePageControls() {
    const total = chapterPages.length || 1;
    const pageNumber = Math.min(currentPageIndex + 1, total);
    elements.pageIndicator.textContent = `${pageNumber} / ${total}`;

    const hasPrev = (chapterPages.length > 0) && (currentPageIndex > 0 || currentChapterIndex > 0);
    const hasNext = (chapterPages.length > 0) && (currentPageIndex < total - 1 || (currentBook && currentChapterIndex < currentBook.chapters.length - 1));

    elements.prevPageBtn.disabled = !hasPrev;
    elements.nextPageBtn.disabled = !hasNext;

    updateProgressUI();
}

function renderCurrentPage(direction = 'none') {
    elements.readingContent.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = chapterPages[currentPageIndex] || '';
    elements.readingContent.appendChild(wrapper);

    clickedWordsOnPage = new Set();
    if (selectedWordEl) selectedWordEl = null;
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

let pageProgressSaveTimer = null;
function schedulePageProgressSave() {
    if (!currentBookId || !currentBook) return;
    if (!isPageFlipMode) return;

    if (pageProgressSaveTimer) {
        clearTimeout(pageProgressSaveTimer);
    }

    pageProgressSaveTimer = setTimeout(async () => {
        try {
            const chapterId = currentBook.chapters?.[currentChapterIndex]?.id || null;
            await updatePageProgress(currentBookId, { chapterId, pageNumber: currentPageIndex, scrollPosition: 0 });
        } catch (error) {
            console.warn('Failed to save page progress:', error);
        }
    }, 250);
}

function updateProgressUI() {
    if (!currentBook) return;

    const totalPages = Math.max(1, chapterPages.length || 1);
    const chapterPct = Math.min(1, Math.max(0, (currentPageIndex + 1) / totalPages));
    const bookPct = Math.min(1, Math.max(0, (currentChapterIndex + chapterPct) / Math.max(1, currentBook.chapters.length || 1)));

    if (elements.chapterProgressFill) {
        elements.chapterProgressFill.style.width = `${Math.round(chapterPct * 100)}%`;
    }

    const bookPercentText = `${Math.round(bookPct * 100)}%`;
    if (elements.bookProgressPercent) elements.bookProgressPercent.textContent = bookPercentText;
    if (elements.bookProgressText) elements.bookProgressText.textContent = bookPercentText;
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
        bookId: currentBookId,
        chapterId: currentBook?.chapters?.[currentChapterIndex]?.id || null,
        words: getCurrentPageWordMap(),
        clicked: new Set(clickedWordsOnPage)
    };
}

async function processPageTurn(snapshot) {
    if (!snapshot?.bookId) return;

    const updates = [];
    snapshot.words.forEach((displayWord, normalizedWord) => {
        const prevCount = encounterCountByWord.get(normalizedWord) || 0;
        const nextCount = prevCount + 1;
        encounterCountByWord.set(normalizedWord, nextCount);

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
            const existing = vocabularyByWord.get(normalizedWord) || {};
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
        const records = await upsertVocabularyItems(updates);
        records.forEach((record) => vocabularyByWord.set(record.word, record));
    } catch (error) {
        console.warn('Failed to persist page-turn word statuses:', error);
    }
}

function goToPreviousPage() {
    if (!isPageFlipMode) return;

    const snapshot = capturePageTurnSnapshot();
    void processPageTurn(snapshot);

    if (currentPageIndex > 0) {
        currentPageIndex -= 1;
        renderCurrentPage('prev');
        return;
    }

    if (currentBook && currentChapterIndex > 0) {
        loadChapter(currentChapterIndex - 1, { startPage: 'last' });
    }
}

function goToNextPage() {
    if (!isPageFlipMode) return;

    const snapshot = capturePageTurnSnapshot();
    void processPageTurn(snapshot);

    if (currentPageIndex < chapterPages.length - 1) {
        currentPageIndex += 1;
        renderCurrentPage('next');
        return;
    }

    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
        loadChapter(currentChapterIndex + 1, { startPage: 'first' });
    }
}

// ============================================
// View Switching
// ============================================
async function switchToReview(language = null) {
    if (currentView === 'reader' && currentBook && currentBookId) {
        saveCurrentProgress();
        stopBackgroundSync();
    }

    viewRouter.navigate('review');
    currentView = 'review';
    await reviewController.startReview(language);
}

function switchToBookshelf() {
    if (currentBook && currentBookId) {
        saveCurrentProgress();
    }

    stopBackgroundSync();

    viewRouter.navigate('bookshelf');
    currentView = 'bookshelf';
    elements.readerView.classList.remove('page-mode');

    void bookshelfController.refreshBookshelf();
}

// ============================================
// Vocabulary Library
// ============================================
async function switchToVocabLibrary() {
    if (currentView === 'reader' && currentBook && currentBookId) {
        saveCurrentProgress();
        stopBackgroundSync();
    }

    viewRouter.navigate('vocab-library');
    currentView = 'vocab-library';

    await vocabLibraryController.loadVocabLibrary();
}

async function switchToReader(bookId) {
    try {
        showLoading('加载书籍...');

        // Load book from database
        const book = await getBook(bookId);
        if (!book) {
            throw new Error('书籍未找到');
        }

        currentBook = book;
        currentBookId = bookId;
        currentChapterIndex = book.currentChapter || 0;
        encounterCountByWord = new Map();
        clickedWordsOnPage = new Set();

        const pageProgress = await getPageProgress(bookId);
        const progressChapterId = pageProgress?.chapterId || null;
        const progressPageNumber = typeof pageProgress?.pageNumber === 'number' ? pageProgress.pageNumber : 0;
        if (progressChapterId && Array.isArray(book.chapters)) {
            const idx = book.chapters.findIndex((ch) => ch.id === progressChapterId);
            if (idx >= 0) currentChapterIndex = idx;
        }

        // Update UI
        elements.bookTitle.textContent = book.title;
        renderChaptersList();

        // Switch view
        viewRouter.navigate('reader');
        currentView = 'reader';
        elements.readerView.classList.toggle('page-mode', isPageFlipMode);

        await refreshVocabularyCache();
        await refreshGlobalVocabCache();

        // Load saved chapter (after view is visible so pagination has correct dimensions)
        await loadChapter(currentChapterIndex, { startPage: progressPageNumber });

        startBackgroundSync(currentBookId);

        hideLoading();
    } catch (error) {
        hideLoading();
        showNotification('加载书籍失败: ' + error.message, 'error');
        console.error('Failed to load book:', error);
    }
}

// ============================================
// Chapters
// ============================================
function renderChaptersList() {
    if (!currentBook) return;

    elements.chapterSelectList.innerHTML = currentBook.chapters.map((chapter, index) => `
        <button class="chapter-item ${index === currentChapterIndex ? 'active' : ''}" data-index="${index}">
            ${escapeHtml(chapter.title)}
        </button>
    `).join('');

    elements.chapterSelectList.querySelectorAll('.chapter-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index, 10);
            closeChapterSelectModal();
            loadChapter(index, { startPage: 0 });
        });
    });
}

function openChapterSelectModal() {
    if (!currentBook) return;
    renderChaptersList();
    chapterSelectModalManager.open();
}

function closeChapterSelectModal() {
    chapterSelectModalManager.close();
}

async function loadChapter(index, options = {}) {
    if (!currentBook || index < 0 || index >= currentBook.chapters.length) {
        return;
    }

    // Save page progress before switching
    schedulePageProgressSave();

    currentChapterIndex = index;
    const chapter = currentBook.chapters[index];

    // Update UI
    elements.chapterInfo.textContent = chapter.title;
    if (isPageFlipMode) {
        const pageHeight = elements.readingContent.clientHeight || 520;
        const tokenized = buildTokenizedChapterWrapper(chapter.content);
        chapterPages = paginateTokenizedWrapper(tokenized, pageHeight);

        if (options?.startPage === 'last') {
            currentPageIndex = Math.max(0, chapterPages.length - 1);
        } else if (typeof options?.startPage === 'number') {
            currentPageIndex = Math.min(Math.max(0, options.startPage), Math.max(0, chapterPages.length - 1));
        } else {
            currentPageIndex = 0;
        }

        renderCurrentPage('none');
    } else {
        chapterPages = [];
        currentPageIndex = 0;
        renderTokenizedChapterContent(elements.readingContent, chapter.content);
        updatePageControls();
    }

    // Update chapter list active state
    elements.chapterSelectList.querySelectorAll('.chapter-item').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // Enable chapter analysis button
    elements.chapterAnalysisBtn.disabled = false;

    // Refresh word status + vocabulary panel
    await refreshVocabularyCache();
    applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();

    // Load and display chapter analysis for this chapter
    await loadChapterAnalysisContent();

    // Save reading position
    await updateReadingProgress(currentBookId, index);

    // Scroll to top (scroll-mode only)
    if (!isPageFlipMode) {
        elements.readingContent.scrollTop = 0;
    }
}

async function saveCurrentProgress() {
    if (!currentBookId) return;
    schedulePageProgressSave();
    await updateReadingProgress(currentBookId, currentChapterIndex);
}

// ============================================
// Chapter Analysis
// ============================================

/**
 * Load and display chapter analysis for the current chapter
 */
async function loadChapterAnalysisContent() {
    const container = elements.chapterAnalysisContent;

    if (!currentBook || !currentBookId) {
        container.innerHTML = '<p class="empty-state">点击 "Chapter Analysis" 获取章节概览</p>';
        return;
    }

    const chapterId = currentBook.chapters[currentChapterIndex].id;

    // Load saved analysis for this chapter
    const savedAnalysis = await getChapterAnalysis(currentBookId, chapterId);

    if (savedAnalysis && savedAnalysis.content) {
        container.innerHTML = formatMarkdown(savedAnalysis.content);
    } else {
        container.innerHTML = '<p class="empty-state">点击 "Chapter Analysis" 获取章节概览</p>';
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

    // Store data for Anki export
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

    // Add click handler for Anki button
    const ankiBtn = card.querySelector('.vocab-card-anki-btn');
    ankiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAddToAnki(card, ankiBtn);
    });

    return card;
}

// ============================================
// AI Analysis
// ============================================
async function handleChapterAnalysis() {
    if (!currentBook) return;

    const chapter = currentBook.chapters[currentChapterIndex];

    // Set loading state
    elements.chapterAnalysisContent.innerHTML = '<p class="loading">Analyzing chapter...</p>';

    // Switch to chapter analysis tab
    switchTab('chapter-analysis');

    // Import analyzeChapter
    const { analyzeChapter } = await import('./ai-service.js');

    try {
        const result = await analyzeChapter(chapter.content, chapter.title);
        renderChapterAnalysis(result);

        // Save the analysis to database
        if (currentBookId) {
            await saveChapterAnalysis(currentBookId, chapter.id, result);
        }
    } catch (error) {
        elements.chapterAnalysisContent.innerHTML = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
        showNotification(`分析失败: ${error.message}`, 'error');
    }
}

function switchTab(tabName) {
    // Update tab buttons
    [elements.tabVocabAnalysis, elements.tabChapterAnalysis].forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    elements.vocabAnalysisTab.classList.toggle('active', tabName === 'vocab-analysis');
    elements.chapterAnalysisTab.classList.toggle('active', tabName === 'chapter-analysis');
}

function renderChapterAnalysis(result) {
    elements.chapterAnalysisContent.innerHTML = formatMarkdown(result);
}

function formatMarkdown(content) {
    if (!content) return '<p class="empty-state">No content</p>';

    return content
        // Headers
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Horizontal rule
        .replace(/^---$/gm, '<hr>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Code
        .replace(/`(.+?)`/g, '<code>$1</code>')
        // Blockquote
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // Unordered list items
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        // Ordered list items (simple)
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        // Wrap consecutive li in ul
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Line breaks (double newline = paragraph break)
        .replace(/\n\n/g, '</p><p>')
        // Single line breaks
        .replace(/\n/g, '<br>')
        // Wrap in paragraphs
        .replace(/^(.+)$/s, '<p>$1</p>')
        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<h[1-4]>)/g, '$1')
        .replace(/(<\/h[1-4]>)<\/p>/g, '$1')
        .replace(/<p>(<ul>)/g, '$1')
        .replace(/(<\/ul>)<\/p>/g, '$1')
        .replace(/<p>(<blockquote>)/g, '$1')
        .replace(/(<\/blockquote>)<\/p>/g, '$1')
        .replace(/<p>(<hr>)<\/p>/g, '$1');
}

function toggleSidebar() {
    elements.vocabPanel.classList.toggle('collapsed');
    const isCollapsed = elements.vocabPanel.classList.contains('collapsed');
    elements.resizeHandle.style.display = isCollapsed ? 'none' : '';
}

// ============================================
// Resize Handle
// ============================================
function setupResizeHandle() {
    let startX, startPanelWidth;

    elements.resizeHandle.addEventListener('mousedown', (e) => {
        if (elements.vocabPanel.classList.contains('collapsed')) return;
        isResizing = true;
        startX = e.clientX;
        const mainRect = elements.mainContent.getBoundingClientRect();
        startPanelWidth = elements.vocabPanel.getBoundingClientRect().width;

        elements.resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const mainRect = elements.mainContent.getBoundingClientRect();
        const deltaX = startX - e.clientX; // Dragging left increases width

        let newPanelWidth = startPanelWidth + deltaX;
        let newPanelPercent = (newPanelWidth / mainRect.width) * 100;

        // Constraints (20% to 50%)
        newPanelPercent = Math.max(20, Math.min(50, newPanelPercent));

        elements.vocabPanel.style.width = `${newPanelPercent}%`;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;

        isResizing = false;
        elements.resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Save layout
        const mainRect = elements.mainContent.getBoundingClientRect();
        const layout = {
            panelWidth: (elements.vocabPanel.getBoundingClientRect().width / mainRect.width) * 100
        };
        saveLayout(layout);
    });
}

function applyLayout(layout) {
    if (layout && layout.panelWidth) {
        elements.vocabPanel.style.width = `${layout.panelWidth}%`;
    }
}

/**
 * Handle adding a vocab card to Anki
 */
async function handleAddToAnki(card, button) {
    // Check if already added
    if (button.classList.contains('added')) {
        return;
    }

    const ankiSettings = getAnkiSettings();

    // Validate settings
    if (!ankiSettings.deckName || !ankiSettings.modelName) {
        showNotification('请先在设置中配置 Anki 牌组和笔记类型', 'error');
        return;
    }

    // Get card data
    const word = card.dataset.word || '';
    const context = card.dataset.context || '';
    const meaning = card.dataset.meaning || '';
    const usage = card.dataset.usage || '';
    const contextualMeaning = card.dataset.contextualMeaning || '';

    // Build fields object based on mapping
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

    // Check if any fields are mapped
    if (Object.keys(fields).length === 0) {
        showNotification('请先在设置中配置字段映射', 'error');
        return;
    }

    // Show loading state
    button.classList.add('loading');
    button.textContent = '';

    try {
        await addNote(ankiSettings.deckName, ankiSettings.modelName, fields);

        // Show success state
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

// ============================================
// Start Application
// ============================================
document.addEventListener('DOMContentLoaded', init);
