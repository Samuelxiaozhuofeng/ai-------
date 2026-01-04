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
    getChapterMarks, 
    saveChapterMarks,
    saveReadingPosition,
    getReadingPosition,
    generateBookHash,
    getBookData,
    saveBookData,
    getTheme,
    saveTheme,
    getLayout,
    saveLayout
} from './storage.js';

// ============================================
// State
// ============================================
let currentBook = null;
let currentChapterIndex = 0;
let bookHash = null;
let markerManager = null;
let isAnalysisMode = false;
let isResizing = false;

// ============================================
// DOM Elements
// ============================================
const elements = {
    // File input
    fileInput: document.getElementById('fileInput'),
    importBtn: document.getElementById('importBtn'),
    importBtnWelcome: document.getElementById('importBtnWelcome'),
    
    // Header
    bookTitle: document.getElementById('bookTitle'),
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
    vocabList: document.getElementById('vocabList'),
    vocabCount: document.getElementById('vocabCount'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    closeAnalysisBtn: document.getElementById('closeAnalysisBtn'),
    resizeHandle: document.getElementById('resizeHandle'),
    
    // Tabs
    tabVocab: document.getElementById('tabVocab'),
    tabVocabAnalysis: document.getElementById('tabVocabAnalysis'),
    tabChapterAnalysis: document.getElementById('tabChapterAnalysis'),
    vocabTab: document.getElementById('vocabTab'),
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
function init() {
    // Load theme
    initTheme();
    
    // Load settings
    loadSettingsToForm();
    
    // Event listeners
    setupEventListeners();
    
    console.log('📚 Language Reader initialized');
}

function setupEventListeners() {
    // Import EPUB
    elements.importBtn.addEventListener('click', () => elements.fileInput.click());
    elements.importBtnWelcome.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileImport);
    
    // Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Tab switching
    elements.tabVocab.addEventListener('click', () => switchTab('vocab'));
    elements.tabVocabAnalysis.addEventListener('click', () => switchTab('vocab-analysis'));
    elements.tabChapterAnalysis.addEventListener('click', () => switchTab('chapter-analysis'));
    
    // Analysis
    elements.analyzeBtn.addEventListener('click', handleVocabularyAnalysis);
    elements.chapterAnalysisBtn.addEventListener('click', handleChapterAnalysis);
    elements.closeAnalysisBtn.addEventListener('click', exitAnalysisMode);
    
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
            if (isAnalysisMode) {
                exitAnalysisMode();
            }
        }
    });
}

// ============================================
// File Import
// ============================================
async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
        showLoading('Parsing EPUB...');
        
        currentBook = await parseEpub(file);
        bookHash = generateBookHash(currentBook.title + currentBook.chapters[0]?.content.substring(0, 100));
        
        // Update UI
        elements.bookTitle.textContent = currentBook.title;
        renderChaptersList();
        
        // Load saved position
        const savedPosition = getReadingPosition(bookHash);
        loadChapter(savedPosition || 0);
        
        hideLoading();
        showNotification(`Successfully loaded: ${currentBook.title}`, 'success');
        
    } catch (error) {
        hideLoading();
        showNotification(`Failed to parse EPUB: ${error.message}`, 'error');
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

function loadChapter(index) {
    if (!currentBook || index < 0 || index >= currentBook.chapters.length) {
        return;
    }
    
    // Save marks from current chapter before switching
    if (markerManager && currentBook) {
        const marks = markerManager.getMarks();
        const currentChapterId = currentBook.chapters[currentChapterIndex].id;
        saveChapterMarks(bookHash, currentChapterId, marks);
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
    const savedMarks = getChapterMarks(bookHash, chapter.id);
    if (savedMarks.length > 0) {
        markerManager.restoreMarks(savedMarks);
    }
    
    // Update vocabulary list
    updateVocabList();
    
    // Save reading position
    saveReadingPosition(bookHash, index);
    
    // Scroll to top
    elements.readingContent.scrollTop = 0;
}

// ============================================
// Vocabulary Management
// ============================================
function handleMarksChange(marks) {
    updateVocabList();
    
    // Save marks
    if (currentBook && bookHash) {
        const chapterId = currentBook.chapters[currentChapterIndex].id;
        saveChapterMarks(bookHash, chapterId, marks);
    }
}

function updateVocabList() {
    const marks = markerManager?.getMarks() || [];
    
    elements.vocabCount.textContent = marks.length;
    elements.analyzeBtn.disabled = marks.length === 0;
    
    if (marks.length === 0) {
        elements.vocabList.innerHTML = '<p class="empty-state">Select text and press Ctrl+B to mark</p>';
        return;
    }
    
    elements.vocabList.innerHTML = marks.map(mark => `
        <div class="vocab-item" data-mark-id="${mark.id}">
            <span class="vocab-text">${escapeHtml(mark.text)}</span>
            <button class="vocab-remove" title="Remove">✕</button>
        </div>
    `).join('');
    
    // Add remove listeners
    elements.vocabList.querySelectorAll('.vocab-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const markId = btn.closest('.vocab-item').dataset.markId;
            markerManager.removeMarkById(markId);
        });
    });
}

