import { SUPPORTED_LANGUAGES } from '../storage.js';
import { countDueCards, deleteGlobalVocabItem, makeGlobalVocabId, upsertGlobalVocabItem } from '../db.js';
import { refreshGlobalVocabCache, globalVocabByWord } from '../core/global-vocab-cache.js';
import { ModalManager } from '../ui/modal-manager.js';
import { showNotification } from '../ui/notifications.js';
import { escapeHtml } from '../utils/html.js';

let vocabLibraryItems = [];
let editingVocabWord = null;
let deletingVocabWord = null;

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

  function setNavigation(handlers) {
    navigation = { ...navigation, ...handlers };
  }

  async function loadVocabLibrary() {
    try {
      await refreshGlobalVocabCache();

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

  function renderVocabLibrary() {
    if (!elements.vocabLibraryGrid || !elements.vocabLibraryEmpty || !elements.vocabStatsGrid) return;

    if (vocabLibraryItems.length === 0) {
      elements.vocabLibraryGrid.style.display = 'none';
      elements.vocabStatsGrid.style.display = 'none';
      elements.vocabLibraryEmpty.style.display = '';
      return;
    }

    elements.vocabLibraryEmpty.style.display = 'none';
    elements.vocabStatsGrid.style.display = '';
    elements.vocabLibraryGrid.style.display = '';

    elements.vocabLibraryGrid.innerHTML = `
      <div class="vocab-list-header">
        <span class="vocab-list-col-word">词汇</span>
        <span class="vocab-list-col-meaning">AI 释义</span>
        <span class="vocab-list-col-review">下次复习</span>
        <span class="vocab-list-col-actions">操作</span>
      </div>
      ${vocabLibraryItems
        .map((item) => {
          const word = item.displayWord || item.normalizedWord || item.id || '—';
          const language = item?.language || '';
          const globalId = item.id || makeGlobalVocabId(language, item.normalizedWord || item.id || '');
          const meaning = item.meaning || '—';
          const nextReview = formatNextReviewTime(item.due);
          const statusClass = getReviewStatusClass(item.due);

          return `
            <div class="vocab-list-item" data-word="${escapeHtml(globalId)}">
              <div class="vocab-list-col-word">
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
    `;
  }

  function handleVocabLibraryCardClick(event) {
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
      await deleteGlobalVocabItem(deletingVocabWord);
      globalVocabByWord.delete(deletingVocabWord);

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
  }

  function init({ onBackToBookshelf, onStartReview }) {
    setNavigation({ backToBookshelf: onBackToBookshelf, startReview: onStartReview });

    elements.backFromVocabLibraryBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.vocabLibraryBackBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.startReviewFromLibraryBtn?.addEventListener('click', () => navigation.startReview(null));
    elements.vocabLibraryGrid?.addEventListener('click', handleVocabLibraryCardClick);

    elements.saveEditVocabBtn?.addEventListener('click', handleSaveVocabEdit);
    elements.confirmDeleteVocabBtn?.addEventListener('click', handleConfirmDeleteVocab);
  }

  return {
    init,
    loadVocabLibrary,
    handleEscape
  };
}

