import { parseEpub } from '../epub-parser.js';
import { SUPPORTED_LANGUAGES, getFsrsSettings } from '../storage.js';
import {
  countDueCards,
  countDueCardsByLanguage,
  deleteBook as deleteBookFromDB,
  generateBookHash,
  getAllBooks,
  getBook,
  renameBook as renameBookInDB,
  saveBook
} from '../db.js';
import { showNotification } from '../ui/notifications.js';
import { hideLoading, showLoading } from '../ui/loading.js';
import { escapeHtml } from '../utils/html.js';
import { ModalManager, createAsyncChoiceModal } from '../ui/modal-manager.js';
import { getLanguageFilter, setLanguageFilter } from '../core/language-filter.js';
import { getSessionUser } from '../supabase/session.js';
import { listUserEPUBs, uploadEPUB } from '../supabase/epub-service.js';
import { updateRemoteBook } from '../supabase/books-service.js';
import { autoSyncIfNeeded } from '../sync-service.js';

let viewMode = 'grid'; // 'grid' | 'list'
let booksLibrary = []; // Books metadata list
let contextMenuBookId = null;

/** @type {{ openBook: (bookId: string) => void, openReview: (language?: string|null) => void, openVocabLibrary: () => void }} */
let navigation = {
  openBook: () => {},
  openReview: () => {},
  openVocabLibrary: () => {}
};

/**
 * @param {import('../ui/dom-refs.js').elements} elements
 */
