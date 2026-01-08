/**
 * Language Reader - Main Application
 * Coordinates all modules and handles UI interactions
 */

import { parseEpub } from './epub-parser.js';
import { normalizeWord, statusToClass, WORD_STATUSES } from './word-status.js';
import { getSyncStatus, setSyncStatusListener, startBackgroundSync, stopBackgroundSync, syncNow } from './sync-service.js';
import {
    fetchModels,
    runConcurrentAnalysis
} from './ai-service.js';
import {
    ensureGlobalLearningCard,
    getDueCards,
    getReviewStats,
    previewNextIntervals,
    removeBookFromGlobalLearningCard,
    reviewCard,
    upsertGlobalAnalysis
} from './srs-service.js';
import {
    getSettings,
    saveSettings,
    getTheme,
    saveTheme,
    getLayout,
    saveLayout,
    getAnkiSettings,
    saveAnkiSettings
} from './storage.js';
import {
    getDeckNames,
    getModelNames,
    getModelFieldNames,
    addNote
} from './anki-service.js';
import {
    initDB,
    saveBook,
    getAllBooks,
    getBook,
    deleteBook as deleteBookFromDB,
    renameBook as renameBookInDB,
    updateReadingProgress,
    getReadingProgress as getPageProgress,
    updatePageProgress,
    saveChapterAnalysis,
    getChapterAnalysis,
    listVocabulary,
    upsertVocabularyItem,
    upsertVocabularyItems,
    deleteVocabularyItem,
    listGlobalVocab,
    generateBookHash
} from './db.js';

// ============================================
// State
// ============================================
let currentView = 'bookshelf'; // 'bookshelf' | 'reader' | 'review'
let viewMode = 'grid';         // 'grid' | 'list'
let booksLibrary = [];         // Books metadata list
let currentBook = null;
let currentBookId = null;
let currentChapterIndex = 0;
let isAnalysisMode = false;
let isResizing = false;
let contextMenuBookId = null;
let isAutoStudyEnabled = false;
let selectedWordEl = null;
let isPageFlipMode = true;
let chapterPages = [];
let currentPageIndex = 0;
let vocabularyByWord = new Map(); // normalizedWord -> vocab entry
let globalVocabByWord = new Map(); // normalizedWord -> global vocab entry (learning cards)
let vocabFilter = WORD_STATUSES.LEARNING; // 'seen' | 'learning' | 'known' | 'all'
let selectedWord = null; // normalized
let selectedWordDisplay = null; // original casing
let selectedWordContext = null;
let selectedWordAnalysis = null;
let clickedWordsOnPage = new Set();
let encounterCountByWord = new Map(); // normalizedWord -> number (per session)

// Review session state
let reviewQueue = [];
let reviewIndex = 0;
let currentReviewItem = null;

