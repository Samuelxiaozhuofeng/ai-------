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
  backToBookshelf: () => {},
  startReview: () => {}
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

    elements.vocabLibraryGrid.innerHTML = vocabLibraryItems
      .map((item) => {
        const word = item.displayWord || item.normalizedWord || item.id || '—';
        const language = item?.language || '';
        const globalId = item.id || makeGlobalVocabId(language, item.normalizedWord || item.id || '');
        const meaning = item.meaning || '—';
        const usage = item.usage || '';
        const context = item.contextSentence || '';

        return `
            <div class="vocab-library-card" data-word="${escapeHtml(globalId)}">
                <div class="vocab-library-card-header">
                    <div class="vocab-library-title">
                        <span class="vocab-library-word">${escapeHtml(word)}</span>
                        ${
                          language
                            ? `<span class="vocab-language-badge">${escapeHtml(
                                SUPPORTED_LANGUAGES[language] || language
                              )}</span>`
                            : ''
                        }
                    </div>
                    <div class="vocab-library-card-actions">
                        <button class="btn btn-ghost" data-action="edit" data-word="${escapeHtml(globalId)}" title="编辑">✏️</button>
                        <button class="btn btn-ghost" data-action="delete" data-word="${escapeHtml(globalId)}" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="vocab-library-card-body">
                    <div class="vocab-library-row">
                        <span class="vocab-library-label">含义</span>
                        <span class="vocab-library-value">${escapeHtml(meaning)}</span>
                    </div>
                    ${
                      usage
                        ? `
                    <div class="vocab-library-row">
                        <span class="vocab-library-label">用法</span>
                        <span class="vocab-library-value">${escapeHtml(usage)}</span>
                    </div>
                    `
                        : ''
                    }
                    ${
                      context
                        ? `
                    <div class="vocab-library-row">
                        <span class="vocab-library-label">上下文</span>
                        <span class="vocab-library-value">${escapeHtml(context)}</span>
                    </div>
                    `
                        : ''
                    }
                </div>
            </div>
        `;
      })
      .join('');
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

