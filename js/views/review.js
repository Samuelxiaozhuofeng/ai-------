import { SUPPORTED_LANGUAGES, getFsrsSettings } from '../storage.js';
import { getLanguageFilter } from '../core/language-filter.js';
import { globalVocabByWord, refreshGlobalVocabCache } from '../core/global-vocab-cache.js';
import { getReviewStats, previewNextIntervals, reviewCard } from '../srs-service.js';
import { deleteGlobalVocabItem, listDueCards, listDueCardsByLanguage, makeGlobalVocabId } from '../db.js';
import { ModalManager } from '../ui/modal-manager.js';
import { showNotification } from '../ui/notifications.js';
import { hideReviewLoading, showReviewLoading } from '../ui/loading.js';

let currentReviewLanguage = null; // null for mixed mode
let reviewQueue = [];
let reviewIndex = 0;
let currentReviewItem = null;
let isReviewAnswerShown = false;
const preloadedIntervals = new Map();
let reviewSessionStartAt = 0;
let hasLoggedFirstCard = false;

/** @type {{ backToBookshelf: () => void }} */
let navigation = {
  backToBookshelf: () => { }
};

/**
 * @param {import('../ui/dom-refs.js').elements} elements
 */
export function createReviewController(elements) {
  const deleteVocabModalManager = new ModalManager(elements.deleteVocabModal);
  deleteVocabModalManager.registerCloseButton(elements.closeDeleteVocabBtn);
  deleteVocabModalManager.registerCloseButton(elements.cancelDeleteVocabBtn);

  let pendingDeleteId = null;
  let isDeleting = false;

  function setNavigation(handlers) {
    navigation = { ...navigation, ...handlers };
  }

  function setReviewVisibility(mode) {
    if (!elements.reviewEmpty || !elements.reviewSession) return;
    elements.reviewEmpty.style.display = mode === 'empty' ? '' : 'none';
    elements.reviewSession.style.display = mode === 'session' ? '' : 'none';
  }

  function renderReviewStats(stats) {
    if (!elements.reviewStats) return;
    elements.reviewStats.textContent = `Due: ${stats.due} | New: ${stats.new} | Total: ${stats.total}`;
  }

  function setReviewText(el, value, fallback = '—') {
    if (!el) return;
    const text = (value ?? '').toString().trim();
    el.textContent = text ? text : fallback;
  }

  function setReviewAnswerVisibility(isShown) {
    isReviewAnswerShown = isShown;
    if (elements.reviewCard) {
      elements.reviewCard.classList.toggle('is-answer-hidden', !isShown);
    }
    if (elements.reviewActions) {
      elements.reviewActions.classList.toggle('is-hidden', !isShown);
    }
    if (elements.reviewShowAnswerBtn) {
      elements.reviewShowAnswerBtn.style.display = isShown ? 'none' : '';
    }
    const rateButtons = [elements.reviewAgainBtn, elements.reviewGoodBtn];
    rateButtons.filter(Boolean).forEach((btn) => {
      btn.disabled = !isShown;
    });
    if (elements.reviewHint) {
      elements.reviewHint.textContent = isShown
        ? '快捷键: 1=忘记 2/3/4=记得'
        : '快捷键: 空格=显示答案 1=忘记 2/3/4=记得';
    }
  }

  function revealReviewAnswer() {
    if (!currentReviewItem || isReviewAnswerShown) return;
    setReviewAnswerVisibility(true);
  }

  function getReviewGlobalId(item) {
    if (!item) return '';
    if (item.id) return item.id;
    if (item.normalizedWord) return item.normalizedWord;
    if (item.language && (item.displayWord || item.lemma)) {
      return makeGlobalVocabId(item.language, item.displayWord || item.lemma);
    }
    return '';
  }

  function clearPendingDelete() {
    pendingDeleteId = null;
  }

  function openDeleteModal() {
    if (!currentReviewItem) return;
    const globalId = getReviewGlobalId(currentReviewItem);
    if (!globalId) return;

    pendingDeleteId = globalId;
    const displayWord =
      currentReviewItem?.displayWord
      || currentReviewItem?.lemma
      || currentReviewItem?.normalizedWord
      || currentReviewItem?.id
      || globalId;

    if (elements.deleteVocabConfirmText) {
      elements.deleteVocabConfirmText.textContent = `确定要删除「${displayWord}」吗？此操作无法撤销。`;
    }

    deleteVocabModalManager.open({ focusTarget: elements.confirmDeleteVocabBtn || null });
  }

  async function handleConfirmDelete() {
    if (elements.reviewView && elements.reviewView.style.display === 'none') return;
    if (!pendingDeleteId || isDeleting) return;
    isDeleting = true;
    if (elements.reviewDeleteBtn) elements.reviewDeleteBtn.disabled = true;

    try {
      const removedId = pendingDeleteId;
      await deleteGlobalVocabItem(removedId);
      globalVocabByWord.delete(removedId);

      if (reviewQueue[reviewIndex] && getReviewGlobalId(reviewQueue[reviewIndex]) === removedId) {
        reviewQueue.splice(reviewIndex, 1);
      } else {
        const idx = reviewQueue.findIndex((item) => getReviewGlobalId(item) === removedId);
        if (idx >= 0) {
          reviewQueue.splice(idx, 1);
          if (idx < reviewIndex) reviewIndex = Math.max(0, reviewIndex - 1);
        }
      }

      currentReviewItem = null;
      deleteVocabModalManager.close();
      clearPendingDelete();
      renderReviewStats(await getReviewStats(new Date(), currentReviewLanguage));
      showNotification('词汇已删除', 'success');
      await showNextCard();
    } catch (error) {
      console.error('Failed to delete review card:', error);
      showNotification('删除失败: ' + error.message, 'error');
    } finally {
      isDeleting = false;
      if (elements.reviewDeleteBtn) elements.reviewDeleteBtn.disabled = false;
    }
  }

  function applyReviewIntervals(intervals) {
    if (!intervals) return;
    setReviewText(elements.reviewAgainInterval, intervals.again, '');
    setReviewText(elements.reviewGoodInterval, intervals.good, '');
    setReviewText(elements.reviewHardInterval, intervals.hard, '');
    setReviewText(elements.reviewEasyInterval, intervals.easy, '');
  }

  function clearReviewIntervals() {
    setReviewText(elements.reviewAgainInterval, '', '');
    setReviewText(elements.reviewGoodInterval, '', '');
    setReviewText(elements.reviewHardInterval, '', '');
    setReviewText(elements.reviewEasyInterval, '', '');
  }

  function readPreloadedIntervals(item) {
    const key = getReviewGlobalId(item);
    if (!key) return null;
    const cached = preloadedIntervals.get(key) || null;
    if (cached) preloadedIntervals.delete(key);
    return cached;
  }

  async function preloadIntervals(items) {
    const now = new Date();
    const tasks = (items || [])
      .filter(Boolean)
      .map(async (item) => {
        const key = getReviewGlobalId(item);
        if (!key || preloadedIntervals.has(key)) return;
        try {
          const intervals = await previewNextIntervals(item, now);
          preloadedIntervals.set(key, intervals);
        } catch (error) {
          console.warn('预加载复习间隔失败:', error);
        }
      });
    await Promise.all(tasks);
  }

  async function showNextCard(options = {}) {
    if (reviewIndex >= reviewQueue.length) {
      await loadReviewSession();
      return;
    }

    const fast = Boolean(options.fast);
    currentReviewItem = reviewQueue[reviewIndex];
    const display = currentReviewItem?.lemma || currentReviewItem?.displayWord || currentReviewItem?.normalizedWord || currentReviewItem?.id || '—';

    setReviewText(elements.reviewWord, display);
    setReviewText(elements.reviewContext, currentReviewItem?.contextSentence);
    setReviewAnswerVisibility(false);
    clearReviewIntervals();
    hideReviewLoading();

    if (fast) {
      setReviewText(elements.reviewMeaning, '加载中...');
      setReviewText(elements.reviewUsage, '加载中...');
      setReviewText(elements.reviewContextualMeaning, '加载中...');
    } else {
      setReviewText(elements.reviewMeaning, currentReviewItem?.meaning);
      setReviewText(elements.reviewUsage, currentReviewItem?.usage);
      setReviewText(elements.reviewContextualMeaning, currentReviewItem?.contextualMeaning);
    }

    if (!hasLoggedFirstCard) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      console.log('[Performance] Review first card shown in:', `${Math.round(now - reviewSessionStartAt)}ms`);
      hasLoggedFirstCard = true;
    }

    const applyDetails = async () => {
      if (!currentReviewItem) return;
      const key = getReviewGlobalId(currentReviewItem);
      const cachedIntervals = readPreloadedIntervals(currentReviewItem);
      try {
        const intervals = cachedIntervals || await previewNextIntervals(currentReviewItem, new Date());
        if (getReviewGlobalId(currentReviewItem) !== key) return;
        setReviewText(elements.reviewMeaning, currentReviewItem?.meaning);
        setReviewText(elements.reviewUsage, currentReviewItem?.usage);
        setReviewText(elements.reviewContextualMeaning, currentReviewItem?.contextualMeaning);
        applyReviewIntervals(intervals);
      } catch (error) {
        console.warn('加载复习间隔失败:', error);
      }
    };

    if (fast) {
      setTimeout(() => void applyDetails(), 0);
      return;
    }

    await applyDetails();
  }

  async function loadReviewSession() {
    const now = new Date();
    showReviewLoading('正在加载...');
    const stats = await getReviewStats(now, currentReviewLanguage);
    renderReviewStats(stats);

    reviewQueue = currentReviewLanguage
      ? await listDueCardsByLanguage(now, currentReviewLanguage)
      : await listDueCards(now);
    reviewQueue = reviewQueue.sort(() => Math.random() - 0.5);
    reviewIndex = 0;
    currentReviewItem = null;
    preloadedIntervals.clear();
    hasLoggedFirstCard = false;

    if (reviewQueue.length === 0) {
      hideReviewLoading();
      setReviewVisibility('empty');
      return;
    }

    setReviewVisibility('session');
    await showNextCard({ fast: true });
    setTimeout(() => void preloadIntervals(reviewQueue.slice(1, 4)), 300);
  }

  async function startReview(language = null) {
    const fsrsSettings = getFsrsSettings();
    const reviewMode = fsrsSettings?.reviewMode === 'mixed' ? 'mixed' : 'grouped';
    const currentLanguageFilter = getLanguageFilter();
    const normalizedLanguage =
      language && Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, language)
        ? language
        : reviewMode === 'grouped'
          ? currentLanguageFilter
          : null;
    currentReviewLanguage = reviewMode === 'grouped' ? normalizedLanguage : null;

    if (elements.reviewTitle) {
      const langLabel = currentReviewLanguage
        ? ` · ${SUPPORTED_LANGUAGES[currentReviewLanguage] || currentReviewLanguage}`
        : '';
      elements.reviewTitle.textContent = `📚 复习${langLabel}`;
    }

    reviewSessionStartAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    showReviewLoading('正在加载...');
    await refreshGlobalVocabCache();
    await loadReviewSession();
  }

  async function submitRating(rating) {
    if (!currentReviewItem) return;
    if (!isReviewAnswerShown) return;

    try {
      const updated = await reviewCard(currentReviewItem, rating, new Date());
      reviewQueue[reviewIndex] = updated;
      globalVocabByWord.set(updated.id || updated.normalizedWord, updated);
      currentReviewItem = null;
      reviewIndex += 1;

      renderReviewStats(await getReviewStats(new Date(), currentReviewLanguage));
      await showNextCard();
    } catch (error) {
      console.error('Failed to review card:', error);
      showNotification('复习失败: ' + error.message, 'error');
    }
  }

  function handleKeyDown(event) {
    if (!event) return false;
    const isSpace = event.key === ' ' || event.code === 'Space';
    if (isSpace) {
      event.preventDefault();
      revealReviewAnswer();
      return true;
    }
    if (!isReviewAnswerShown) return false;
    if (event.key === '1') {
      void submitRating('again');
      return true;
    }
    // Pass/Fail mode: 2, 3, 4 all map to 'good'
    if (event.key === '2' || event.key === '3' || event.key === '4') {
      void submitRating('good');
      return true;
    }
    return false;
  }

  function init({ onBackToBookshelf }) {
    setNavigation({ backToBookshelf: onBackToBookshelf });

    elements.backFromReviewBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.reviewFinishBtn?.addEventListener('click', navigation.backToBookshelf);
    elements.reviewShowAnswerBtn?.addEventListener('click', () => revealReviewAnswer());
    elements.reviewDeleteBtn?.addEventListener('click', openDeleteModal);
    elements.confirmDeleteVocabBtn?.addEventListener('click', handleConfirmDelete);
    elements.closeDeleteVocabBtn?.addEventListener('click', clearPendingDelete);
    elements.cancelDeleteVocabBtn?.addEventListener('click', clearPendingDelete);
    elements.deleteVocabModal?.addEventListener('click', (event) => {
      if (event.target === elements.deleteVocabModal) clearPendingDelete();
    });

    [elements.reviewAgainBtn, elements.reviewGoodBtn]
      .filter(Boolean)
      .forEach((btn) => {
        btn.addEventListener('click', () => submitRating(btn.dataset.rating));
      });
  }

  return {
    init,
    startReview,
    handleKeyDown
  };
}