// ============================================
// DOM Elements
// ============================================
const elements = {
    // Views
    bookshelfView: document.getElementById('bookshelfView'),
    readerView: document.getElementById('readerView'),
    reviewView: document.getElementById('reviewView'),

    // Bookshelf
    booksContainer: document.getElementById('booksContainer'),
    emptyBookshelf: document.getElementById('emptyBookshelf'),
    importBookBtn: document.getElementById('importBookBtn'),
    importBtnEmpty: document.getElementById('importBtnEmpty'),
    gridViewBtn: document.getElementById('gridViewBtn'),
    listViewBtn: document.getElementById('listViewBtn'),
    reviewBtn: document.getElementById('reviewBtn'),
    themeToggleBtnShelf: document.getElementById('themeToggleBtnShelf'),
    themeIconShelf: document.getElementById('themeIconShelf'),

    // Context Menu
    bookContextMenu: document.getElementById('bookContextMenu'),
    renameBookBtn: document.getElementById('renameBookBtn'),
    deleteBookBtn: document.getElementById('deleteBookBtn'),

    // Rename Modal
    renameModal: document.getElementById('renameModal'),
    newBookTitle: document.getElementById('newBookTitle'),
    closeRenameBtn: document.getElementById('closeRenameBtn'),
    cancelRenameBtn: document.getElementById('cancelRenameBtn'),
    confirmRenameBtn: document.getElementById('confirmRenameBtn'),

    // Delete Modal
    deleteModal: document.getElementById('deleteModal'),
    deleteConfirmText: document.getElementById('deleteConfirmText'),
    closeDeleteBtn: document.getElementById('closeDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

    // File input
    fileInput: document.getElementById('fileInput'),

    // Reader Header
    backToShelfBtn: document.getElementById('backToShelfBtn'),
    bookTitle: document.getElementById('bookTitle'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIcon: document.getElementById('themeIcon'),
    syncIndicator: document.getElementById('syncIndicator'),

    // Main content
    mainContent: document.querySelector('.main-content'),
    readingPanel: document.querySelector('.reading-panel'),

    // Chapters / Progress
    chapterSelectBtn: document.getElementById('chapterSelectBtn'),
    chapterInfo: document.getElementById('chapterInfo'),
    chapterProgressFill: document.getElementById('chapterProgressFill'),
    bookProgressPercent: document.getElementById('bookProgressPercent'),
    bookProgressText: document.getElementById('bookProgressText'),

    // Chapter Select Modal
    chapterSelectModal: document.getElementById('chapterSelectModal'),
    closeChapterSelectBtn: document.getElementById('closeChapterSelectBtn'),
    chapterSelectList: document.getElementById('chapterSelectList'),

    // Reading
    readingContent: document.getElementById('readingContent'),
    chapterAnalysisBtn: document.getElementById('chapterAnalysisBtn'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageIndicator: document.getElementById('pageIndicator'),

    // Vocabulary Panel
    vocabPanel: document.getElementById('vocabPanel'),
    resizeHandle: document.getElementById('resizeHandle'),

    // Tabs
    tabVocabAnalysis: document.getElementById('tabVocabAnalysis'),
    tabChapterAnalysis: document.getElementById('tabChapterAnalysis'),
    vocabAnalysisTab: document.getElementById('vocabAnalysisTab'),
    chapterAnalysisTab: document.getElementById('chapterAnalysisTab'),

    // Analysis Content
    vocabAnalysisContent: document.getElementById('vocabAnalysisContent'),
    chapterAnalysisContent: document.getElementById('chapterAnalysisContent'),

    // Settings Modal
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    // Settings Form
    apiUrl: document.getElementById('apiUrl'),
    apiKey: document.getElementById('apiKey'),
    toggleKeyBtn: document.getElementById('toggleKeyBtn'),
    modelSelect: document.getElementById('modelSelect'),
    fetchModelsBtn: document.getElementById('fetchModelsBtn'),
    languageSelect: document.getElementById('languageSelect'),
    readingLevelSelect: document.getElementById('readingLevelSelect'),
    backendUrl: document.getElementById('backendUrl'),
    syncEnabledToggle: document.getElementById('syncEnabledToggle'),
    syncNowBtn: document.getElementById('syncNowBtn'),
    syncStatusText: document.getElementById('syncStatusText'),

    // Settings Tabs
    settingsTabAI: document.getElementById('settingsTabAI'),
    settingsTabAnki: document.getElementById('settingsTabAnki'),
    settingsTabSync: document.getElementById('settingsTabSync'),
    aiSettingsContent: document.getElementById('aiSettingsContent'),
    ankiSettingsContent: document.getElementById('ankiSettingsContent'),
    syncSettingsContent: document.getElementById('syncSettingsContent'),

    // Anki Settings Form
    ankiDeckSelect: document.getElementById('ankiDeckSelect'),
    ankiModelSelect: document.getElementById('ankiModelSelect'),
    refreshAnkiBtn: document.getElementById('refreshAnkiBtn'),
    fieldWord: document.getElementById('fieldWord'),
    fieldContext: document.getElementById('fieldContext'),
    fieldMeaning: document.getElementById('fieldMeaning'),
    fieldUsage: document.getElementById('fieldUsage'),
    fieldContextualMeaning: document.getElementById('fieldContextualMeaning'),

    // Auto Anki Toggle
    autoAnkiToggle: document.getElementById('autoAnkiToggle'),

    // Review
    backFromReviewBtn: document.getElementById('backFromReviewBtn'),
    reviewStats: document.getElementById('reviewStats'),
    reviewEmpty: document.getElementById('reviewEmpty'),
    reviewFinishBtn: document.getElementById('reviewFinishBtn'),
    reviewSession: document.getElementById('reviewSession'),
    reviewWord: document.getElementById('reviewWord'),
    reviewMeaning: document.getElementById('reviewMeaning'),
    reviewUsage: document.getElementById('reviewUsage'),
    reviewContext: document.getElementById('reviewContext'),
    reviewContextualMeaning: document.getElementById('reviewContextualMeaning'),
    reviewAgainBtn: document.getElementById('reviewAgainBtn'),
    reviewHardBtn: document.getElementById('reviewHardBtn'),
    reviewGoodBtn: document.getElementById('reviewGoodBtn'),
    reviewEasyBtn: document.getElementById('reviewEasyBtn'),
    reviewAgainInterval: document.getElementById('reviewAgainInterval'),
    reviewHardInterval: document.getElementById('reviewHardInterval'),
    reviewGoodInterval: document.getElementById('reviewGoodInterval'),
    reviewEasyInterval: document.getElementById('reviewEasyInterval')
};

// ============================================
// Initialization
// ============================================
async function init() {
    try {
        // Initialize IndexedDB
        await initDB();
        console.log('📚 Database initialized');

        await refreshGlobalVocabCache();

        // Load theme
        initTheme();

        // Load layout
        applyLayout(getLayout());

        // Load settings
        loadSettingsToForm();

        // Load books from database
        booksLibrary = await getAllBooks();

        // Render bookshelf
        renderBookshelf();

        // Event listeners
        setupEventListeners();

        // Sync indicator
        setSyncStatusListener(updateSyncUI);
        updateSyncUI(getSyncStatus());

        console.log('📚 Language Reader initialized');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showNotification('初始化失败: ' + error.message, 'error');
    }
}

function setupEventListeners() {
    // Bookshelf: Import buttons
    elements.importBookBtn.addEventListener('click', () => elements.fileInput.click());
    elements.importBtnEmpty.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileImport);

    // Bookshelf: View toggle
    elements.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    elements.listViewBtn.addEventListener('click', () => setViewMode('list'));

    // Bookshelf: Theme toggle
    elements.themeToggleBtnShelf.addEventListener('click', toggleTheme);

    // Bookshelf: Review
    elements.reviewBtn?.addEventListener('click', () => switchToReview());

    // Context menu
    elements.renameBookBtn.addEventListener('click', openRenameModal);
    elements.deleteBookBtn.addEventListener('click', openDeleteModal);
    document.addEventListener('click', hideContextMenu);

    // Rename modal
    elements.closeRenameBtn.addEventListener('click', closeRenameModal);
    elements.cancelRenameBtn.addEventListener('click', closeRenameModal);
    elements.confirmRenameBtn.addEventListener('click', handleRenameBook);
    elements.renameModal.addEventListener('click', (e) => {
        if (e.target === elements.renameModal) closeRenameModal();
    });

    // Delete modal
    elements.closeDeleteBtn.addEventListener('click', closeDeleteModal);
    elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    elements.confirmDeleteBtn.addEventListener('click', handleDeleteBook);
    elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) closeDeleteModal();
    });

    // Reader: Back to shelf
    elements.backToShelfBtn.addEventListener('click', switchToBookshelf);

    // Reader: Clickable words (event delegation)
    elements.readingContent.addEventListener('click', handleReadingWordClick);

    // Chapter select
    elements.chapterSelectBtn?.addEventListener('click', openChapterSelectModal);
    elements.closeChapterSelectBtn?.addEventListener('click', closeChapterSelectModal);
    elements.chapterSelectModal?.addEventListener('click', (e) => {
        if (e.target === elements.chapterSelectModal) closeChapterSelectModal();
    });

    // Reader: Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Sidebar toggle
    if (elements.toggleSidebarBtn) {
        elements.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }

    // Tab switching
    elements.tabVocabAnalysis.addEventListener('click', () => switchTab('vocab-analysis'));
    elements.tabChapterAnalysis.addEventListener('click', () => switchTab('chapter-analysis'));

    // Vocabulary panel actions (delegation)
    elements.vocabAnalysisContent.addEventListener('click', handleVocabPanelClick);

    // Chapter Analysis
    elements.chapterAnalysisBtn.addEventListener('click', handleChapterAnalysis);

    // Page navigation
    elements.prevPageBtn?.addEventListener('click', () => goToPreviousPage());
    elements.nextPageBtn?.addEventListener('click', () => goToNextPage());

    // Review
    elements.backFromReviewBtn?.addEventListener('click', switchToBookshelf);
    elements.reviewFinishBtn?.addEventListener('click', switchToBookshelf);
    [elements.reviewAgainBtn, elements.reviewHardBtn, elements.reviewGoodBtn, elements.reviewEasyBtn]
        .filter(Boolean)
        .forEach((btn) => {
            btn.addEventListener('click', () => submitRating(btn.dataset.rating));
        });

    // Resize handle
    setupResizeHandle();

    // Settings modal
    elements.settingsBtn.addEventListener('click', openSettingsModal);
    elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    elements.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);

    // Toggle API key visibility
    elements.toggleKeyBtn.addEventListener('click', () => {
        const type = elements.apiKey.type === 'password' ? 'text' : 'password';
        elements.apiKey.type = type;
        elements.toggleKeyBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });

    // Fetch models
    elements.fetchModelsBtn.addEventListener('click', handleFetchModels);

    // Close modal on overlay click
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeSettingsModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Avoid hijacking arrows while typing in inputs
        const tag = e.target?.tagName?.toLowerCase?.() || '';
        const isTypingContext = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

        if (e.key === 'Escape') {
            closeSettingsModal();
            closeRenameModal();
            closeDeleteModal();
            closeChapterSelectModal();
            hideContextMenu();
            if (currentView === 'review') {
                switchToBookshelf();
            }
            if (isAnalysisMode) {
                exitAnalysisMode();
            }
            return;
        }

        if (!isTypingContext && currentView === 'review') {
            if (e.key === '1') return void submitRating('again');
            if (e.key === '2') return void submitRating('hard');
            if (e.key === '3') return void submitRating('good');
            if (e.key === '4') return void submitRating('easy');
        }

        if (!isTypingContext && currentView === 'reader' && isPageFlipMode) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToPreviousPage();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToNextPage();
            }
        }
    });

    // Settings tabs switching
    elements.settingsTabAI.addEventListener('click', () => switchSettingsTab('ai'));
    elements.settingsTabAnki.addEventListener('click', () => switchSettingsTab('anki'));
    elements.settingsTabSync.addEventListener('click', () => switchSettingsTab('sync'));

    // Anki settings
    elements.refreshAnkiBtn.addEventListener('click', refreshAnkiOptions);
    elements.ankiModelSelect.addEventListener('change', handleAnkiModelChange);

    // Sync settings
    elements.syncNowBtn.addEventListener('click', () => syncNow(currentBookId));

    // Auto Anki toggle
    elements.autoAnkiToggle.addEventListener('change', handleAutoAnkiToggle);

    // Load Auto Study state from storage
    const ankiSettings = getAnkiSettings();
    isAutoStudyEnabled = ankiSettings.autoAddToStudy ?? ankiSettings.autoAddToAnki ?? false;
    elements.autoAnkiToggle.checked = isAutoStudyEnabled;
}