export function createBookshelfController(elements) {
  const renameModalManager = new ModalManager(elements.renameModal, { focusTarget: elements.newBookTitle });
  renameModalManager.registerCloseButton(elements.closeRenameBtn);
  renameModalManager.registerCloseButton(elements.cancelRenameBtn);

  const deleteModalManager = new ModalManager(elements.deleteModal);
  deleteModalManager.registerCloseButton(elements.closeDeleteBtn);
  deleteModalManager.registerCloseButton(elements.cancelDeleteBtn);

  const languageSelectModalManager = new ModalManager(elements.languageSelectModal, { closeOnOverlayClick: false });
  const languageSelectChoice = createAsyncChoiceModal({
    manager: languageSelectModalManager,
    buttonsRoot: elements.languageSelectButtons,
    matchSelector: 'button[data-language]',
    getValue: (btn) => {
      const language = btn?.dataset?.language || '';
      if (!language || !Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, language)) return null;
      return language;
    }
  });

  function setNavigation(handlers) {
    navigation = { ...navigation, ...handlers };
  }

  async function loadBooks() {
    const localBooks = await getAllBooks();
    const user = await getSessionUser();

    if (!user) {
      booksLibrary = localBooks;
      return booksLibrary;
    }

    try {
      const remoteRows = await listUserEPUBs();
      const remoteBooks = (remoteRows || []).map((row) => ({
        id: row.id,
        title: row.title || '',
        cover: row.cover || null,
        language: row.language || 'en',
        chapterCount: typeof row.chapter_count === 'number' ? row.chapter_count : Number(row.chapter_count || 0),
        addedAt: row.created_at || row.added_at || row.updated_at || null,
        lastReadAt: row.last_read_at || row.updated_at || null,
        currentChapter: typeof row.current_chapter === 'number' ? row.current_chapter : Number(row.current_chapter || 0),
        storagePath: row.storage_path || null,
        storageUpdatedAt: row.file_updated_at || row.updated_at || null
      }));

      const localById = new Map(localBooks.map((b) => [b.id, b]));
      const remoteIds = new Set(remoteBooks.map((b) => b.id));

      const mergedRemote = remoteBooks.map((book) => ({
        ...book,
        isCached: localById.has(book.id)
      }));

      const localOnly = localBooks
        .filter((b) => !remoteIds.has(b.id))
        .map((b) => ({ ...b, localOnly: true, isCached: true }));

      booksLibrary = [...mergedRemote, ...localOnly];
    } catch (error) {
      console.warn('Failed to load remote books, falling back to local:', error);
      booksLibrary = localBooks;
    }
    return booksLibrary;
  }

  function getBooks() {
    return booksLibrary;
  }

  function getBooksRenderRoot() {
    if (!elements.booksContainer) return null;
    let root = elements.booksContainer.querySelector('#booksRenderRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'booksRenderRoot';
      elements.booksContainer.prepend(root);
    }
    return root;
  }

  function setBookshelfEmptyMessage({ hasAnyBooks }) {
    const titleEl = elements.emptyBookshelf?.querySelector?.('h2');
    const descEl = elements.emptyBookshelf?.querySelector?.('p');
    if (!titleEl || !descEl) return;

    if (!hasAnyBooks) {
      titleEl.textContent = '书架空空如也';
      descEl.textContent = '导入 EPUB 书籍开始您的阅读之旅';
      return;
    }

    titleEl.textContent = '该语言暂无书籍';
    descEl.textContent = '切换标签或导入该语言的 EPUB 书籍';
  }

  function renderLanguageTabs() {
    const counts = { en: 0, es: 0, ja: 0 };
    booksLibrary.forEach((book) => {
      const lang = book?.language;
      if (lang && Object.prototype.hasOwnProperty.call(counts, lang)) counts[lang] += 1;
    });

    const currentLanguageFilter = getLanguageFilter();
    const tabs = [
      { lang: 'en', el: elements.languageTabEn },
      { lang: 'es', el: elements.languageTabEs },
      { lang: 'ja', el: elements.languageTabJa }
    ];
    tabs.forEach(({ lang, el }) => {
      if (!el) return;
      const count = counts[lang] || 0;
      el.classList.toggle('active', lang === currentLanguageFilter);
      el.classList.toggle('is-empty', count === 0);
      el.setAttribute('aria-disabled', count === 0 ? 'true' : 'false');
      el.title = `${SUPPORTED_LANGUAGES[lang] || lang} (${count})`;
    });
  }

  function getInitials(title) {
    return (title || '').charAt(0).toUpperCase();
  }

  function getProgressPercent(book) {
    if (!book.chapterCount || book.chapterCount === 0) return 0;
    return ((book.currentChapter || 0) / book.chapterCount) * 100;
  }

  function getBookCoverHtml(book, mode) {
    const title = escapeHtml(book?.title || '');
    const placeholderClass = mode === 'grid' ? 'book-cover-placeholder' : 'book-list-cover-placeholder';
    if (book?.cover) return `<img src="${book.cover}" alt="${title}">`;
    return `<div class="${placeholderClass}">${getInitials(book?.title || '')}</div>`;
  }

  function renderBookItemHtml(book, mode, index) {
    if (!book) return '';
    const syncTag = book.localOnly
      ? `<span class="badge" style="margin-left: 6px;">本地</span>`
      : book.storagePath && !book.isCached
        ? `<span class="badge" style="margin-left: 6px;">云端</span>`
        : '';
    if (mode === 'grid') {
      return `
          <div class="book-card" data-book-id="${book.id}" style="animation-delay: ${index * 0.05}s">
              <div class="book-cover">
                  ${getBookCoverHtml(book, 'grid')}
                  <button class="book-menu-btn" data-book-id="${book.id}">⋮</button>
              </div>
              <div class="book-card-info">
                  <div class="book-card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}${syncTag}</div>
                  <div class="book-card-meta">${book.chapterCount} 章</div>
                  <div class="book-progress-bar">
                      <div class="book-progress-fill" style="width: ${getProgressPercent(book)}%"></div>
                  </div>
              </div>
          </div>
      `;
    }

    const progressPercent = getProgressPercent(book);
    return `
      <div class="book-list-item" data-book-id="${book.id}" style="animation-delay: ${index * 0.03}s">
          <div class="book-list-cover">
              ${getBookCoverHtml(book, 'list')}
          </div>
          <div class="book-list-info">
              <div class="book-list-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}${syncTag}</div>
              <div class="book-list-meta">
                  <span>${book.chapterCount} 章</span>
                  <span>•</span>
                  <span>阅读进度: ${Math.round(progressPercent)}%</span>
                  <div class="book-list-progress">
                      <div class="book-list-progress-fill" style="width: ${progressPercent}%"></div>
                  </div>
              </div>
          </div>
          <button class="book-list-menu-btn" data-book-id="${book.id}">⋮</button>
      </div>
    `;
  }

  function renderBooksTemplate(books, mode) {
    const container = getBooksRenderRoot();
    if (!container) return;

    const wrapperClass = mode === 'grid' ? 'books-grid' : 'books-list';
    container.innerHTML = `
        <div class="${wrapperClass}">
            ${(books || []).map((book, index) => renderBookItemHtml(book, mode, index)).join('')}
        </div>
    `;
  }

  function renderBookshelf() {
    renderLanguageTabs();
    void refreshBookshelfReviewButtons();

    const currentLanguageFilter = getLanguageFilter();
    const hasAnyBooks = booksLibrary.length > 0;
    const filteredBooks = booksLibrary.filter((book) => book?.language === currentLanguageFilter);
    const hasFiltered = filteredBooks.length > 0;

    setBookshelfEmptyMessage({ hasAnyBooks });
    elements.emptyBookshelf.style.display = !hasAnyBooks || !hasFiltered ? '' : 'none';

    if (!hasAnyBooks || !hasFiltered) {
      const root = getBooksRenderRoot();
      if (root) root.innerHTML = '';
      return;
    }

    elements.emptyBookshelf.style.display = 'none';
    renderBooksTemplate(filteredBooks, viewMode);
  }

  async function refreshBookshelf() {
    await loadBooks();
    renderBookshelf();
    void autoSyncIfNeeded({ reason: 'bookshelf' });
  }

  async function refreshBookshelfReviewButtons() {
    if (!elements.reviewButtonsContainer || !elements.reviewBtn) return;

    const now = new Date();
    const fsrsSettings = getFsrsSettings();
    const reviewMode = fsrsSettings?.reviewMode === 'mixed' ? 'mixed' : 'grouped';

    try {
      if (reviewMode === 'mixed') {
        const due = await countDueCards(now);
        elements.reviewButtonsContainer.innerHTML = '';
        elements.reviewBtn.style.display = '';
        elements.reviewBtn.disabled = due === 0;
        elements.reviewBtn.innerHTML = `<span class="icon">🗓️</span> 复习 (${due})`;

        if (elements.mobileReviewBtn) {
          elements.mobileReviewBtn.disabled = due === 0;
          if (elements.mobileReviewBadge) {
            elements.mobileReviewBadge.textContent = due > 0 ? due.toString() : '';
          }
        }
        return;
      }

      const [dueEn, dueEs, dueJa] = await Promise.all([
        countDueCardsByLanguage(now, 'en'),
        countDueCardsByLanguage(now, 'es'),
        countDueCardsByLanguage(now, 'ja')
      ]);

      const entries = [
        { lang: 'en', due: dueEn },
        { lang: 'es', due: dueEs },
        { lang: 'ja', due: dueJa }
      ].filter((it) => (it?.due || 0) > 0);

      elements.reviewBtn.style.display = 'none';

      const totalDue = entries.reduce((acc, curr) => acc + curr.due, 0);
      const currentLanguage = getLanguageFilter();
      const currentLanguageDue = entries.find((it) => it.lang === currentLanguage)?.due || 0;

      if (elements.mobileReviewBtn) {
        elements.mobileReviewBtn.disabled = totalDue === 0;
        if (elements.mobileReviewBadge) {
          elements.mobileReviewBadge.textContent = currentLanguageDue > 0 ? currentLanguageDue.toString() : '';
        }
      }

      if (entries.length === 0) {
        elements.reviewButtonsContainer.innerHTML = '';
        elements.reviewBtn.style.display = '';
        elements.reviewBtn.disabled = true;
        elements.reviewBtn.innerHTML = `<span class="icon">🗓️</span> 复习`;
        return;
      }

      elements.reviewButtonsContainer.innerHTML = entries
        .map(
          ({ lang, due }) => `
            <button class="btn btn-secondary" data-action="review-language" data-language="${lang}">
                <span class="icon">🗓️</span> 复习${escapeHtml(SUPPORTED_LANGUAGES[lang] || lang)} (${due})
            </button>
        `
        )
        .join('');

      elements.reviewButtonsContainer.querySelectorAll('button[data-action="review-language"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lang = btn.dataset.language || null;
          navigation.openReview(lang);
        });
      });
    } catch (error) {
      console.warn('Failed to refresh review buttons:', error);
    }
  }

  function setViewMode(mode) {
    viewMode = mode;
    elements.gridViewBtn.classList.toggle('active', mode === 'grid');
    elements.listViewBtn.classList.toggle('active', mode === 'list');
    renderBookshelf();
  }

  function showContextMenu(event, bookId) {
    contextMenuBookId = bookId;
    const menu = elements.bookContextMenu;

    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.classList.add('visible');

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

  function handleBookshelfBooksClick(event) {
    const menuBtn = event.target?.closest?.('.book-menu-btn, .book-list-menu-btn');
    if (menuBtn) {
      event.stopPropagation();
      const bookId = menuBtn.dataset.bookId;
      if (bookId) showContextMenu(event, bookId);
      return;
    }

    const card = event.target?.closest?.('[data-book-id]');
    if (!card || !elements.booksContainer?.contains?.(card)) return;
    const bookId = card.dataset.bookId;
    if (bookId) navigation.openBook(bookId);
  }

  function openRenameModal() {
    hideContextMenu();
    const book = booksLibrary.find((b) => b.id === contextMenuBookId);
    if (book) {
      elements.newBookTitle.value = book.title;
      renameModalManager.open();
    }
  }

  function closeRenameModal() {
    renameModalManager.close();
    contextMenuBookId = null;
  }

  async function handleRenameBook() {
    const newTitle = elements.newBookTitle.value.trim();
    if (!newTitle) {
      showNotification('请输入书名', 'error');
      return;
    }

    try {
      const book = booksLibrary.find((b) => b.id === contextMenuBookId) || null;
      const user = await getSessionUser();
      if (user && book?.storagePath) {
        await updateRemoteBook(contextMenuBookId, { title: newTitle });
      }
      await renameBookInDB(contextMenuBookId, newTitle);
      showNotification('重命名成功', 'success');
      closeRenameModal();
      await refreshBookshelf();
    } catch (error) {
      showNotification('重命名失败: ' + error.message, 'error');
    }
  }

  function openDeleteModal() {
    hideContextMenu();
    const book = booksLibrary.find((b) => b.id === contextMenuBookId);
    if (book) {
      elements.deleteConfirmText.textContent = `确定要删除《${book.title}》吗？此操作无法撤销。`;
      deleteModalManager.open();
    }
  }

  function closeDeleteModal() {
    deleteModalManager.close();
    contextMenuBookId = null;
  }

  async function handleDeleteBook() {
    try {
      const book = booksLibrary.find((b) => b.id === contextMenuBookId) || null;
      const user = await getSessionUser();
      let didShowLoading = false;
      if (user && book?.storagePath) {
        showLoading('正在删除云端书籍...');
        didShowLoading = true;
        const { deleteEPUB } = await import('../supabase/epub-service.js');
        await deleteEPUB(book.storagePath);
      }
      await deleteBookFromDB(contextMenuBookId);
      if (didShowLoading) hideLoading();
      showNotification('删除成功', 'success');
      closeDeleteModal();
      await refreshBookshelf();
    } catch (error) {
      hideLoading();
      showNotification('删除失败: ' + error.message, 'error');
    }
  }

  async function promptImportLanguage(file) {
    if (!elements.languageSelectModal) return 'en';
    const selected = await languageSelectChoice.prompt();
    return selected;
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (typeof window !== 'undefined' && typeof window.JSZip === 'undefined') {
        showNotification('导入失败：JSZip 未加载（请确保网络可访问 CDN，或将 JSZip 放到本地引用）', 'error');
        elements.fileInput.value = '';
        return;
      }

      const selectedLanguage = await promptImportLanguage(file);
      if (!selectedLanguage) {
        elements.fileInput.value = '';
        return;
      }

      showLoading('正在解析 EPUB...');

      const parsedBook = await parseEpub(file);
      const bookId = generateBookHash(parsedBook.title + parsedBook.chapters[0]?.content.substring(0, 100));

      const existingBook = await getBook(bookId);
      if (existingBook) {
        hideLoading();
        showNotification('这本书已经在书架中了', 'info');
        navigation.openBook(bookId);
        elements.fileInput.value = '';
        return;
      }

      await saveBook({
        id: bookId,
        title: parsedBook.title,
        cover: parsedBook.cover,
        chapters: parsedBook.chapters,
        chapterCount: parsedBook.chapters.length,
        currentChapter: 0,
        addedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
        language: selectedLanguage
      });

      const user = await getSessionUser();
      if (user) {
        try {
          showLoading('正在上传到云端...');
          const remote = await uploadEPUB(file, {
            bookId,
            title: parsedBook.title,
            cover: parsedBook.cover,
            language: selectedLanguage,
            chapterCount: parsedBook.chapters.length
          });
          await saveBook({
            id: bookId,
            title: parsedBook.title,
            cover: parsedBook.cover,
            chapters: parsedBook.chapters,
            chapterCount: parsedBook.chapters.length,
            currentChapter: 0,
            addedAt: new Date().toISOString(),
            lastReadAt: new Date().toISOString(),
            language: selectedLanguage,
            storagePath: remote?.storage_path || null,
            storageUpdatedAt: remote?.file_updated_at || remote?.updated_at || new Date().toISOString()
          });
        } catch (error) {
          console.warn('Failed to upload EPUB to Supabase:', error);
          showNotification('云端上传失败（已保留本地副本）: ' + (error?.message || String(error)), 'error');
        }
      }

      hideLoading();
      showNotification('书籍导入成功', 'success');
      elements.fileInput.value = '';

      await refreshBookshelf();
      navigation.openBook(bookId);
    } catch (error) {
      hideLoading();
      console.error('Failed to import file:', error);
      showNotification('导入失败: ' + error.message, 'error');
      elements.fileInput.value = '';
    }
  }

  function handleEscape() {
    renameModalManager.close();
    deleteModalManager.close();
    languageSelectChoice.close(null);
    hideContextMenu();
  }

  function init({ onOpenBook, onOpenReview, onOpenVocabLibrary, onToggleTheme }) {
    setNavigation({
      openBook: onOpenBook,
      openReview: onOpenReview,
      openVocabLibrary: onOpenVocabLibrary
    });

    elements.importBookBtn.addEventListener('click', () => elements.fileInput.click());
    elements.importBtnEmpty.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileImport);

    elements.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    elements.listViewBtn.addEventListener('click', () => setViewMode('list'));
    elements.booksContainer?.addEventListener('click', handleBookshelfBooksClick);

    elements.languageTabs?.addEventListener('click', (e) => {
      const target = e.target?.closest?.('.language-tab');
      const language = target?.dataset?.language || '';
      if (!language) return;
      setLanguageFilter(language);
      renderBookshelf();
    });

    elements.themeToggleBtnShelf?.addEventListener('click', onToggleTheme);
    elements.reviewBtn?.addEventListener('click', () => navigation.openReview(null));
    elements.mobileReviewBtn?.addEventListener('click', () => {
      const fsrsSettings = getFsrsSettings();
      const reviewMode = fsrsSettings?.reviewMode === 'mixed' ? 'mixed' : 'grouped';
      const language = reviewMode === 'grouped' ? getLanguageFilter() : null;
      navigation.openReview(language);
    });

    elements.vocabLibraryBtn?.addEventListener('click', onOpenVocabLibrary);

    elements.renameBookBtn.addEventListener('click', openRenameModal);
    elements.deleteBookBtn.addEventListener('click', openDeleteModal);
    elements.confirmRenameBtn.addEventListener('click', handleRenameBook);
    elements.confirmDeleteBtn.addEventListener('click', handleDeleteBook);

    document.addEventListener('click', hideContextMenu);

    elements.languageSelectModal?.addEventListener('click', (e) => {
      if (e.target === elements.languageSelectModal) languageSelectChoice.close(null);
    });
    elements.closeLanguageSelectBtn?.addEventListener('click', () => languageSelectChoice.close(null));
    elements.cancelLanguageSelectBtn?.addEventListener('click', () => languageSelectChoice.close(null));
  }

  return {
    init,
    loadBooks,
    renderBookshelf,
    refreshBookshelf,
    refreshBookshelfReviewButtons,
    getBooks,
    handleEscape
  };
}
