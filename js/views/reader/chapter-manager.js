import { showNotification } from '../../ui/notifications.js';
import { escapeHtml } from '../../utils/html.js';
import { getChapterAnalysis, saveChapterAnalysis, updateReadingProgress } from '../../db.js';
import { sanitizeHtml } from '../../utils/sanitize.js';

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
  let chapterAnalysisRequestId = 0;

  function isMobileViewport() {
    return window.innerWidth <= 768;
  }

  function canUseMobileChapterUi() {
    return Boolean(
      elements.mobileChapterOverlay &&
      elements.mobileChapterContent &&
      elements.mobileChapterAnalysisCloseBtn &&
      elements.mobileChapterAnalysisRefreshBtn
    );
  }

  function openMobileChapterSheet() {
    if (!canUseMobileChapterUi()) return;
    if (!isMobileViewport()) return;
    elements.mobileChapterOverlay.classList.add('active');
    elements.mobileChapterOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeMobileChapterSheet() {
    if (!elements.mobileChapterOverlay) return;
    elements.mobileChapterOverlay.classList.remove('active');
    elements.mobileChapterOverlay.setAttribute('aria-hidden', 'true');
  }

  function invalidatePendingChapterAnalysis() {
    chapterAnalysisRequestId += 1;
  }

  function getEmptyStateHtml() {
    return '<p class="empty-state">点击 "Chapter Analysis" 获取章节概览</p>';
  }

  function renderChapterAnalysisHtml(html) {
    elements.chapterAnalysisContent.innerHTML = html;

    if (elements.mobileChapterContent) {
      elements.mobileChapterContent.innerHTML = html;
    }
  }

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
    invalidatePendingChapterAnalysis();
    closeMobileChapterSheet();

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
      container.innerHTML = getEmptyStateHtml();
      if (elements.mobileChapterContent) elements.mobileChapterContent.innerHTML = container.innerHTML;
      return;
    }

    const chapterId = state.currentBook.chapters[state.currentChapterIndex].id;
    const savedAnalysis = await getChapterAnalysis(state.currentBookId, chapterId);

    if (savedAnalysis && savedAnalysis.content) {
      container.innerHTML = formatMarkdown(savedAnalysis.content);
    } else {
      container.innerHTML = getEmptyStateHtml();
    }

    if (elements.mobileChapterContent) elements.mobileChapterContent.innerHTML = container.innerHTML;
  }

  async function startChapterAnalysis({ force = false, showMobile = isMobileViewport() && canUseMobileChapterUi() } = {}) {
    if (!state.currentBook) return;

    const chapter = state.currentBook.chapters[state.currentChapterIndex];
    const bookId = state.currentBookId || null;
    const chapterId = chapter.id;

    const requestId = ++chapterAnalysisRequestId;

    if (showMobile) openMobileChapterSheet();

    if (!force && bookId) {
      const savedAnalysis = await getChapterAnalysis(bookId, chapterId);
      if (savedAnalysis?.content) {
        renderChapterAnalysisHtml(formatMarkdown(savedAnalysis.content));
        return;
      }
    }

    switchTab('chapter-analysis');
    renderChapterAnalysisHtml('<p class="loading">Analyzing chapter...</p>');

    const { analyzeChapter } = await import('../../ai-service.js');

    try {
      const result = await analyzeChapter(chapter.content, chapter.title);
      if (requestId !== chapterAnalysisRequestId) return;
      if (bookId && state.currentBookId !== bookId) return;
      if (state.currentBook?.chapters?.[state.currentChapterIndex]?.id !== chapterId) return;

      renderChapterAnalysis(result);

      if (bookId) {
        await saveChapterAnalysis(bookId, chapterId, result);
      }
    } catch (error) {
      if (requestId !== chapterAnalysisRequestId) return;

      const baseErrorHtml = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
      elements.chapterAnalysisContent.innerHTML = baseErrorHtml;

      if (elements.mobileChapterContent) {
        elements.mobileChapterContent.innerHTML = `${baseErrorHtml}
          <p class="analysis-retry-row">
            <button class="btn btn-secondary" type="button" data-action="retry-chapter-analysis">⟳ 重试</button>
          </p>
        `;
      }
      showNotification(`分析失败: ${error.message}`, 'error');
    }
  }

  async function handleChapterAnalysis() {
    if (!state.currentBook) return;

    if (isMobileViewport() && canUseMobileChapterUi()) {
      await startChapterAnalysis({ force: false, showMobile: true });
      return;
    }

    await startChapterAnalysis({ force: true, showMobile: false });
  }

  function renderChapterAnalysis(result) {
    renderChapterAnalysisHtml(formatMarkdown(result));
  }

  function formatMarkdown(content) {
    if (!content) return '<p class="empty-state">No content</p>';

    const html = content
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
    return sanitizeHtml(html);
  }

  pagination.setLoadChapter(loadChapter);

  if (elements.mobileChapterOverlay) {
    elements.mobileChapterOverlay.addEventListener('click', (e) => {
      if (e.target === elements.mobileChapterOverlay) {
        closeMobileChapterSheet();
      }
    });
  }

  elements.mobileChapterAnalysisCloseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileChapterSheet();
  });

  elements.mobileChapterAnalysisRefreshBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    void startChapterAnalysis({ force: true, showMobile: true });
  });

  elements.mobileChapterContent?.addEventListener('click', (e) => {
    const actionEl = e.target instanceof HTMLElement ? e.target.closest('[data-action]') : null;
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'retry-chapter-analysis') {
      e.preventDefault();
      void startChapterAnalysis({ force: true, showMobile: true });
    }
  });

  return {
    renderChaptersList,
    openChapterSelectModal,
    closeChapterSelectModal,
    loadChapter,
    persistReadingProgress,
    handleChapterAnalysis
  };
}