// ============================================
// Word Tokenization & Rendering
// ============================================
let WORD_REGEX = null;
function getWordRegex() {
    if (WORD_REGEX) return WORD_REGEX;
    try {
        WORD_REGEX = new RegExp("[\\p{L}\\p{N}]+(?:[’'\\-][\\p{L}\\p{N}]+)*", "gu");
    } catch {
        WORD_REGEX = /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]+(?:[’'\-][A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]+)*/g;
    }
    return WORD_REGEX;
}

function buildTokenizedChapterWrapper(text) {
    const wrapper = document.createElement('div');
    const paragraphs = (text || '').split(/\n\n+/).filter(p => p.trim());

    paragraphs.forEach((paragraphText) => {
        const p = document.createElement('p');
        tokenizeParagraphInto(p, paragraphText);
        wrapper.appendChild(p);
    });

    if (paragraphs.length === 0) {
        wrapper.innerHTML = `
            <div class="welcome-state">
              <div class="welcome-icon">📖</div>
              <h2>No content</h2>
              <p>该章节内容为空</p>
            </div>
        `;
    }

    return wrapper;
}

function renderTokenizedChapterContent(container, text) {
    container.innerHTML = '';
    container.appendChild(buildTokenizedChapterWrapper(text));
}

function tokenizeParagraphInto(paragraphEl, paragraphText) {
    const regex = getWordRegex();
    regex.lastIndex = 0;

    let lastIndex = 0;
    let match;
    while ((match = regex.exec(paragraphText)) !== null) {
        const wordStart = match.index;
        const wordText = match[0];
        const normalized = normalizeWord(wordText);

        if (wordStart > lastIndex) {
            paragraphEl.appendChild(document.createTextNode(paragraphText.slice(lastIndex, wordStart)));
        }

        if (normalized) {
            const span = document.createElement('span');
            span.className = 'word';
            span.dataset.word = normalized;
            span.textContent = wordText;
            paragraphEl.appendChild(span);
        } else {
            paragraphEl.appendChild(document.createTextNode(wordText));
        }

        lastIndex = wordStart + wordText.length;
    }

    if (lastIndex < paragraphText.length) {
        paragraphEl.appendChild(document.createTextNode(paragraphText.slice(lastIndex)));
    }
}

async function handleReadingWordClick(event) {
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
    selectedWordAnalysis = existing?.analysis || null;

    switchTab('vocab-analysis');

    // Auto-study behavior:
    // - Auto ON: clicking a new word marks it as learning
    // - Auto OFF: clicking a seen word still marks it as learning
    const effectiveStatus = selectedWord ? getEffectiveWordStatus(selectedWord) : WORD_STATUSES.NEW;
    const shouldAutoStudy = selectedWord && (effectiveStatus === WORD_STATUSES.SEEN || (effectiveStatus === WORD_STATUSES.NEW && isAutoStudyEnabled));
    if (shouldAutoStudy) {
        await setSelectedWordStatus(WORD_STATUSES.LEARNING, { trigger: 'click' });
    }

    // Auto-analyze when AI is configured (especially useful when a word enters learning).
    if (selectedWord && !selectedWordAnalysis && (shouldAutoStudy || effectiveStatus === WORD_STATUSES.NEW)) {
        const settings = getSettings();
        if (settings.apiUrl && settings.apiKey && settings.model) {
            await analyzeSelectedWord();
        }
    }

    renderVocabularyPanel();
}

function getWordStatus(normalizedWord) {
    return vocabularyByWord.get(normalizedWord)?.status || WORD_STATUSES.NEW;
}

function getEffectiveWordStatus(normalizedWord) {
    const local = vocabularyByWord.get(normalizedWord)?.status || null;
    if (local) return local;
    const global = globalVocabByWord.get(normalizedWord) || null;
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
    const paragraphText = wordEl.closest('p')?.textContent?.trim() || '';
    return {
        previousSentence: '',
        currentSentence: paragraphText,
        nextSentence: '',
        fullContext: paragraphText
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

async function refreshGlobalVocabCache() {
    try {
        const items = await listGlobalVocab();
        globalVocabByWord = new Map(items.map((item) => [item.normalizedWord || item.id, item]));
    } catch (error) {
        console.warn('Failed to refresh global vocabulary cache:', error);
        globalVocabByWord = new Map();
    }
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
                ${!selectedWordAnalysis ? `<button class="btn btn-secondary btn-small" data-action="analyze">分析</button>` : ''}
              </div>
            </div>
            <div class="vocab-selected-body" id="selectedWordAnalysisSlot">
              ${!selectedWordAnalysis ? `<p class="empty-state">点击“分析”获取解释</p>` : ''}
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

    if (selectedWord && selectedWordAnalysis) {
        const slot = container.querySelector('#selectedWordAnalysisSlot');
        if (slot) {
            slot.innerHTML = '';
            const card = createWordAnalysisCard(selectedWordDisplay || selectedWord, selectedWordAnalysis, false, selectedEntry?.context || selectedWordContext);
            slot.appendChild(card);
        }
    }
}

async function analyzeSelectedWord() {
    if (!selectedWord || !selectedWordDisplay) return;

    try {
        const { analyzeWordInstant } = await import('./ai-service.js');
        const result = await analyzeWordInstant(selectedWordDisplay, selectedWordContext || { fullContext: '' });
        selectedWordAnalysis = result;

        // Persist analysis for saved words; keep it in-memory for new words until user saves.
        const existing = vocabularyByWord.get(selectedWord);
        if (existing) {
            const updated = await upsertVocabularyItem({
                ...existing,
                bookId: currentBookId,
                word: selectedWord,
                displayWord: existing.displayWord || selectedWordDisplay,
                analysis: result,
                context: existing.context || selectedWordContext,
                sourceChapterId: existing.sourceChapterId || currentBook?.chapters?.[currentChapterIndex]?.id || null
            });
            vocabularyByWord.set(updated.word, updated);
        }

        if (getEffectiveWordStatus(selectedWord) === WORD_STATUSES.LEARNING) {
            const updatedGlobal = await upsertGlobalAnalysis(
                selectedWord,
                result,
                selectedWordContext?.currentSentence || null,
                selectedWordDisplay
            );
            if (updatedGlobal) {
                globalVocabByWord.set(updatedGlobal.normalizedWord || updatedGlobal.id, updatedGlobal);
            }
        }
    } catch (error) {
        console.error('Instant analysis error:', error);
        showNotification('分析失败: ' + error.message, 'error');
    } finally {
        renderVocabularyPanel();
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
            await removeBookFromGlobalLearningCard(selectedWord, currentBookId);
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
            normalizedWord: updated.word,
            displayWord: updated.displayWord || selectedWordDisplay || updated.word,
            bookId: currentBookId,
            analysis: updated.analysis || selectedWordAnalysis || null,
            contextSentence: updated?.context?.currentSentence || selectedWordContext?.currentSentence || null
        });
        globalVocabByWord.set(global.normalizedWord || global.id, global);
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, currentBookId);
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

    const updated = await upsertVocabularyItem({ ...entry, bookId: currentBookId, word: normalizedWord, status: nextStatus });
    if (nextStatus === WORD_STATUSES.LEARNING) {
        const global = await ensureGlobalLearningCard({
            normalizedWord: updated.word,
            displayWord: updated.displayWord || updated.word,
            bookId: currentBookId,
            analysis: updated.analysis || null,
            contextSentence: updated?.context?.currentSentence || null
        });
        globalVocabByWord.set(global.normalizedWord || global.id, global);
    } else if (prevStatus === WORD_STATUSES.LEARNING) {
        await removeBookFromGlobalLearningCard(updated.word, currentBookId);
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

    if (action === 'analyze') {
        await analyzeSelectedWord();
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
async function switchToReview() {
    // Save current reading progress if coming from reader
    if (currentView === 'reader' && currentBook && currentBookId) {
        saveCurrentProgress();
        stopBackgroundSync();
    }

    currentView = 'review';
    elements.bookshelfView.style.display = 'none';
    elements.readerView.style.display = 'none';
    elements.reviewView.style.display = '';

    await refreshGlobalVocabCache();
    await loadReviewSession();
}

function setReviewVisibility(mode) {
    if (!elements.reviewEmpty || !elements.reviewSession) return;
    elements.reviewEmpty.style.display = mode === 'empty' ? '' : 'none';
    elements.reviewSession.style.display = mode === 'session' ? '' : 'none';
}

function renderReviewStats(stats) {
    if (!elements.reviewStats) return;
    elements.reviewStats.textContent = `Due: ${stats.due} | New: ${stats.new} | Total: ${stats.total}`;
}

async function loadReviewSession() {
    const stats = await getReviewStats(new Date());
    renderReviewStats(stats);

    reviewQueue = await getDueCards(new Date());
    // Shuffle to avoid always drilling the same ordering
    reviewQueue = reviewQueue.sort(() => Math.random() - 0.5);
    reviewIndex = 0;
    currentReviewItem = null;

    if (reviewQueue.length === 0) {
        setReviewVisibility('empty');
        return;
    }

    setReviewVisibility('session');
    await showNextCard();
}

function setReviewText(el, value, fallback = '—') {
    if (!el) return;
    const text = (value ?? '').toString().trim();
    el.textContent = text ? text : fallback;
}

async function showNextCard() {
    if (reviewIndex >= reviewQueue.length) {
        await loadReviewSession();
        return;
    }

    currentReviewItem = reviewQueue[reviewIndex];
    const display = currentReviewItem?.displayWord || currentReviewItem?.normalizedWord || currentReviewItem?.id || '—';

    setReviewText(elements.reviewWord, display);
    setReviewText(elements.reviewMeaning, currentReviewItem?.meaning);
    setReviewText(elements.reviewUsage, currentReviewItem?.usage);
    setReviewText(elements.reviewContext, currentReviewItem?.contextSentence);
    setReviewText(elements.reviewContextualMeaning, currentReviewItem?.contextualMeaning);

    const intervals = await previewNextIntervals(currentReviewItem, new Date());
    setReviewText(elements.reviewAgainInterval, intervals.again, '');
    setReviewText(elements.reviewHardInterval, intervals.hard, '');
    setReviewText(elements.reviewGoodInterval, intervals.good, '');
    setReviewText(elements.reviewEasyInterval, intervals.easy, '');
}

async function submitRating(rating) {
    if (currentView !== 'review') return;
    if (!currentReviewItem) return;

    try {
        const updated = await reviewCard(currentReviewItem, rating, new Date());
        reviewQueue[reviewIndex] = updated;
        globalVocabByWord.set(updated.normalizedWord || updated.id, updated);
        currentReviewItem = null;
        reviewIndex += 1;

        renderReviewStats(await getReviewStats(new Date()));
        await showNextCard();
    } catch (error) {
        console.error('Failed to review card:', error);
        showNotification('复习失败: ' + error.message, 'error');
    }
}

function switchToBookshelf() {
    // Save current reading progress
    if (currentBook && currentBookId) {
        saveCurrentProgress();
    }

    stopBackgroundSync();

    currentView = 'bookshelf';
    elements.bookshelfView.style.display = '';
    elements.readerView.style.display = 'none';
    elements.reviewView.style.display = 'none';
    elements.readerView.classList.remove('page-mode');

    // Refresh bookshelf
    refreshBookshelf();
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
        currentView = 'reader';
        elements.bookshelfView.style.display = 'none';
        elements.readerView.style.display = '';
        elements.reviewView.style.display = 'none';
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
// Bookshelf
// ============================================
async function refreshBookshelf() {
    booksLibrary = await getAllBooks();
    renderBookshelf();
}

function renderBookshelf() {
    if (booksLibrary.length === 0) {
        elements.emptyBookshelf.style.display = '';
        return;
    }

    elements.emptyBookshelf.style.display = 'none';

    if (viewMode === 'grid') {
        renderBooksGrid();
    } else {
        renderBooksList();
    }
}

function renderBooksGrid() {
    const container = elements.booksContainer;
    container.innerHTML = `
        <div class="books-grid">
            ${booksLibrary.map((book, index) => `
                <div class="book-card" data-book-id="${book.id}" style="animation-delay: ${index * 0.05}s">
                    <div class="book-cover">
                        ${book.cover
            ? `<img src="${book.cover}" alt="${escapeHtml(book.title)}">`
            : `<div class="book-cover-placeholder">${getInitials(book.title)}</div>`
        }
                        <button class="book-menu-btn" data-book-id="${book.id}">⋮</button>
                    </div>
                    <div class="book-card-info">
                        <div class="book-card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
                        <div class="book-card-meta">${book.chapterCount} 章</div>
                        <div class="book-progress-bar">
                            <div class="book-progress-fill" style="width: ${getProgressPercent(book)}%"></div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners
    container.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('book-menu-btn')) {
                const bookId = card.dataset.bookId;
                switchToReader(bookId);
            }
        });
    });

    container.querySelectorAll('.book-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, btn.dataset.bookId);
        });
    });
}

