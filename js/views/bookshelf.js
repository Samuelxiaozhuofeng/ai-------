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
/** @type {Map<string, any>} */
let booksById = new Map();
/** @type {Array<string>} */
let stableOrderIds = [];
let loadSeq = 0;
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

  function scheduleIdle(fn, timeoutMs = 900) {
    if (typeof window === 'undefined') return setTimeout(fn, 0);
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(fn, { timeout: timeoutMs });
    }
    return setTimeout(fn, Math.min(250, timeoutMs));
  }

  function normalizeRemoteRow(row) {
    return {
      id: row.id,
      title: row.title || '',
      cover: row.cover || null,
      language: row.language || 'en',
      chapterCount: typeof row.chapter_count === 'number' ? row.chapter_count : Number(row.chapter_count || 0),
      addedAt: row.created_at || row.added_at || row.updated_at || null,
      lastReadAt: row.last_read_at || row.updated_at || null,
      currentChapter: typeof row.current_chapter === 'number' ? row.current_chapter : Number(row.current_chapter || 0),
      storagePath: row.storage_path || null,
      storageUpdatedAt: row.file_updated_at || row.updated_at || null,
      updatedAt: row.updated_at || null
    };
  }

  function getTimeKey(book) {
    return String(book?.lastReadAt || book?.updatedAt || book?.addedAt || '');
  }

  function stableSort(nextBooks, prevIds) {
    const prevIndex = new Map((prevIds || []).map((id, idx) => [id, idx]));
    return (nextBooks || []).slice().sort((a, b) => {
      const ta = getTimeKey(a);
      const tb = getTimeKey(b);
      if (ta !== tb) return ta > tb ? -1 : 1;
      const ia = prevIndex.has(a.id) ? prevIndex.get(a.id) : Number.POSITIVE_INFINITY;
      const ib = prevIndex.has(b.id) ? prevIndex.get(b.id) : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function computeSyncTag(book) {
    if (book.localOnly) return `<span class="badge" style="margin-left: 6px;">本地</span>`;
    if (book.storagePath && !book.isCached) return `<span class="badge" style="margin-left: 6px;">云端</span>`;
    return '';
  }

  function updateBookNode(el, book, mode) {
    if (!el || !book) return;
    const renderKey = [
      book.title || '',
      book.cover || '',
      String(book.currentChapter || 0),
      String(book.lastReadAt || ''),
      String(book.chapterCount || 0),
      book.localOnly ? '1' : '0',
      book.isCached ? '1' : '0'
    ].join('|');
    if (el.dataset.renderKey === renderKey) return;
    el.dataset.renderKey = renderKey;

    const titleHtml = `${escapeHtml(book.title || '')}${computeSyncTag(book)}`;
    const progressPercent = getProgressPercent(book);

    if (mode === 'grid') {
      const cover = el.querySelector('.book-cover');
      if (cover) {
        cover.innerHTML = `
          ${getBookCoverHtml(book, 'grid')}
          <button class="book-menu-btn" data-book-id="${book.id}">⋮</button>
        `;
      }
      const titleEl = el.querySelector('.book-card-title');
      if (titleEl) {
        titleEl.innerHTML = titleHtml;
        titleEl.title = book.title || '';
      }
      const metaEl = el.querySelector('.book-card-meta');
      if (metaEl) metaEl.textContent = `${book.chapterCount || 0} 章`;
      const fillEl = el.querySelector('.book-progress-fill');
      if (fillEl) fillEl.style.width = `${progressPercent}%`;
      return;
    }

    const cover = el.querySelector('.book-list-cover');
    if (cover) cover.innerHTML = getBookCoverHtml(book, 'list');
    const titleEl = el.querySelector('.book-list-title');
    if (titleEl) {
      titleEl.innerHTML = titleHtml;
      titleEl.title = book.title || '';
    }
    const metaEl = el.querySelector('.book-list-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${book.chapterCount || 0} 章</span>
        <span>•</span>
        <span>阅读进度: ${Math.round(progressPercent)}%</span>
        <div class="book-list-progress">
          <div class="book-list-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      `;
    } else {
      const fillEl = el.querySelector('.book-list-progress-fill');
      if (fillEl) fillEl.style.width = `${progressPercent}%`;
    }
    const menuBtn = el.querySelector('.book-list-menu-btn');
    if (menuBtn) menuBtn.dataset.bookId = book.id;
  }

  function ensureBooksWrapper(mode) {
    const container = getBooksRenderRoot();
    if (!container) return null;

    const wrapperClass = mode === 'grid' ? 'books-grid' : 'books-list';
    const existing = container.firstElementChild;
    if (existing && (existing.classList.contains('books-grid') || existing.classList.contains('books-list')) && existing.classList.contains(wrapperClass)) {
      return existing;
    }

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = wrapperClass;
    container.appendChild(wrapper);
    return wrapper;
  }

  function createBookNode(book, mode, index) {
    const html = renderBookItemHtml(book, mode, index);
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    const el = tmp.firstElementChild;
    if (el) {
      const renderKey = [
        book.title || '',
        book.cover || '',
        String(book.currentChapter || 0),
        String(book.lastReadAt || ''),
        String(book.chapterCount || 0),
        book.localOnly ? '1' : '0',
        book.isCached ? '1' : '0'
      ].join('|');
      el.dataset.renderKey = renderKey;
    }
    return el;
  }

  function renderPatch(books, mode) {
    const wrapper = ensureBooksWrapper(mode);
    if (!wrapper) return;

    const ids = (books || []).map((b) => b.id).filter(Boolean);
    const idSet = new Set(ids);

    /** @type {Map<string, Element>} */
    const existingById = new Map();
    wrapper.querySelectorAll('[data-book-id]').forEach((el) => {
      const id = el.dataset.bookId;
      if (id) existingById.set(id, el);
      if (id && !idSet.has(id)) {
        el.remove();
        existingById.delete(id);
      }
    });

    ids.forEach((id, index) => {
      const book = booksById.get(id);
      if (!book) return;
      let el = existingById.get(id) || null;
      if (!el) {
        el = createBookNode(book, mode, index);
        if (el) {
          wrapper.appendChild(el);
          existingById.set(id, el);
        }
      } else {
        updateBookNode(el, book, mode);
      }
    });

    ids.forEach((id) => {
      const el = existingById.get(id) || null;
      if (el) wrapper.appendChild(el);
    });
  }

  function applyBooksSnapshot(books, { remoteIds = null, localIdSet = null } = {}) {
    /** @type {Set<string>} */
    const changedIds = new Set();

    for (const incoming of books || []) {
      if (!incoming?.id) continue;
      const id = incoming.id;
      const prev = booksById.get(id) || null;
      const next = prev ? { ...prev, ...incoming } : { ...incoming };

      const prevLastReadAt = prev?.lastReadAt || '';
      const nextLastReadAt = incoming?.lastReadAt || '';
      if (prev && prevLastReadAt && nextLastReadAt && String(prevLastReadAt) > String(nextLastReadAt)) {
        next.lastReadAt = prev.lastReadAt;
        next.currentChapter = prev.currentChapter;
      }

      if (localIdSet) next.isCached = localIdSet.has(id);

      const prevKey = prev ? JSON.stringify({ t: prev.title, c: prev.cover, ch: prev.currentChapter, lr: prev.lastReadAt, cc: prev.chapterCount, lo: prev.localOnly, ic: prev.isCached }) : '';
      const nextKey = JSON.stringify({ t: next.title, c: next.cover, ch: next.currentChapter, lr: next.lastReadAt, cc: next.chapterCount, lo: next.localOnly, ic: next.isCached });
      if (!prev || prevKey !== nextKey) changedIds.add(id);
      booksById.set(id, next);
    }

    if (remoteIds) {
      const remoteSet = new Set(remoteIds);
      for (const [id, book] of booksById.entries()) {
        if (book?.isCached && !remoteSet.has(id)) {
          if (!book.localOnly) {
            booksById.set(id, { ...book, localOnly: true });
            changedIds.add(id);
          }
        } else if (book?.localOnly && remoteSet.has(id)) {
          booksById.set(id, { ...book, localOnly: false });
          changedIds.add(id);
        }
      }
    }

    const nextAll = stableSort(Array.from(booksById.values()), stableOrderIds);
    stableOrderIds = nextAll.map((b) => b.id);
    booksLibrary = nextAll;
    return changedIds;
  }

  async function loadBooks() {
    booksById = new Map();
    stableOrderIds = [];
    booksLibrary = [];

    const localBooks = await getAllBooks();
    const normalized = (localBooks || []).map((b) => ({ ...b, isCached: true }));
    applyBooksSnapshot(normalized);

    const seq = ++loadSeq;
    scheduleIdle(() => {
      void revalidateRemoteBooks(seq);
    });

    return booksLibrary;
  }

  async function revalidateRemoteBooks(seq) {
    const user = await getSessionUser();
    if (!user) return;
    if (seq !== loadSeq) return;

    const localBooks = await getAllBooks().catch(() => []);
    const localIdSet = new Set((localBooks || []).map((b) => b.id));

    try {
      const remoteRows = await listUserEPUBs();
      if (seq !== loadSeq) return;

      const remoteBooks = (remoteRows || []).map(normalizeRemoteRow);
      const remoteIds = remoteBooks.map((b) => b.id);

      const mergedRemote = remoteBooks.map((b) => {
        const existing = booksById.get(b.id) || null;
        const merged = existing ? { ...existing, ...b } : { ...b };
        merged.isCached = localIdSet.has(b.id);

        const localLastReadAt = existing?.lastReadAt || '';
        const remoteLastReadAt = b?.lastReadAt || '';
        if (existing && localLastReadAt && remoteLastReadAt && String(localLastReadAt) > String(remoteLastReadAt)) {
          merged.lastReadAt = existing.lastReadAt;
          merged.currentChapter = existing.currentChapter;
        }
        merged.localOnly = false;
        return merged;
      });

      applyBooksSnapshot(mergedRemote, { remoteIds, localIdSet });
      renderBookshelf({ isPatchOnly: true });
    } catch (error) {
      console.warn('Failed to revalidate remote books:', error);
    }
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
    renderPatch(books, mode);
  }

  function renderBookshelf({ isPatchOnly = false } = {}) {
    renderLanguageTabs();
    if (isPatchOnly) {
      scheduleIdle(() => void refreshBookshelfReviewButtons(), 1200);
    } else {
      void refreshBookshelfReviewButtons();
    }

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

    if (!isPatchOnly) {
      scheduleIdle(() => {
        void autoSyncIfNeeded({ reason: 'bookshelf' })
          .then(async () => {
            const nextLocal = await getAllBooks().catch(() => []);
            applyBooksSnapshot((nextLocal || []).map((b) => ({ ...b, isCached: true })));
            renderBookshelf({ isPatchOnly: true });
          })
          .catch((error) => {
            console.warn('Background sync failed:', error);
          });
      });
    }
  }

  async function refreshBookshelf() {
    await loadBooks();
    renderBookshelf();
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