// ============================================
// AI Analysis
// ============================================
async function handleVocabularyAnalysis() {
    if (!currentBook || !markerManager) return;
    
    const marks = markerManager.getMarks();
    if (marks.length === 0) {
        showNotification('请先标记一些词汇', 'error');
        return;
    }
    
    const chapter = currentBook.chapters[currentChapterIndex];
    
    // Enter analysis mode
    enterAnalysisMode();
    
    // Set loading state
    elements.vocabAnalysisContent.innerHTML = '<p class="loading">Analyzing vocabulary...</p>';
    
    // Switch to vocabulary analysis tab
    switchTab('vocab-analysis');
    
    // Import analyzeVocabulary
    const { analyzeVocabulary } = await import('./ai-service.js');
    
    try {
        const result = await analyzeVocabulary(marks.map(m => m.text), chapter.content);
        renderVocabularyAnalysis(result);
    } catch (error) {
        elements.vocabAnalysisContent.innerHTML = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
        showNotification(`分析失败: ${error.message}`, 'error');
    }
}

async function handleChapterAnalysis() {
    if (!currentBook) return;
    
    const chapter = currentBook.chapters[currentChapterIndex];
    
    // Enter analysis mode
    enterAnalysisMode();
    
    // Set loading state
    elements.chapterAnalysisContent.innerHTML = '<p class="loading">Analyzing chapter...</p>';
    
    // Switch to chapter analysis tab
    switchTab('chapter-analysis');
    
    // Import analyzeChapter
    const { analyzeChapter } = await import('./ai-service.js');
    
    try {
        const result = await analyzeChapter(chapter.content, chapter.title);
        renderChapterAnalysis(result);
    } catch (error) {
        elements.chapterAnalysisContent.innerHTML = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
        showNotification(`分析失败: ${error.message}`, 'error');
    }
}

function enterAnalysisMode() {
    isAnalysisMode = true;
    elements.mainContent.classList.add('analysis-mode');
    elements.analyzeBtn.classList.add('hidden');
    elements.closeAnalysisBtn.classList.remove('hidden');
    
    // Restore saved layout
    const layout = getLayout();
    applyLayout(layout);
}

function exitAnalysisMode() {
    isAnalysisMode = false;
    elements.mainContent.classList.remove('analysis-mode');
    elements.analyzeBtn.classList.remove('hidden');
    elements.closeAnalysisBtn.classList.add('hidden');
    
    // Switch back to vocab tab
    switchTab('vocab');
    
    // Reset inline styles
    elements.readingPanel.style.flex = '';
    elements.vocabPanel.style.flex = '';
}

