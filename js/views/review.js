import { SUPPORTED_LANGUAGES, getFsrsSettings } from '../storage.js';
import { getLanguageFilter } from '../core/language-filter.js';
import { globalVocabByWord, refreshGlobalVocabCache } from '../core/global-vocab-cache.js';
import { getDueCards, getReviewStats, previewNextIntervals, reviewCard } from '../srs-service.js';
import { showNotification } from '../ui/notifications.js';

let currentReviewLanguage = null; // null for mixed mode
let reviewQueue = [];
let reviewIndex = 0;
let currentReviewItem = null;
let isReviewAnswerShown = false;

/** @type {{ backToBookshelf: () => void }} */
let navigation = {
  backToBookshelf: () => { }
};

/**
 * @param {import('../ui/dom-refs.js').elements} elements
 */
export function createReviewController(elements) {
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

  async function showNextCard() {
    if (reviewIndex >= reviewQueue.length) {
      await loadReviewSession();
      return;
    }

    currentReviewItem = reviewQueue[reviewIndex];
    const display = currentReviewItem?.displayWord || currentReviewItem?.normalizedWord || currentReviewItem?.id || '—';

    setReviewText(elements.reviewWord, display);
    setReviewText(elements.reviewMeaning, currentReviewItem?.meaning);
    setReviewText(elements.reviewUsage, currentReviewItem?.usage);
    setReviewText(elements.reviewContext, currentReviewItem?.contextSentence);
    setReviewText(elements.reviewContextualMeaning, currentReviewItem?.contextualMeaning);

    setReviewAnswerVisibility(false);

    const intervals = await previewNextIntervals(currentReviewItem, new Date());
    setReviewText(elements.reviewAgainInterval, intervals.again, '');
    setReviewText(elements.reviewGoodInterval, intervals.good, '');
  }

  async function loadReviewSession() {
    const now = new Date();
    const stats = await getReviewStats(now, currentReviewLanguage);
    renderReviewStats(stats);

    reviewQueue = await getDueCards(now, currentReviewLanguage);
    reviewQueue = reviewQueue.sort(() => Math.random() - 0.5);
    reviewIndex = 0;
    currentReviewItem = null;

    if (reviewQueue.length === 0) {
      setReviewVisibility('empty');
      return;
    }

    setReviewVisibility('session');
    await showNextCard();
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