function renderBooksList() {
    const container = elements.booksContainer;
    container.innerHTML = `
        <div class="books-list">
            ${booksLibrary.map((book, index) => `
                <div class="book-list-item" data-book-id="${book.id}" style="animation-delay: ${index * 0.03}s">
                    <div class="book-list-cover">
                        ${book.cover
            ? `<img src="${book.cover}" alt="${escapeHtml(book.title)}">`
            : `<div class="book-list-cover-placeholder">${getInitials(book.title)}</div>`
        }
                    </div>
                    <div class="book-list-info">
                        <div class="book-list-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
                        <div class="book-list-meta">
                            <span>${book.chapterCount} 章</span>
                            <span>•</span>
                            <span>阅读进度: ${Math.round(getProgressPercent(book))}%</span>
                            <div class="book-list-progress">
                                <div class="book-list-progress-fill" style="width: ${getProgressPercent(book)}%"></div>
                            </div>
                        </div>
                    </div>
                    <button class="book-list-menu-btn" data-book-id="${book.id}">⋮</button>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners
    container.querySelectorAll('.book-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('book-list-menu-btn')) {
                const bookId = item.dataset.bookId;
                switchToReader(bookId);
            }
        });
    });

    container.querySelectorAll('.book-list-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, btn.dataset.bookId);
        });
    });
}

