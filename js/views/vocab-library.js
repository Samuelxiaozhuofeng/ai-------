import { SUPPORTED_LANGUAGES } from '../storage.js';
import { countDueCards, deleteGlobalVocabItem, makeGlobalVocabId, upsertGlobalVocabItem } from '../db.js';
import { refreshGlobalVocabCache, globalVocabByWord } from '../core/global-vocab-cache.js';
import { ModalManager } from '../ui/modal-manager.js';
import { showNotification } from '../ui/notifications.js';
import { escapeHtml } from '../utils/html.js';

let vocabLibraryItems = [];
let editingVocabWord = null;
let deletingVocabWord = null;

const VOCAB_LIBRARY_VIEW_STATE_KEY = 'language-reader-vocab-library-view-state';

let currentPage = 1;
const itemsPerPage = 30;
let searchQuery = '';
let filterStatus = 'all'; // 'all' | 'overdue' | 'today' | 'future'
let filterLanguage = 'all'; // 'all' | 'en' | 'other'
/** @type {Set<string>} */
let selectedItems = new Set();

function loadPersistedVocabLibraryState() {
  try {
    const raw = localStorage.getItem(VOCAB_LIBRARY_VIEW_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    const page = Number(parsed?.currentPage);
    if (Number.isFinite(page) && page >= 1) currentPage = Math.floor(page);

    if (typeof parsed?.searchQuery === 'string') searchQuery = parsed.searchQuery;
    if (parsed?.filterStatus === 'all' || parsed?.filterStatus === 'overdue' || parsed?.filterStatus === 'today' || parsed?.filterStatus === 'future') {
      filterStatus = parsed.filterStatus;
    }
    if (parsed?.filterLanguage === 'all' || parsed?.filterLanguage === 'en' || parsed?.filterLanguage === 'other') {
      filterLanguage = parsed.filterLanguage;
    }
  } catch {
    // ignore
  }
}

function persistVocabLibraryState() {
  try {
    localStorage.setItem(
      VOCAB_LIBRARY_VIEW_STATE_KEY,
      JSON.stringify({ currentPage, searchQuery, filterStatus, filterLanguage })
    );
  } catch {
    // ignore
  }
}

/**
 * @param {any[]} allItems
 */
function filterVocabItems(allItems) {
  const query = (searchQuery || '').trim().toLowerCase();
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return allItems.filter((item) => {
    if (!item) return false;

    if (filterLanguage === 'en') {
      if (item.language !== 'en') return false;
    } else if (filterLanguage === 'other') {
      if (item.language === 'en') return false;
    }

    if (filterStatus !== 'all') {
      const due = item.due ? new Date(item.due) : null;
      if (!due || Number.isNaN(due.getTime())) return false;

      if (filterStatus === 'overdue') {
        if (due.getTime() > now.getTime()) return false;
      } else if (filterStatus === 'today') {
        if (due.getTime() <= now.getTime()) return false;
        if (due.getTime() > endOfToday.getTime()) return false;
      } else if (filterStatus === 'future') {
        if (due.getTime() <= endOfToday.getTime()) return false;
      }
    }

    if (!query) return true;

    const word = String(item.displayWord || item.normalizedWord || item.id || '').toLowerCase();
    const meaning = String(item.meaning || '').toLowerCase();
    return word.includes(query) || meaning.includes(query);
  });
}

/**
 * @param {any[]} filteredItems
 */
function getTotalPages(filteredItems) {
  const total = Array.isArray(filteredItems) ? filteredItems.length : 0;
  return Math.max(1, Math.ceil(total / itemsPerPage));
}

/**
 * @param {any[]} filteredItems
 */
function getPaginatedItems(filteredItems) {
  const start = (currentPage - 1) * itemsPerPage;
  return filteredItems.slice(start, start + itemsPerPage);
}

/**
 * @param {any} item
 */
function getItemGlobalId(item) {
  const language = item?.language || '';
  const normalizedWord = item?.normalizedWord || item?.id || '';
  return item?.id || makeGlobalVocabId(language, normalizedWord);
}

/** @type {{ backToBookshelf: () => void, startReview: (language?: string|null) => void }} */
let navigation = {
  backToBookshelf: () => { },
  startReview: () => { }
};

/**
 * @param {import('../ui/dom-refs.js').elements} elements
 */
export function createVocabLibraryController(elements) {
  const editVocabModalManager = new ModalManager(elements.editVocabModal);
  editVocabModalManager.registerCloseButton(elements.closeEditVocabBtn);
  editVocabModalManager.registerCloseButton(elements.cancelEditVocabBtn);

  const deleteVocabModalManager = new ModalManager(elements.deleteVocabModal);
  deleteVocabModalManager.registerCloseButton(elements.closeDeleteVocabBtn);
  deleteVocabModalManager.registerCloseButton(elements.cancelDeleteVocabBtn);

  const bulkDeleteVocabModalManager = new ModalManager(elements.bulkDeleteVocabModal);
  bulkDeleteVocabModalManager.registerCloseButton(elements.closeBulkDeleteVocabBtn);
  bulkDeleteVocabModalManager.registerCloseButton(elements.cancelBulkDeleteVocabBtn);

  /** @type {string[]} */
  let pendingBulkDeleteIds = [];

  function setNavigation(handlers) {
    navigation = { ...navigation, ...handlers };
  }

  async function loadVocabLibrary() {
    try {
      await refreshGlobalVocabCache();
      selectedItems.clear();

      vocabLibraryItems = Array.from(globalVocabByWord.values())
        .filter((item) => item?.status === 'learning')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

      const learningCount = vocabLibraryItems.length;
      const dueCount = await countDueCards(new Date());
      const totalReps = vocabLibraryItems.reduce((sum, item) => sum + (item.reps || 0), 0);

      if (elements.statLearningCount) elements.statLearningCount.textContent = String(learningCount);
      if (elements.statDueCount) elements.statDueCount.textContent = String(dueCount);
      if (elements.statTotalReps) elements.statTotalReps.textContent = String(totalReps);

      renderVocabLibrary();
    } catch (error) {
      console.error('Failed to load vocab library:', error);
      showNotification('加载词汇库失败: ' + error.message, 'error');
    }
  }

  /**
   * Format next review date relative to now
   * @param {string|null} dueDate - ISO date string
   * @returns {string} - Formatted string like "今天", "明天", "2天后" etc.
   */
  function formatNextReviewTime(dueDate) {
    if (!dueDate) return '—';

    const now = new Date();
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return '—';

    const diffMs = due.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Past due
    if (diffMs <= 0) {
      const overdueMinutes = Math.abs(diffMinutes);
      if (overdueMinutes < 60) return '已到期';
      const overdueHours = Math.abs(diffHours);
      if (overdueHours < 24) return `已过期${Math.floor(overdueHours)}小时`;
      const overdueDays = Math.abs(diffDays);
      if (overdueDays < 30) return `已过期${Math.floor(overdueDays)}天`;
      return '已过期';
    }

    // Future
    if (diffMinutes < 60) {
      return `${Math.ceil(diffMinutes)}分钟后`;
    }
    if (diffHours < 24) {
      const h = Math.floor(diffHours);
      return h === 0 ? '1小时后' : `${h}小时后`;
    }
    if (diffDays < 1.5) {
      return '明天';
    }
    if (diffDays < 30) {
      return `${Math.floor(diffDays)}天后`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}个月后`;
    }
    const years = (diffDays / 365).toFixed(1);
    return `${years}年后`;
  }

  /**
   * Get status class based on due date
   */
  function getReviewStatusClass(dueDate) {
    if (!dueDate) return '';
    const now = new Date();
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return '';

    const diffMs = due.getTime() - now.getTime();
    if (diffMs <= 0) return 'review-overdue';
    if (diffMs <= 24 * 60 * 60 * 1000) return 'review-today';
    return 'review-future';
  }

  function getFilteredItemsSnapshot() {
    const filteredItems = filterVocabItems(vocabLibraryItems);
    const totalPages = getTotalPages(filteredItems);

    const nextPage = Math.min(Math.max(1, currentPage), totalPages);
    if (nextPage !== currentPage) {
      currentPage = nextPage;
      selectedItems.clear();
      persistVocabLibraryState();
    }

    const pageItems = filteredItems.length ? getPaginatedItems(filteredItems) : [];

    return { filteredItems, pageItems, totalPages };
  }

  /**
   * @param {{filteredCount: number, pageItems: any[], totalPages: number}} snapshot
   */
  function updateVocabLibraryControls(snapshot) {
    const totalCount = vocabLibraryItems.length;
    const filteredCount = snapshot.filteredCount;
    const pageItems = snapshot.pageItems;
    const totalPages = snapshot.totalPages;
    const selectedCount = selectedItems.size;

    if (elements.vocabLibraryControls) elements.vocabLibraryControls.style.display = '';

    if (elements.vocabLibraryResultCount) {
      elements.vocabLibraryResultCount.textContent = `结果: ${filteredCount} / ${totalCount}`;
    }

    const start = filteredCount ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const end = filteredCount ? start + pageItems.length - 1 : 0;
    if (elements.vocabLibraryPageInfo) {
      elements.vocabLibraryPageInfo.textContent = `第 ${currentPage} / ${totalPages} 页 · 显示 ${start}-${end}`;
    }

    if (elements.vocabLibrarySelectedCount) {
      elements.vocabLibrarySelectedCount.textContent = selectedCount ? `已选中: ${selectedCount}` : '未选择';
    }

    const allSelectedOnPage = pageItems.length > 0 && pageItems.every((item) => selectedItems.has(getItemGlobalId(item)));
    if (elements.vocabLibrarySelectAllBtn) {
      elements.vocabLibrarySelectAllBtn.disabled = pageItems.length === 0;
      elements.vocabLibrarySelectAllBtn.textContent = allSelectedOnPage ? '取消全选' : '全选本页';
    }

    if (elements.vocabLibraryBulkDeleteBtn) {
      elements.vocabLibraryBulkDeleteBtn.style.display = selectedCount > 0 ? '' : 'none';
    }
  }

  /**
   * @param {number} totalPages
   */
  function getPaginationTokens(totalPages) {
    if (totalPages <= 1) return [];

    const tokenSet = new Set([
      1,
      totalPages,
      currentPage,
      currentPage - 1,
      currentPage + 1,
      currentPage - 2,
      currentPage + 2
    ]);

    const pages = Array.from(tokenSet)
      .filter((p) => Number.isFinite(p) && p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);

    /** @type {(number|'ellipsis')[]} */
    const tokens = [];
    let prev = 0;
    for (const p of pages) {
      if (prev && p - prev > 1) tokens.push('ellipsis');
      tokens.push(p);
      prev = p;
    }

    return tokens;
  }

  /**
   * @param {number} totalPages
   */
  function renderPagination(totalPages) {
    if (totalPages <= 1) return '';

    const tokens = getPaginationTokens(totalPages);
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;

    return `
      <div class="vocab-pagination" data-role="pagination">
        <button class="btn btn-ghost btn-small" data-page="${currentPage - 1}" ${prevDisabled ? 'disabled' : ''}>上一页</button>
        ${tokens
          .map((token) => {
            if (token === 'ellipsis') {
              return `<span class="vocab-pagination-ellipsis">…</span>`;
            }
            const isActive = token === currentPage;
            return `<button class="btn btn-ghost btn-small vocab-page-btn ${isActive ? 'is-active' : ''}" data-page="${token}" ${isActive ? 'disabled' : ''}>${token}</button>`;
          })
          .join('')}
        <button class="btn btn-ghost btn-small" data-page="${currentPage + 1}" ${nextDisabled ? 'disabled' : ''}>下一页</button>
      </div>
    `;
  }

  function renderVocabLibrary() {
    if (!elements.vocabLibraryGrid || !elements.vocabLibraryEmpty || !elements.vocabStatsGrid) return;

    if (vocabLibraryItems.length === 0) {
      elements.vocabLibraryGrid.style.display = 'none';
      elements.vocabStatsGrid.style.display = 'none';
      if (elements.vocabLibraryControls) elements.vocabLibraryControls.style.display = 'none';
      elements.vocabLibraryEmpty.style.display = '';
      return;
    }

    elements.vocabLibraryEmpty.style.display = 'none';
    elements.vocabStatsGrid.style.display = '';
    elements.vocabLibraryGrid.style.display = '';

    const { filteredItems, pageItems, totalPages } = getFilteredItemsSnapshot();
    const filteredCount = filteredItems.length;
    updateVocabLibraryControls({ filteredCount, pageItems, totalPages });

    elements.vocabLibraryGrid.innerHTML = `
      <div class="vocab-list-header">
        <span class="vocab-list-col-word">词汇</span>
        <span class="vocab-list-col-meaning">AI 释义</span>
        <span class="vocab-list-col-review">下次复习</span>
        <span class="vocab-list-col-actions">操作</span>
      </div>
      ${filteredCount === 0
        ? `<div class="vocab-library-no-results">没有匹配的词汇</div>`
        : pageItems
          .map((item) => {
            const globalId = getItemGlobalId(item);
            const word = item.displayWord || item.normalizedWord || globalId || '—';
            const language = item?.language || '';
            const meaning = item.meaning || '—';
            const nextReview = formatNextReviewTime(item.due);
            const statusClass = getReviewStatusClass(item.due);
            const isSelected = selectedItems.has(globalId);

            return `
              <div class="vocab-list-item" data-word="${escapeHtml(globalId)}">
                <div class="vocab-list-col-word">
                  <input
                    type="checkbox"
                    class="vocab-select-checkbox"
                    data-select-id="${escapeHtml(globalId)}"
                    ${isSelected ? 'checked' : ''}
                    aria-label="选择词汇"
                  />
                  <span class="vocab-word-text">${escapeHtml(word)}</span>
                  ${language
              ? `<span class="vocab-language-badge">${escapeHtml(
                SUPPORTED_LANGUAGES[language] || language
              )}</span>`
              : ''
            }
                </div>
                <div class="vocab-list-col-meaning">
                  <span class="vocab-meaning-text">${escapeHtml(meaning)}</span>
                </div>
                <div class="vocab-list-col-review">
                  <span class="vocab-review-time ${statusClass}">${nextReview}</span>
                </div>
                <div class="vocab-list-col-actions">
                  <button class="btn btn-ghost btn-icon" data-action="edit" data-word="${escapeHtml(globalId)}" title="编辑">
                    <span class="icon">✏️</span>
                  </button>
                  <button class="btn btn-ghost btn-icon btn-danger-hover" data-action="delete" data-word="${escapeHtml(globalId)}" title="删除">
                    <span class="icon">🗑️</span>
                  </button>
                </div>
              </div>
            `;
          })
          .join('')}
      ${renderPagination(totalPages)}
    `;
  }

  function handleVocabLibraryCardClick(event) {
    const pageBtn = event.target?.closest?.('[data-page]');
    if (pageBtn) {
      const next = Number(pageBtn.dataset.page);
      if (!Number.isFinite(next)) return;
      handlePageChange(next);
      return;
    }

    const btn = event.target?.closest?.('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const word = btn.dataset.word;

    if (action === 'edit' && word) {
      openEditVocabModal(word);
    } else if (action === 'delete' && word) {
      openDeleteVocabModal(word);
    }
  }

  /**
   * @param {Set<string>} removedIds
   */
  function adjustCurrentPageForRemoval(removedIds) {
    if (!removedIds || removedIds.size === 0) return;
    const remaining = vocabLibraryItems.filter((item) => !removedIds.has(getItemGlobalId(item)));
    const filteredRemaining = filterVocabItems(remaining);
    const totalPages = getTotalPages(filteredRemaining);

    if (currentPage > totalPages) {
      currentPage = totalPages;
      persistVocabLibraryState();
    }
  }

  function handlePageChange(page) {
    const filteredItems = filterVocabItems(vocabLibraryItems);
    const totalPages = getTotalPages(filteredItems);
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (nextPage === currentPage) return;

    currentPage = nextPage;
    selectedItems.clear();
    persistVocabLibraryState();
    renderVocabLibrary();
  }

  function handleSearch() {
    searchQuery = elements.vocabLibrarySearchInput?.value ?? '';
    currentPage = 1;
    selectedItems.clear();
    persistVocabLibraryState();
    renderVocabLibrary();
  }

  function handleFilterChange() {
    const nextStatus = elements.vocabLibraryFilterStatus?.value;
    const nextLang = elements.vocabLibraryFilterLanguage?.value;

    if (nextStatus === 'all' || nextStatus === 'overdue' || nextStatus === 'today' || nextStatus === 'future') {
      filterStatus = nextStatus;
    } else {
      filterStatus = 'all';
    }

    if (nextLang === 'all' || nextLang === 'en' || nextLang === 'other') {
      filterLanguage = nextLang;
    } else {
      filterLanguage = 'all';
    }

    currentPage = 1;
    selectedItems.clear();
    persistVocabLibraryState();
    renderVocabLibrary();
  }

  function handleSelectAllToggle() {
    const { filteredItems, pageItems, totalPages } = getFilteredItemsSnapshot();
    if (pageItems.length === 0) return;

    const pageIds = pageItems.map((item) => getItemGlobalId(item));
    const allSelected = pageIds.every((id) => selectedItems.has(id));

    if (allSelected) {
      pageIds.forEach((id) => selectedItems.delete(id));
    } else {
      pageIds.forEach((id) => selectedItems.add(id));
    }

    if (elements.vocabLibraryGrid) {
      const checkboxes = elements.vocabLibraryGrid.querySelectorAll('.vocab-select-checkbox');
      checkboxes.forEach((checkbox) => {
        const id = checkbox.getAttribute('data-select-id') || '';
        checkbox.checked = selectedItems.has(id);
      });
    }

    updateVocabLibraryControls({ filteredCount: filteredItems.length, pageItems, totalPages });
  }

  function handleVocabLibraryGridChange(event) {
    const checkbox = event.target?.closest?.('.vocab-select-checkbox');
    if (!checkbox) return;

    const id = checkbox.getAttribute('data-select-id') || '';
    if (!id) return;

    if (checkbox.checked) {
      selectedItems.add(id);
    } else {
      selectedItems.delete(id);
    }

    const { filteredItems, pageItems, totalPages } = getFilteredItemsSnapshot();
    updateVocabLibraryControls({ filteredCount: filteredItems.length, pageItems, totalPages });
  }

  function openBulkDeleteVocabModal() {
    const ids = Array.from(selectedItems);
    if (ids.length === 0) return;

    pendingBulkDeleteIds = ids;

    if (elements.bulkDeleteVocabConfirmText) {
      elements.bulkDeleteVocabConfirmText.textContent = `确定要删除选中的 ${ids.length} 个词汇吗？此操作无法撤销。`;
    }

    if (elements.bulkDeleteVocabPreviewList) {
      const preview = ids.slice(0, 10).map((id) => {
        const item = globalVocabByWord.get(id);
        return item?.displayWord || item?.normalizedWord || id;
      });
      const remaining = Math.max(0, ids.length - preview.length);

      elements.bulkDeleteVocabPreviewList.innerHTML = `
        ${preview.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
        ${remaining ? `<li class="bulk-delete-more">…以及其他 ${remaining} 个</li>` : ''}
      `;
    }

    bulkDeleteVocabModalManager.open();
  }

  function closeBulkDeleteVocabModal() {
    bulkDeleteVocabModalManager.close();
    pendingBulkDeleteIds = [];
  }

  async function handleConfirmBulkDeleteVocab() {
    const ids = pendingBulkDeleteIds.length ? pendingBulkDeleteIds : Array.from(selectedItems);
    if (ids.length === 0) {
      closeBulkDeleteVocabModal();
      return;
    }

    const confirmBtn = elements.confirmBulkDeleteVocabBtn;
    const originalText = confirmBtn?.textContent || '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '删除中...';
    }

    try {
      const results = await Promise.allSettled(ids.map((id) => deleteGlobalVocabItem(id)));
      /** @type {string[]} */
      const okIds = [];
      /** @type {string[]} */
      const failedIds = [];

      results.forEach((result, index) => {
        const id = ids[index];
        if (result.status === 'fulfilled') okIds.push(id);
        else failedIds.push(id);
      });

      okIds.forEach((id) => {
        globalVocabByWord.delete(id);
        selectedItems.delete(id);
      });

      if (okIds.length) {
        adjustCurrentPageForRemoval(new Set(okIds));
      }

      closeBulkDeleteVocabModal();
      selectedItems.clear();

      if (failedIds.length === 0) {
        showNotification(`已删除 ${okIds.length} 个词汇`, 'success');
      } else if (okIds.length === 0) {
        showNotification(`删除失败（${failedIds.length} 个词汇）`, 'error');
      } else {
        showNotification(`删除完成：成功 ${okIds.length}，失败 ${failedIds.length}`, 'error');
      }

      await loadVocabLibrary();
    } catch (error) {
      console.error('Failed to bulk delete vocab:', error);
      showNotification('删除失败: ' + error.message, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText || '删除';
      }
    }
  }

  function openEditVocabModal(globalId) {
    const item = globalVocabByWord.get(globalId);
    if (!item) return;

    editingVocabWord = globalId;

    if (elements.editVocabWord) elements.editVocabWord.value = item.displayWord || item.normalizedWord || globalId;
    if (elements.editVocabMeaning) elements.editVocabMeaning.value = item.meaning || '';
    if (elements.editVocabUsage) elements.editVocabUsage.value = item.usage || '';
    if (elements.editVocabContext) elements.editVocabContext.value = item.contextSentence || '';
    if (elements.editVocabContextualMeaning)
      elements.editVocabContextualMeaning.value = item.contextualMeaning || '';

    editVocabModalManager.open();
  }

  function closeEditVocabModal() {
    editVocabModalManager.close();
    editingVocabWord = null;
  }

  async function handleSaveVocabEdit() {
    if (!editingVocabWord) return;

    const item = globalVocabByWord.get(editingVocabWord);
    if (!item) {
      closeEditVocabModal();
      return;
    }

    try {
      const updatedItem = {
        ...item,
        meaning: elements.editVocabMeaning?.value?.trim() || item.meaning,
        usage: elements.editVocabUsage?.value?.trim() || item.usage,
        contextSentence: elements.editVocabContext?.value?.trim() || item.contextSentence,
        contextualMeaning: elements.editVocabContextualMeaning?.value?.trim() || item.contextualMeaning,
        updatedAt: new Date().toISOString()
      };

      await upsertGlobalVocabItem(updatedItem);
      globalVocabByWord.set(updatedItem.id || editingVocabWord, updatedItem);

      showNotification('词汇已更新', 'success');
      closeEditVocabModal();
      await loadVocabLibrary();
    } catch (error) {
      console.error('Failed to save vocab edit:', error);
      showNotification('保存失败: ' + error.message, 'error');
    }
  }

  function openDeleteVocabModal(globalId) {
    const item = globalVocabByWord.get(globalId);
    if (!item) return;

    deletingVocabWord = globalId;
    const displayWord = item.displayWord || item.normalizedWord || globalId;

    if (elements.deleteVocabConfirmText) {
      elements.deleteVocabConfirmText.textContent = `确定要删除「${displayWord}」吗？此操作无法撤销。`;
    }

    deleteVocabModalManager.open();
  }

  function closeDeleteVocabModal() {
    deleteVocabModalManager.close();
    deletingVocabWord = null;
  }

  async function handleConfirmDeleteVocab() {
    if (!deletingVocabWord) return;

    try {
      const removedId = deletingVocabWord;
      await deleteGlobalVocabItem(removedId);
      globalVocabByWord.delete(removedId);
      selectedItems.delete(removedId);
      adjustCurrentPageForRemoval(new Set([removedId]));

      showNotification('词汇已删除', 'success');
      closeDeleteVocabModal();
      await loadVocabLibrary();
    } catch (error) {
      console.error('Failed to delete vocab:', error);
      showNotification('删除失败: ' + error.message, 'error');
    }
  }

  function handleEscape() {
    editVocabModalManager.close();
    deleteVocabModalManager.close();
    closeBulkDeleteVocabModal();
  }

  function init({ onBackToBookshelf, onStartReview }) {
    setNavigation({ backToBookshelf: onBackToBookshelf, startReview: onStartReview });

    loadPersistedVocabLibraryState();
    if (elements.vocabLibrarySearchInput) elements.vocabLibrarySearchInput.value = searchQuery;
    if (elements.vocabLibraryFilterStatus) elements.vocabLibraryFilterStatus.value = filterStatus;
    if (elements.vocabLibraryFilterLanguage) elements.vocabLibraryFilterLanguage.value = filterLanguage;

    elements.backFromVocabLibraryBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.vocabLibraryBackBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.startReviewFromLibraryBtn?.addEventListener('click', () => navigation.startReview(null));
    elements.vocabLibraryGrid?.addEventListener('click', handleVocabLibraryCardClick);
    elements.vocabLibraryGrid?.addEventListener('change', handleVocabLibraryGridChange);

    elements.vocabLibrarySearchInput?.addEventListener('input', handleSearch);
    elements.vocabLibraryFilterStatus?.addEventListener('change', handleFilterChange);
    elements.vocabLibraryFilterLanguage?.addEventListener('change', handleFilterChange);
    elements.vocabLibrarySelectAllBtn?.addEventListener('click', handleSelectAllToggle);
    elements.vocabLibraryBulkDeleteBtn?.addEventListener('click', openBulkDeleteVocabModal);

    elements.saveEditVocabBtn?.addEventListener('click', handleSaveVocabEdit);
    elements.confirmDeleteVocabBtn?.addEventListener('click', handleConfirmDeleteVocab);
    elements.confirmBulkDeleteVocabBtn?.addEventListener('click', handleConfirmBulkDeleteVocab);

    elements.closeBulkDeleteVocabBtn?.addEventListener('click', () => {
      pendingBulkDeleteIds = [];
    });
    elements.cancelBulkDeleteVocabBtn?.addEventListener('click', () => {
      pendingBulkDeleteIds = [];
    });
    elements.bulkDeleteVocabModal?.addEventListener('click', (event) => {
      if (event.target === elements.bulkDeleteVocabModal) pendingBulkDeleteIds = [];
    });
  }

  return {
    init,
    loadVocabLibrary,
    handleEscape
  };
}
