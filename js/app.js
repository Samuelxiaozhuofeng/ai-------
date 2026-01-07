/**
 * Language Reader - Main Application
 * Coordinates all modules and handles UI interactions
 */

import { parseEpub, textToHtml } from './epub-parser.js';
import { MarkerManager } from './marker.js';
import {
    fetchModels,
    runConcurrentAnalysis
} from './ai-service.js';
import {
    getSettings,
    saveSettings,
    getTheme,
    saveTheme,
    getLayout,
    saveLayout
} from './storage.js';
import {
    initDB,
    saveBook,
    getAllBooks,
    getBook,
    deleteBook as deleteBookFromDB,
    renameBook as renameBookInDB,
    updateReadingProgress,
    saveChapterMarks,
    getChapterMarks,
    saveChapterAnalysis,
    getChapterAnalysis,
    saveVocabCards,
    getVocabCards,
    generateBookHash
} from './db.js';

// ============================================
// State
// ============================================
let currentView = 'bookshelf'; // 'bookshelf' | 'reader'
let viewMode = 'grid';         // 'grid' | 'list'
let booksLibrary = [];         // Books metadata list
let currentBook = null;
let currentBookId = null;
let currentChapterIndex = 0;
let markerManager = null;
let isAnalysisMode = false;
let isResizing = false;
let contextMenuBookId = null;
let currentChapterVocabCards = []; // Vocab cards for current chapter

// ============================================
// DOM Elements
// ============================================
const elements = {
    // Views
    bookshelfView: document.getElementById('bookshelfView'),
    readerView: document.getElementById('readerView'),

    // Bookshelf
    booksContainer: document.getElementById('booksContainer'),
    emptyBookshelf: document.getElementById('emptyBookshelf'),
    importBookBtn: document.getElementById('importBookBtn'),
    importBtnEmpty: document.getElementById('importBtnEmpty'),
    gridViewBtn: document.getElementById('gridViewBtn'),
    listViewBtn: document.getElementById('listViewBtn'),
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

    // Main content
    mainContent: document.querySelector('.main-content'),
    chaptersPanel: document.querySelector('.chapters-panel'),
    readingPanel: document.querySelector('.reading-panel'),

    // Chapters
    chaptersList: document.getElementById('chaptersList'),
    chapterInfo: document.getElementById('chapterInfo'),

    // Reading
    readingContent: document.getElementById('readingContent'),
    chapterAnalysisBtn: document.getElementById('chapterAnalysisBtn'),

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
    readingLevelSelect: document.getElementById('readingLevelSelect')
};

// ============================================
// Initialization
// ============================================
async function init() {
    try {
        // Initialize IndexedDB
        await initDB();
        console.log('📚 Database initialized');

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

    // Reader: Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Sidebar toggle
    if (elements.toggleSidebarBtn) {
        elements.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }

    // Tab switching
    elements.tabVocabAnalysis.addEventListener('click', () => switchTab('vocab-analysis'));
    elements.tabChapterAnalysis.addEventListener('click', () => switchTab('chapter-analysis'));

    // Chapter Analysis
    elements.chapterAnalysisBtn.addEventListener('click', handleChapterAnalysis);

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
        if (e.key === 'Escape') {
            closeSettingsModal();
            closeRenameModal();
            closeDeleteModal();
            hideContextMenu();
            if (isAnalysisMode) {
                exitAnalysisMode();
            }
        }
    });
}

// ============================================
// View Switching
// ============================================
function switchToBookshelf() {
    // Save current reading progress
    if (currentBook && currentBookId) {
        saveCurrentProgress();
    }

    currentView = 'bookshelf';
    elements.bookshelfView.style.display = '';
    elements.readerView.style.display = 'none';

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

        // Update UI
        elements.bookTitle.textContent = book.title;
        renderChaptersList();

        // Load saved chapter
        loadChapter(currentChapterIndex);

        // Switch view
        currentView = 'reader';
        elements.bookshelfView.style.display = 'none';
        elements.readerView.style.display = '';

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

    elements.chaptersList.innerHTML = currentBook.chapters.map((chapter, index) => `
        <button class="chapter-item ${index === currentChapterIndex ? 'active' : ''}" 
                data-index="${index}">
            ${chapter.title}
        </button>
    `).join('');

    // Add click listeners
    elements.chaptersList.querySelectorAll('.chapter-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            loadChapter(index);
        });
    });
}

async function loadChapter(index) {
    if (!currentBook || index < 0 || index >= currentBook.chapters.length) {
        return;
    }

    // Save data from current chapter before switching
    if (markerManager && currentBook && currentBookId) {
        const marks = markerManager.getMarks();
        const currentChapterId = currentBook.chapters[currentChapterIndex].id;
        await saveChapterMarks(currentBookId, currentChapterId, marks);
        // Save current vocab cards
        if (currentChapterVocabCards.length > 0) {
            await saveVocabCards(currentBookId, currentChapterId, currentChapterVocabCards);
        }
    }

    currentChapterIndex = index;
    const chapter = currentBook.chapters[index];

    // Update UI
    elements.chapterInfo.textContent = chapter.title;
    elements.readingContent.innerHTML = textToHtml(chapter.content);

    // Update chapter list active state
    elements.chaptersList.querySelectorAll('.chapter-item').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // Enable chapter analysis button
    elements.chapterAnalysisBtn.disabled = false;

    // Initialize marker manager
    if (markerManager) {
        markerManager.destroy();
    }
    markerManager = new MarkerManager(elements.readingContent, handleMarksChange);

    // Restore saved marks
    const savedMarks = await getChapterMarks(currentBookId, chapter.id);
    if (savedMarks.length > 0) {
        markerManager.restoreMarks(savedMarks);
    }

    // Load and display vocab cards for this chapter
    await loadChapterVocabCards();

    // Load and display chapter analysis for this chapter
    await loadChapterAnalysisContent();

    // Save reading position
    await updateReadingProgress(currentBookId, index);

    // Scroll to top
    elements.readingContent.scrollTop = 0;
}

