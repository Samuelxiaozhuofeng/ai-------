import { showNotification } from '../../ui/notifications.js';
import { escapeHtml } from '../../utils/html.js';
import { getChapterAnalysis, saveChapterAnalysis, updateReadingProgress } from '../../db.js';

export function createChapterManager({
  elements,
  state,
  chapterSelectModalManager,
  pagination,
  refreshVocabularyCache,
  renderVocabularyPanel,
  applyWordStatusesToContainer,
  switchTab
}) {
  function renderChaptersList() {
    if (!state.currentBook) return;

    elements.chapterSelectList.innerHTML = state.currentBook.chapters.map((chapter, index) => `
        <button class="chapter-item ${index === state.currentChapterIndex ? 'active' : ''}" data-index="${index}">
            ${escapeHtml(chapter.title)}
        </button>
    `).join('');

    elements.chapterSelectList.querySelectorAll('.chapter-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index, 10);
        closeChapterSelectModal();
        void loadChapter(index, { startPage: 0 });
      });
    });
  }

  function openChapterSelectModal() {
    if (!state.currentBook) return;
    renderChaptersList();
    chapterSelectModalManager.open();
  }

  function closeChapterSelectModal() {
    chapterSelectModalManager.close();
  }

  async function loadChapter(index, options = {}) {
    if (!state.currentBook || index < 0 || index >= state.currentBook.chapters.length) return;

    pagination.schedulePageProgressSave();

    state.currentChapterIndex = index;
    const chapter = state.currentBook.chapters[index];

    elements.chapterInfo.textContent = chapter.title;
    pagination.renderChapterContent(chapter.content, options);

    elements.chapterSelectList.querySelectorAll('.chapter-item').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });

    elements.chapterAnalysisBtn.disabled = false;

    await refreshVocabularyCache();
    applyWordStatusesToContainer(elements.readingContent);
    renderVocabularyPanel();

    await loadChapterAnalysisContent();

    await updateReadingProgress(state.currentBookId, index);

    if (!state.isPageFlipMode) {
      elements.readingContent.scrollTop = 0;
    }
  }

  async function persistReadingProgress() {
    if (!state.currentBookId) return;
    await updateReadingProgress(state.currentBookId, state.currentChapterIndex);
  }

  async function loadChapterAnalysisContent() {
    const container = elements.chapterAnalysisContent;

    if (!state.currentBook || !state.currentBookId) {
      container.innerHTML = '<p class="empty-state">点击 "Chapter Analysis" 获取章节概览</p>';
      return;
    }

    const chapterId = state.currentBook.chapters[state.currentChapterIndex].id;
    const savedAnalysis = await getChapterAnalysis(state.currentBookId, chapterId);

    if (savedAnalysis && savedAnalysis.content) {
      container.innerHTML = formatMarkdown(savedAnalysis.content);
    } else {
      container.innerHTML = '<p class="empty-state">点击 "Chapter Analysis" 获取章节概览</p>';
    }
  }

  async function handleChapterAnalysis() {
    if (!state.currentBook) return;

    const chapter = state.currentBook.chapters[state.currentChapterIndex];

    elements.chapterAnalysisContent.innerHTML = '<p class="loading">Analyzing chapter...</p>';
    switchTab('chapter-analysis');

    const { analyzeChapter } = await import('../../ai-service.js');

    try {
      const result = await analyzeChapter(chapter.content, chapter.title);
      renderChapterAnalysis(result);

      if (state.currentBookId) {
        await saveChapterAnalysis(state.currentBookId, chapter.id, result);
      }
    } catch (error) {
      elements.chapterAnalysisContent.innerHTML = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
      showNotification(`分析失败: ${error.message}`, 'error');
    }
  }

  function renderChapterAnalysis(result) {
    elements.chapterAnalysisContent.innerHTML = formatMarkdown(result);
  }

  function formatMarkdown(content) {
    if (!content) return '<p class="empty-state">No content</p>';

    return content
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.+)$/s, '<p>$1</p>')
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[1-4]>)/g, '$1')
      .replace(/(<\/h[1-4]>)<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1')
      .replace(/<p>(<blockquote>)/g, '$1')
      .replace(/(<\/blockquote>)<\/p>/g, '$1')
      .replace(/<p>(<hr>)<\/p>/g, '$1');
  }

  pagination.setLoadChapter(loadChapter);

  return {
    renderChaptersList,
    openChapterSelectModal,
    closeChapterSelectModal,
    loadChapter,
    persistReadingProgress,
    handleChapterAnalysis
  };
}