function setViewMode(mode) {
    viewMode = mode;
    elements.gridViewBtn.classList.toggle('active', mode === 'grid');
    elements.listViewBtn.classList.toggle('active', mode === 'list');
    renderBookshelf();
}

function getInitials(title) {
    return title.charAt(0).toUpperCase();
}

function getProgressPercent(book) {
    if (!book.chapterCount || book.chapterCount === 0) return 0;
    return ((book.currentChapter || 0) / book.chapterCount) * 100;
}

// ============================================
// Context Menu
// ============================================
function showContextMenu(event, bookId) {
    contextMenuBookId = bookId;
    const menu = elements.bookContextMenu;

    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.classList.add('visible');

    // Ensure menu stays in viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
}

function hideContextMenu() {
    elements.bookContextMenu.classList.remove('visible');
}

// ============================================
// Rename Modal
// ============================================
function openRenameModal() {
    hideContextMenu();
    const book = booksLibrary.find(b => b.id === contextMenuBookId);
    if (book) {
        elements.newBookTitle.value = book.title;
        elements.renameModal.classList.add('open');
        elements.newBookTitle.focus();
        elements.newBookTitle.select();
    }
}

function closeRenameModal() {
    elements.renameModal.classList.remove('open');
    contextMenuBookId = null;
}