async function saveCurrentProgress() {
    if (markerManager && currentBook && currentBookId) {
        const marks = markerManager.getMarks();
        const currentChapterId = currentBook.chapters[currentChapterIndex].id;
        await saveChapterMarks(currentBookId, currentChapterId, marks);
        // Save vocab cards
        if (currentChapterVocabCards.length > 0) {
            await saveVocabCards(currentBookId, currentChapterId, currentChapterVocabCards);
        }
        await updateReadingProgress(currentBookId, currentChapterIndex);
    }
}

// ============================================
// Vocabulary Management
// ============================================
/**
 * Load and display vocab cards for the current chapter
 */
async function loadChapterVocabCards() {
    const container = elements.vocabAnalysisContent;
    container.innerHTML = ''; // Clear previous content

    if (!currentBook || !currentBookId) {
        container.innerHTML = '<p class="empty-state">导入书籍后开始学习</p>';
        currentChapterVocabCards = [];
        return;
    }

    const chapterId = currentBook.chapters[currentChapterIndex].id;

    // Load saved vocab cards for this chapter
    currentChapterVocabCards = await getVocabCards(currentBookId, chapterId);

    if (currentChapterVocabCards.length === 0) {
        container.innerHTML = '<p class="empty-state">选中文本以添加到词汇列表</p>';
        return;
    }

    // Render saved vocab cards
    currentChapterVocabCards.forEach(cardData => {
        const card = createWordAnalysisCard(cardData.word, cardData.analysis, false);
        container.appendChild(card);
    });
}

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

async function handleMarksChange(marks, newMark) {
    // Save marks
    if (currentBook && currentBookId) {
        const chapterId = currentBook.chapters[currentChapterIndex].id;
        await saveChapterMarks(currentBookId, chapterId, marks);
    }

    // If a new mark was added, analyze it instantly
    if (newMark) {
        await analyzeWordInstantly(newMark);
    }
}

async function analyzeWordInstantly(markData) {
    // Switch to vocabulary tab if not already there
    switchTab('vocab-analysis');

    // Show loading card at the top
    const loadingCard = createWordAnalysisCard(markData.text, null, true);
    prependToVocabAnalysis(loadingCard);

    try {
        // Import and call analyzeWordInstant
        const { analyzeWordInstant } = await import('./ai-service.js');
        const result = await analyzeWordInstant(markData.text, markData.context);

        // Replace loading card with result
        const resultCard = createWordAnalysisCard(markData.text, result, false);
        loadingCard.replaceWith(resultCard);

        // Save the vocab card to the chapter's vocab cards
        const cardData = {
            word: markData.text,
            analysis: result,
            context: markData.context,
            createdAt: new Date().toISOString()
        };
        currentChapterVocabCards.unshift(cardData); // Add to beginning

        // Save to database
        if (currentBook && currentBookId) {
            const chapterId = currentBook.chapters[currentChapterIndex].id;
            await saveVocabCards(currentBookId, chapterId, currentChapterVocabCards);
        }
    } catch (error) {
        console.error('Instant analysis error:', error);
        loadingCard.innerHTML = `
            <div class="vocab-card-header">
                <span class="vocab-card-word">${escapeHtml(markData.text)}</span>
            </div>
            <div class="vocab-card-body">
                <p class="text-error">分析失败: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

function prependToVocabAnalysis(element) {
    const container = elements.vocabAnalysisContent;

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Prepend new element
    container.insertBefore(element, container.firstChild);
}

function createWordAnalysisCard(word, analysis, isLoading) {
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
    `;

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
    elements.chaptersPanel.classList.toggle('collapsed');
}

// ============================================
// Resize Handle
// ============================================
function setupResizeHandle() {
    let startX, startPanelWidth;

    elements.resizeHandle.addEventListener('mousedown', (e) => {
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

    // If model is saved, add it as an option
    if (settings.model) {
        const option = document.createElement('option');
        option.value = settings.model;
        option.textContent = settings.model;
        option.selected = true;
        elements.modelSelect.appendChild(option);
    }
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

function handleSaveSettings() {
    const settings = {
        apiUrl: elements.apiUrl.value.trim(),
        apiKey: elements.apiKey.value.trim(),
        model: elements.modelSelect.value,
        language: elements.languageSelect.value,
        readingLevel: elements.readingLevelSelect.value
    };

    if (saveSettings(settings)) {
        showNotification('Settings saved', 'success');
        closeSettingsModal();
    } else {
        showNotification('Failed to save settings', 'error');
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
// Start Application
// ============================================
document.addEventListener('DOMContentLoaded', init);