function switchTab(tabName) {
    // Update tab buttons
    [elements.tabVocab, elements.tabVocabAnalysis, elements.tabChapterAnalysis].forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    elements.vocabTab.classList.toggle('active', tabName === 'vocab');
    elements.vocabAnalysisTab.classList.toggle('active', tabName === 'vocab-analysis');
    elements.chapterAnalysisTab.classList.toggle('active', tabName === 'chapter-analysis');
}

function renderVocabularyAnalysis(result) {
    try {
        // Try to parse JSON
        let data;
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            data = JSON.parse(jsonMatch[0]);
        } else {
            // Fallback: display as formatted text
            elements.vocabAnalysisContent.innerHTML = formatMarkdown(result);
            return;
        }
        
        if (!data.vocabulary || !Array.isArray(data.vocabulary)) {
            elements.vocabAnalysisContent.innerHTML = formatMarkdown(result);
            return;
        }
        
        // Render structured vocabulary cards
        const html = data.vocabulary.map(item => `
            <div class="vocab-card">
                <div class="vocab-card-header">
                    <span class="vocab-card-word">${escapeHtml(item.original || '')}</span>
                    ${item.partOfSpeech ? `<span class="vocab-card-pos">${escapeHtml(item.partOfSpeech)}</span>` : ''}
                </div>
                <div class="vocab-card-body">
                    ${item.definition ? `
                        <div class="vocab-card-row">
                            <div class="vocab-card-label">Definition</div>
                            <div class="vocab-card-value">${escapeHtml(item.definition)}</div>
                        </div>
                    ` : ''}
                    ${item.contextUsage ? `
                        <div class="vocab-card-row">
                            <div class="vocab-card-label">Context Usage</div>
                            <div class="vocab-card-value">${escapeHtml(item.contextUsage)}</div>
                        </div>
                    ` : ''}
                    ${item.example ? `
                        <div class="vocab-card-row">
                            <div class="vocab-card-label">Example</div>
                            <div class="vocab-card-value vocab-card-example">${escapeHtml(item.example)}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        elements.vocabAnalysisContent.innerHTML = html || '<p class="empty-state">No vocabulary analysis available</p>';
        
    } catch (e) {
        console.warn('Failed to parse JSON, using formatted text:', e);
        elements.vocabAnalysisContent.innerHTML = formatMarkdown(result);
    }
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
    elements.themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ============================================
// Resize Handle
// ============================================
function setupResizeHandle() {
    let startX, startReaderWidth, startPanelWidth;
    
    elements.resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        const mainRect = elements.mainContent.getBoundingClientRect();
        startReaderWidth = elements.readingPanel.getBoundingClientRect().width / mainRect.width * 100;
        startPanelWidth = elements.vocabPanel.getBoundingClientRect().width / mainRect.width * 100;
        
        elements.resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const mainRect = elements.mainContent.getBoundingClientRect();
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / mainRect.width) * 100;
        
        let newReaderWidth = startReaderWidth + deltaPercent;
        let newPanelWidth = startPanelWidth - deltaPercent;
        
        // Constraints
        newReaderWidth = Math.max(30, Math.min(70, newReaderWidth));
        newPanelWidth = Math.max(30, Math.min(70, newPanelWidth));
        
        elements.readingPanel.style.flex = `0 0 ${newReaderWidth}%`;
        elements.vocabPanel.style.flex = `0 0 ${newPanelWidth}%`;
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
            readerWidth: elements.readingPanel.getBoundingClientRect().width / mainRect.width * 100,
            panelWidth: elements.vocabPanel.getBoundingClientRect().width / mainRect.width * 100
        };
        saveLayout(layout);
    });
}

function applyLayout(layout) {
    elements.readingPanel.style.flex = `0 0 ${layout.readerWidth}%`;
    elements.vocabPanel.style.flex = `0 0 ${layout.panelWidth}%`;
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

// ============================================
// Start Application
// ============================================
document.addEventListener('DOMContentLoaded', init);