async function handleRenameBook() {
    const newTitle = elements.newBookTitle.value.trim();
    if (!newTitle) {
        showNotification('请输入书名', 'error');
        return;
    }

    try {
        await renameBookInDB(contextMenuBookId, newTitle);
        showNotification('重命名成功', 'success');
        closeRenameModal();
        await refreshBookshelf();
    } catch (error) {
        showNotification('重命名失败: ' + error.message, 'error');
    }
}

// ============================================
// Delete Modal
// ============================================
function openDeleteModal() {
    hideContextMenu();
    const book = booksLibrary.find(b => b.id === contextMenuBookId);
    if (book) {
        elements.deleteConfirmText.textContent = `确定要删除《${book.title}》吗？此操作无法撤销。`;
        elements.deleteModal.classList.add('open');
    }
}

function closeDeleteModal() {
    elements.deleteModal.classList.remove('open');
    contextMenuBookId = null;
}

async function handleDeleteBook() {
    try {
        await deleteBookFromDB(contextMenuBookId);
        showNotification('删除成功', 'success');
        closeDeleteModal();
        await refreshBookshelf();
    } catch (error) {
        showNotification('删除失败: ' + error.message, 'error');
    }
}

// ============================================
// File Import
// ============================================
async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        showLoading('正在解析 EPUB...');

        const parsedBook = await parseEpub(file);
        const bookId = generateBookHash(parsedBook.title + parsedBook.chapters[0]?.content.substring(0, 100));

        // Check if book already exists
        const existingBook = await getBook(bookId);
        if (existingBook) {
            hideLoading();
            showNotification('这本书已经在书架中了', 'info');
            // Still navigate to it
            switchToReader(bookId);
            elements.fileInput.value = '';
            return;
        }

        // Save to database
        await saveBook({
            id: bookId,
            title: parsedBook.title,
            cover: parsedBook.cover,
            chapters: parsedBook.chapters,
            currentChapter: 0,
            marks: {}
        });

        hideLoading();
        showNotification(`成功导入: ${parsedBook.title}`, 'success');

        // Switch to reader
        switchToReader(bookId);

    } catch (error) {
        hideLoading();
        showNotification(`解析失败: ${error.message}`, 'error');
        console.error('EPUB parse error:', error);
    }

    // Reset file input
    elements.fileInput.value = '';
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
    elements.chapterSelectModal.classList.add('open');
}

