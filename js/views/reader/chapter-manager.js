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
  let chapterPeekPillState = 'hidden';
  let chapterPeekPillDismissedForChapterId = null;
  let lastReadyChapterId = null;
  let lastReadyChapterTitle = '';

  function isMobileViewport() {
    return window.innerWidth <= 768;
  }

  function getCurrentChapterMeta() {
    if (!state.currentBook) return null;
    const chapter = state.currentBook.chapters[state.currentChapterIndex];
    if (!chapter) return null;
    return {
      chapter,
      chapterId: chapter.id,
      chapterTitle: chapter.title || '',
      bookId: state.currentBookId || null
    };
  }

  function canUseMobileChapterUi() {
    return Boolean(
      elements.mobileChapterOverlay &&
      elements.mobileChapterContent &&
      elements.mobileChapterAnalysisCloseBtn &&
      elements.mobileChapterAnalysisRefreshBtn
    );
  }

  function canUseMobileChapterPeekPillUi() {
    return Boolean(
      elements.mobileChapterPeekPill &&
      elements.mobileChapterPeekPillMain &&
      elements.mobileChapterPeekPillLabel &&
      elements.mobileChapterPeekPillTitle &&
      elements.mobileChapterPeekPillClose
    );
  }

  function hideMobileChapterPeekPill() {
    if (!elements.mobileChapterPeekPill) return;
    chapterPeekPillState = 'hidden';
    elements.mobileChapterPeekPill.classList.remove('active', 'is-analyzing', 'is-ready', 'is-error');
    elements.mobileChapterPeekPill.setAttribute('aria-hidden', 'true');
  }

  function showMobileChapterPeekPill({ mode, title, message } = {}) {
    if (!canUseMobileChapterPeekPillUi()) return;
    if (!isMobileViewport()) return;

    chapterPeekPillState =
      mode === 'analyzing' ? 'analyzing' :
        mode === 'ready' ? 'ready' :
          mode === 'error' ? 'error' : 'hidden';

    elements.mobileChapterPeekPill.classList.add('active');
    elements.mobileChapterPeekPill.classList.toggle('is-analyzing', mode === 'analyzing');
    elements.mobileChapterPeekPill.classList.toggle('is-ready', mode === 'ready');
    elements.mobileChapterPeekPill.classList.toggle('is-error', mode === 'error');
    elements.mobileChapterPeekPill.setAttribute('aria-hidden', 'false');

    const label =
      mode === 'analyzing' ? (message || '正在分析中…') :
        mode === 'ready' ? (message || '章节分析已就绪') :
          (message || '章节分析失败');

    elements.mobileChapterPeekPillLabel.textContent = label;
    elements.mobileChapterPeekPillTitle.textContent = title || '';
  }

  function openMobileChapterSheet() {
    if (!canUseMobileChapterUi()) return;
    if (!isMobileViewport()) return;
    elements.mobileChapterOverlay.classList.add('active');
    elements.mobileChapterOverlay.setAttribute('aria-hidden', 'false');
    hideMobileChapterPeekPill();
  }

  function closeMobileChapterSheet({ reshowPeekPill = true } = {}) {
    if (!elements.mobileChapterOverlay) return;
    elements.mobileChapterOverlay.classList.remove('active');
    elements.mobileChapterOverlay.setAttribute('aria-hidden', 'true');

    if (!reshowPeekPill) return;
    if (!isMobileViewport()) return;
    const meta = getCurrentChapterMeta();
    if (!meta) return;
    if (!meta.bookId) return;
    if (!canUseMobileChapterPeekPillUi()) return;
    if (chapterPeekPillDismissedForChapterId === meta.chapterId) return;
    if (lastReadyChapterId !== meta.chapterId) return;
    showMobileChapterPeekPill({ mode: 'ready', title: lastReadyChapterTitle });
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
    closeMobileChapterSheet({ reshowPeekPill: false });
    hideMobileChapterPeekPill();
    chapterPeekPillDismissedForChapterId = null;
    lastReadyChapterId = null;
    lastReadyChapterTitle = '';

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

  async function startChapterAnalysis({
    force = false,
    showMobile = false,
    focusTab = true,
    renderDesktopLoading = true
  } = {}) {
    if (!state.currentBook) return;

    const meta = getCurrentChapterMeta();
    if (!meta) return;
    const { chapter, chapterId, chapterTitle, bookId } = meta;

    const requestId = ++chapterAnalysisRequestId;

    if (showMobile) openMobileChapterSheet();

    if (!force && bookId) {
      const savedAnalysis = await getChapterAnalysis(bookId, chapterId);
      if (savedAnalysis?.content) {
        renderChapterAnalysisHtml(formatMarkdown(savedAnalysis.content));
        lastReadyChapterId = chapterId;
        lastReadyChapterTitle = chapterTitle;
        return;
      }
    }

    if (focusTab) switchTab('chapter-analysis');
    if (renderDesktopLoading) {
      elements.chapterAnalysisContent.innerHTML = '<p class="loading">Analyzing chapter...</p>';
    }
    if (elements.mobileChapterContent) {
      elements.mobileChapterContent.innerHTML = '<p class="loading">Analyzing chapter...</p>';
    }

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

      lastReadyChapterId = chapterId;
      lastReadyChapterTitle = chapterTitle;
    } catch (error) {
      if (requestId !== chapterAnalysisRequestId) return;

      const baseErrorHtml = `<p class="text-error">Error: ${escapeHtml(error.message)}</p>`;
      if (renderDesktopLoading) {
        elements.chapterAnalysisContent.innerHTML = baseErrorHtml;
      }

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

  async function queueMobileChapterAnalysis() {
    const meta = getCurrentChapterMeta();
    if (!meta || !meta.bookId) return;
    if (!isMobileViewport()) return;
    if (!canUseMobileChapterPeekPillUi()) return;

    const { bookId, chapterId, chapterTitle } = meta;

    const savedAnalysis = await getChapterAnalysis(bookId, chapterId);
    if (savedAnalysis?.content) {
      lastReadyChapterId = chapterId;
      lastReadyChapterTitle = chapterTitle;
      if (chapterPeekPillDismissedForChapterId !== chapterId) {
        showMobileChapterPeekPill({ mode: 'ready', title: chapterTitle });
      }
      return;
    }

    chapterPeekPillDismissedForChapterId = null;
    showMobileChapterPeekPill({ mode: 'analyzing', title: chapterTitle, message: '正在分析中…' });
    await startChapterAnalysis({ force: true, showMobile: false, focusTab: false, renderDesktopLoading: false });

    const stillSame = getCurrentChapterMeta()?.chapterId === chapterId;
    if (!stillSame) return;

    if (lastReadyChapterId === chapterId && chapterPeekPillDismissedForChapterId !== chapterId) {
      showMobileChapterPeekPill({ mode: 'ready', title: chapterTitle });
    } else if (chapterPeekPillState !== 'hidden' && chapterPeekPillDismissedForChapterId !== chapterId) {
      showMobileChapterPeekPill({ mode: 'error', title: chapterTitle });
    }
  }

  async function handleChapterAnalysis() {
    if (!state.currentBook) return;

    if (isMobileViewport() && canUseMobileChapterPeekPillUi()) {
      await queueMobileChapterAnalysis();
      return;
    }

    await startChapterAnalysis({ force: true, showMobile: false, focusTab: true, renderDesktopLoading: true });
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
    void startChapterAnalysis({ force: true, showMobile: true, focusTab: false, renderDesktopLoading: true });
  });

  elements.mobileChapterContent?.addEventListener('click', (e) => {
    const actionEl = e.target instanceof HTMLElement ? e.target.closest('[data-action]') : null;
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'retry-chapter-analysis') {
      e.preventDefault();
      void startChapterAnalysis({ force: true, showMobile: true, focusTab: false, renderDesktopLoading: true });
    }
  });

  elements.mobileChapterPeekPillMain?.addEventListener('click', () => {
    if (!isMobileViewport()) return;
    const meta = getCurrentChapterMeta();
    if (!meta) return;

    if (chapterPeekPillState === 'ready') {
      openMobileChapterSheet();
      return;
    }

    if (chapterPeekPillState === 'error') {
      chapterPeekPillDismissedForChapterId = null;
      showMobileChapterPeekPill({ mode: 'analyzing', title: meta.chapterTitle, message: '正在分析中…' });
      void startChapterAnalysis({ force: true, showMobile: false, focusTab: false, renderDesktopLoading: false })
        .then(() => {
          if (lastReadyChapterId === meta.chapterId && chapterPeekPillDismissedForChapterId !== meta.chapterId) {
            showMobileChapterPeekPill({ mode: 'ready', title: meta.chapterTitle });
          } else if (chapterPeekPillDismissedForChapterId !== meta.chapterId) {
            showMobileChapterPeekPill({ mode: 'error', title: meta.chapterTitle });
          }
        });
    }
  });

  elements.mobileChapterPeekPillClose?.addEventListener('click', (e) => {
    e.preventDefault();
    const meta = getCurrentChapterMeta();
    if (meta?.chapterId) chapterPeekPillDismissedForChapterId = meta.chapterId;
    hideMobileChapterPeekPill();
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