function closeChapterSelectModal() {
    elements.chapterSelectModal?.classList.remove('open');
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
            ${analysis.meaning ? `
                <div class="vocab-card-row">
                    <div class="vocab-card-label">含义</div>
                    <div class="vocab-card-value">${escapeHtml(analysis.meaning)}</div>
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

// ============================================
// Theme
// ============================================
function initTheme() {
    const theme = getTheme();
    applyTheme(theme);
}

function toggleTheme() {
    const currentTheme = getTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    saveTheme(newTheme);
    applyTheme(newTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = theme === 'dark' ? '🌙' : '☀️';
    elements.themeIcon.textContent = icon;
    elements.themeIconShelf.textContent = icon;
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

// ============================================
// Settings
// ============================================
function loadSettingsToForm() {
    const settings = getSettings();
    elements.apiUrl.value = settings.apiUrl || '';
    elements.apiKey.value = settings.apiKey || '';
    elements.languageSelect.value = settings.language || '中文';
    elements.readingLevelSelect.value = settings.readingLevel || 'intermediate';
    elements.backendUrl.value = settings.backendUrl || '';
    elements.syncEnabledToggle.checked = !!settings.syncEnabled;

    // If model is saved, add it as an option
    if (settings.model) {
        const option = document.createElement('option');
        option.value = settings.model;
        option.textContent = settings.model;
        option.selected = true;
        elements.modelSelect.appendChild(option);
    }

    updateSyncUI(getSyncStatus());
}

function openSettingsModal() {
    loadSettingsToForm();
    elements.settingsModal.classList.add('open');
}

function closeSettingsModal() {
    elements.settingsModal.classList.remove('open');
}

async function handleFetchModels() {
    const apiUrl = elements.apiUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();

    if (!apiUrl || !apiKey) {
        showNotification('Please enter API URL and API Key first', 'error');
        return;
    }

    elements.fetchModelsBtn.disabled = true;
    elements.fetchModelsBtn.textContent = 'Fetching...';

    try {
        const models = await fetchModels(apiUrl, apiKey);

        // Clear and populate model select
        elements.modelSelect.innerHTML = '<option value="">Select a model...</option>';

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id || model.name || model;
            option.textContent = model.id || model.name || model;
            elements.modelSelect.appendChild(option);
        });

        showNotification(`Found ${models.length} models`, 'success');

    } catch (error) {
        showNotification(`Failed to fetch models: ${error.message}`, 'error');
    } finally {
        elements.fetchModelsBtn.disabled = false;
        elements.fetchModelsBtn.textContent = 'Fetch Models';
    }
}

// ============================================
// Utilities
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateSyncUI(syncStatus) {
    const state = syncStatus?.state || 'offline';
    const lastSyncAt = syncStatus?.lastSyncAt || null;
    const error = syncStatus?.error || null;

    let label = 'Offline';
    if (state === 'syncing') label = 'Syncing…';
    if (state === 'synced') label = lastSyncAt ? 'Synced' : 'Synced';

    if (elements.syncIndicator) {
        elements.syncIndicator.textContent = label;
        elements.syncIndicator.dataset.state = state;
        elements.syncIndicator.title = error ? `Sync error: ${error}` : `Sync status: ${label}`;
    }
    if (elements.syncStatusText) {
        elements.syncStatusText.textContent = error ? `Offline (${error})` : label;
    }
}

function showNotification(message, type = 'info') {
    // Simple console notification for now
    // Could be enhanced with toast notifications
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} ${message}`);

    // Also show as a brief visual indicator
    const indicator = document.createElement('div');
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    indicator.textContent = message;
    document.body.appendChild(indicator);

    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.3s';
        setTimeout(() => indicator.remove(), 300);
    }, 3000);
}

function showLoading(message) {
    // Could add a loading overlay
    console.log(`⏳ ${message}`);
}

function hideLoading() {
    // Hide loading overlay
}

function exitAnalysisMode() {
    isAnalysisMode = false;
}

// ============================================
// Anki Integration
// ============================================

/**
 * Switch between AI and Anki settings tabs
 */
function switchSettingsTab(tabName) {
    // Update tab buttons
    elements.settingsTabAI.classList.toggle('active', tabName === 'ai');
    elements.settingsTabAnki.classList.toggle('active', tabName === 'anki');
    elements.settingsTabSync.classList.toggle('active', tabName === 'sync');

    // Update tab content
    elements.aiSettingsContent.classList.toggle('active', tabName === 'ai');
    elements.ankiSettingsContent.classList.toggle('active', tabName === 'anki');
    elements.syncSettingsContent.classList.toggle('active', tabName === 'sync');

    // If switching to Anki tab, try to load options
    if (tabName === 'anki') {
        refreshAnkiOptions();
    }

    if (tabName === 'sync') {
        updateSyncUI(getSyncStatus());
    }
}

/**
 * Refresh Anki deck and model options
 */
async function refreshAnkiOptions() {
    const ankiSettings = getAnkiSettings();

    try {
        // Fetch decks
        const decks = await getDeckNames();
        elements.ankiDeckSelect.innerHTML = '<option value="">选择牌组...</option>';
        decks.forEach(deck => {
            const option = document.createElement('option');
            option.value = deck;
            option.textContent = deck;
            if (deck === ankiSettings.deckName) {
                option.selected = true;
            }
            elements.ankiDeckSelect.appendChild(option);
        });

        // Fetch models
        const models = await getModelNames();
        elements.ankiModelSelect.innerHTML = '<option value="">选择笔记类型...</option>';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            if (model === ankiSettings.modelName) {
                option.selected = true;
            }
            elements.ankiModelSelect.appendChild(option);
        });

        // If model is already selected, load its fields
        if (ankiSettings.modelName) {
            await loadModelFields(ankiSettings.modelName, ankiSettings.fieldMapping);
        }

    } catch (error) {
        console.error('Failed to refresh Anki options:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Handle model selection change - load fields
 */
async function handleAnkiModelChange() {
    const modelName = elements.ankiModelSelect.value;
    if (modelName) {
        await loadModelFields(modelName, {});
    } else {
        // Clear field selects
        clearFieldSelects();
    }
}

/**
 * Load fields for a specific model
 */
async function loadModelFields(modelName, currentMapping = {}) {
    try {
        const fields = await getModelFieldNames(modelName);
        const fieldSelects = [
            elements.fieldWord,
            elements.fieldContext,
            elements.fieldMeaning,
            elements.fieldUsage,
            elements.fieldContextualMeaning
        ];
        const mappingKeys = ['word', 'context', 'meaning', 'usage', 'contextualMeaning'];

        fieldSelects.forEach((select, index) => {
            select.innerHTML = '<option value="">不映射</option>';
            fields.forEach(field => {
                const option = document.createElement('option');
                option.value = field;
                option.textContent = field;
                if (currentMapping[mappingKeys[index]] === field) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        });

    } catch (error) {
        console.error('Failed to load model fields:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Clear all field select dropdowns
 */
function clearFieldSelects() {
    const fieldSelects = [
        elements.fieldWord,
        elements.fieldContext,
        elements.fieldMeaning,
        elements.fieldUsage,
        elements.fieldContextualMeaning
    ];
    fieldSelects.forEach(select => {
        select.innerHTML = '<option value="">不映射</option>';
    });
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

/**
 * Handle Auto Study toggle change
 */
function handleAutoAnkiToggle() {
    isAutoStudyEnabled = elements.autoAnkiToggle.checked;

    // Save to settings
    const ankiSettings = getAnkiSettings();
    ankiSettings.autoAddToStudy = isAutoStudyEnabled;
    // Back-compat with old key
    ankiSettings.autoAddToAnki = isAutoStudyEnabled;
    saveAnkiSettings(ankiSettings);

    showNotification(isAutoStudyEnabled ? '自动加入学习已开启' : '自动加入学习已关闭', 'success');
}

/**
 * Save both AI and Anki settings
 */
function handleSaveSettings() {
    // Save AI settings
    const settings = {
        apiUrl: elements.apiUrl.value.trim(),
        apiKey: elements.apiKey.value.trim(),
        model: elements.modelSelect.value,
        language: elements.languageSelect.value,
        readingLevel: elements.readingLevelSelect.value,
        backendUrl: elements.backendUrl.value.trim(),
        syncEnabled: !!elements.syncEnabledToggle.checked
    };

    if (saveSettings(settings)) {
        // Also save Anki settings
        const ankiSettings = {
            deckName: elements.ankiDeckSelect.value,
            modelName: elements.ankiModelSelect.value,
            fieldMapping: {
                word: elements.fieldWord.value,
                context: elements.fieldContext.value,
                meaning: elements.fieldMeaning.value,
                usage: elements.fieldUsage.value,
                contextualMeaning: elements.fieldContextualMeaning.value
            },
            autoAddToStudy: isAutoStudyEnabled,
            autoAddToAnki: isAutoStudyEnabled
        };
        saveAnkiSettings(ankiSettings);

        showNotification('设置已保存', 'success');
        closeSettingsModal();

        // Restart background sync according to new settings
        stopBackgroundSync();
        if (currentView === 'reader' && currentBookId) {
            startBackgroundSync(currentBookId);
            if (settings.syncEnabled) syncNow(currentBookId);
        }
    } else {
        showNotification('保存设置失败', 'error');
    }
}

// ============================================
// Start Application
// ============================================
document.addEventListener('DOMContentLoaded', init);
