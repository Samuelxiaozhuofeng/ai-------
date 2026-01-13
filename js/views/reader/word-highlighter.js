import { normalizeWord, statusToClass, WORD_STATUSES } from '../../word-status.js';
import { collapseWhitespace, normalizeTextToKey } from '../../utils/tokenizer.js';
import { getAutoStudyEnabled } from '../../core/auto-study.js';

export function createWordHighlighter({
  elements,
  state,
  getEffectiveWordStatus,
  getCachedAnalysisForSelectedWord,
  queueSelectedWordAnalysis,
  setSelectedWordStatus,
  renderVocabularyPanel,
  switchTab
}) {
  const PHRASE_LONG_PRESS_MS = 320;
  const PHRASE_MOVE_CANCEL_PX = 12;
  const PHRASE_HIGHLIGHT_CLEAR_MS = 1200;
  const WORD_DOUBLE_TAP_MS = 280;

  /** @type {HTMLElement | null} */
  let lastTappedWordEl = null;
  let lastTappedAt = 0;

  const phraseSelection = {
    active: false,
    touchId: null,
    startX: 0,
    startY: 0,
    paragraphEl: /** @type {HTMLParagraphElement | null} */ (null),
    words: /** @type {HTMLElement[]} */ ([]),
    startIndex: -1,
    endIndex: -1,
    highlightMin: -1,
    highlightMax: -1,
    longPressTimer: /** @type {number | null} */ (null),
    clearTimer: /** @type {number | null} */ (null)
  };

  function getTouchById(list, touchId) {
    if (!list || touchId == null) return null;
    // TouchList isn't a real array on iOS.
    for (let i = 0; i < list.length; i++) {
      const touch = list[i];
      if (touch?.identifier === touchId) return touch;
    }
    return null;
  }

  function clearPhraseTimers() {
    if (phraseSelection.longPressTimer != null) {
      clearTimeout(phraseSelection.longPressTimer);
      phraseSelection.longPressTimer = null;
    }
    if (phraseSelection.clearTimer != null) {
      clearTimeout(phraseSelection.clearTimer);
      phraseSelection.clearTimer = null;
    }
  }

  function clearPhraseHighlight() {
    if (!phraseSelection.paragraphEl || phraseSelection.highlightMin < 0 || phraseSelection.highlightMax < 0) return;
    for (let i = phraseSelection.highlightMin; i <= phraseSelection.highlightMax; i++) {
      phraseSelection.words[i]?.classList.remove('word-phrase-selected');
    }
    phraseSelection.highlightMin = -1;
    phraseSelection.highlightMax = -1;
  }

  function resetPhraseSelection() {
    clearPhraseTimers();
    clearPhraseHighlight();
    phraseSelection.active = false;
    phraseSelection.touchId = null;
    phraseSelection.paragraphEl = null;
    phraseSelection.words = [];
    phraseSelection.startIndex = -1;
    phraseSelection.endIndex = -1;
    state.isPhraseSelecting = false;
    elements.readerView?.classList.remove('is-phrase-selecting');
  }

  function updatePhraseHighlightRange(nextMin, nextMax) {
    if (!phraseSelection.paragraphEl) return;
    if (nextMin < 0 || nextMax < 0) return;
    if (nextMin > nextMax) return;

    const prevMin = phraseSelection.highlightMin;
    const prevMax = phraseSelection.highlightMax;

    if (prevMin >= 0 && prevMax >= 0) {
      for (let i = prevMin; i <= prevMax; i++) {
        if (i < nextMin || i > nextMax) phraseSelection.words[i]?.classList.remove('word-phrase-selected');
      }
      for (let i = nextMin; i <= nextMax; i++) {
        if (i < prevMin || i > prevMax) phraseSelection.words[i]?.classList.add('word-phrase-selected');
      }
    } else {
      for (let i = nextMin; i <= nextMax; i++) {
        phraseSelection.words[i]?.classList.add('word-phrase-selected');
      }
    }

    phraseSelection.highlightMin = nextMin;
    phraseSelection.highlightMax = nextMax;
  }

  function beginPhraseSelection(wordEl, touchId) {
    const paragraphEl = wordEl?.closest?.('p') || null;
    if (!paragraphEl) return;

    const words = Array.from(paragraphEl.querySelectorAll('.word'));
    const startIndex = words.indexOf(wordEl);
    if (startIndex < 0) return;

    resetPhraseSelection();

    phraseSelection.active = true;
    phraseSelection.touchId = touchId;
    phraseSelection.paragraphEl = paragraphEl;
    phraseSelection.words = words;
    phraseSelection.startIndex = startIndex;
    phraseSelection.endIndex = startIndex;

    state.isPhraseSelecting = true;
    elements.readerView?.classList.add('is-phrase-selecting');

    // Prevent the follow-up click from selecting a single word.
    state.suppressWordClickUntil = Date.now() + 800;
    state.suppressPageSwipeUntil = Date.now() + 1200;

    updatePhraseHighlightRange(startIndex, startIndex);
    navigator.vibrate?.(10);
  }

  function commitPhraseSelection() {
    if (!phraseSelection.active || !phraseSelection.paragraphEl) return;

    const start = Math.min(phraseSelection.startIndex, phraseSelection.endIndex);
    const end = Math.max(phraseSelection.startIndex, phraseSelection.endIndex);
    if (start < 0 || end < 0) return;

    const startEl = phraseSelection.words[start];
    const endEl = phraseSelection.words[end];
    if (!startEl || !endEl) return;

    const range = document.createRange();
    range.setStartBefore(startEl);
    range.setEndAfter(endEl);

    const selectedText = collapseWhitespace(range.toString());
    const didSelect = handleProcessedSelection(range, selectedText);

    if (didSelect) navigator.vibrate?.(5);

    // Keep highlight very briefly for feedback, then clear for a cleaner page.
    clearPhraseTimers();
    phraseSelection.clearTimer = window.setTimeout(() => clearPhraseHighlight(), PHRASE_HIGHLIGHT_CLEAR_MS);
    phraseSelection.active = false;
    state.isPhraseSelecting = false;
    elements.readerView?.classList.remove('is-phrase-selecting');
  }

  function handleProcessedSelection(range, selectedText) {
    if (!selectedText) return false;
    if (selectedText.length > 80) return false;
    if (/\n/.test(selectedText)) return false;

    if (!range) return false;

    const anchorEl = range.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
    const focusEl = range.endContainer?.nodeType === Node.TEXT_NODE ? range.endContainer.parentNode : range.endContainer;
    if (!elements.readingContent.contains(anchorEl) || !elements.readingContent.contains(focusEl)) return false;

    const context = extractContextForRange(range);
    if (!context) return false;

    const normalized = normalizeTextToKey(selectedText);
    if (!normalized) return false;

    state.suppressWordClickUntil = Date.now() + 350;
    state.suppressPageSwipeUntil = Date.now() + 600;

    state.selectedWordSelectionId = (state.selectedWordSelectionId || 0) + 1;
    state.selectedWordSelectedAt = Date.now();

    if (state.selectedWordEl) state.selectedWordEl.classList.remove('word-selected', 'word-processing');
    state.selectedWordEl = null;

    state.selectedWord = normalized;
    state.selectedWordDisplay = selectedText;
    state.selectedWordContext = context;
    state.selectedWordAnalysis = getCachedAnalysisForSelectedWord(state.selectedWord) || null;
    state.isSelectedAnalysisLoading = false;

    state.selectedWord.split(' ').forEach((part) => {
      const token = normalizeWord(part);
      if (token) state.clickedWordsOnPage.add(token);
    });

    switchTab('vocab-analysis');

    // Mobile browsers often trigger a native selection (double-tap) instead of a simple click.
    // For single-word selections, keep auto-study behavior consistent with tap-to-lookup.
    const isSingleWordSelection = !normalized.includes(' ');
    if (isSingleWordSelection) {
      const effectiveStatus = getEffectiveWordStatus(normalized);
      const shouldAutoStudy = Boolean(
        normalized
          && getAutoStudyEnabled()
          && effectiveStatus !== WORD_STATUSES.KNOWN
          && effectiveStatus !== WORD_STATUSES.LEARNING
      );
      if (shouldAutoStudy) {
        setSelectedWordStatus(WORD_STATUSES.LEARNING, { trigger: 'click' })
          .catch((error) => console.warn('Auto-study (selection) failed:', error));
      }
    }

    queueSelectedWordAnalysis({
      debounceMs: 0,
      requestId: state.selectedWordSelectionId,
      autoOpenOnReady: true
    });

    renderVocabularyPanel();
    return true;
  }

  function selectWordText(wordEl) {
    const selection = window.getSelection?.();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(wordEl);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function applyWordStatusesToContainer(container) {
    container.querySelectorAll('.word').forEach((el) => {
      const normalizedWord = el.dataset.word || '';
      const status = normalizedWord ? getEffectiveWordStatus(normalizedWord) : WORD_STATUSES.NEW;
      el.classList.remove('word-new', 'word-seen', 'word-learning', 'word-known');
      el.classList.add(statusToClass(status));
    });
  }

  async function handleReadingWordClick(event) {
    if (Date.now() < state.suppressWordClickUntil) return;

    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;

    const target = event.target.closest?.('.word');
    if (!target || !elements.readingContent.contains(target)) return;

    const now = Date.now();
    const isDoubleTap = lastTappedWordEl === target && (now - lastTappedAt) <= WORD_DOUBLE_TAP_MS;
    lastTappedWordEl = target;
    lastTappedAt = now;

    // Double tap: use native selection highlight for clearer feedback (and larger handles on mobile).
    if (isDoubleTap) {
      lastTappedWordEl = null;
      lastTappedAt = 0;
      if (selectWordText(target)) {
        state.suppressPageSwipeUntil = Date.now() + 600;
        navigator.vibrate?.(5);
      }
      return;
    }

    state.selectedWordSelectionId = (state.selectedWordSelectionId || 0) + 1;
    state.selectedWordSelectedAt = Date.now();

    if (state.selectedWordEl) state.selectedWordEl.classList.remove('word-selected', 'word-processing');
    state.selectedWordEl = target;
    state.selectedWordEl.classList.add('word-selected');

    state.selectedWord = target.dataset.word || null;
    state.selectedWordDisplay = target.textContent || state.selectedWord;
    state.selectedWordContext = extractContextForWordSpan(target);
    if (state.selectedWord) state.clickedWordsOnPage.add(state.selectedWord);

    const existing = state.selectedWord ? state.vocabularyByWord.get(state.selectedWord) : null;
    state.selectedWordAnalysis = getCachedAnalysisForSelectedWord(state.selectedWord, existing) || null;
    state.isSelectedAnalysisLoading = false;

    switchTab('vocab-analysis');

    const effectiveStatus = state.selectedWord ? getEffectiveWordStatus(state.selectedWord) : WORD_STATUSES.NEW;
    const shouldAutoStudy = Boolean(
      state.selectedWord
        && getAutoStudyEnabled()
        && effectiveStatus !== WORD_STATUSES.KNOWN
        && effectiveStatus !== WORD_STATUSES.LEARNING
    );
    if (shouldAutoStudy) {
      setSelectedWordStatus(WORD_STATUSES.LEARNING, { trigger: 'click' })
        .catch((error) => console.warn('Auto-study (click) failed:', error));
    }

    queueSelectedWordAnalysis({
      debounceMs: 0,
      requestId: state.selectedWordSelectionId,
      autoOpenOnReady: true
    });

    renderVocabularyPanel();
  }

  function getSelectionParagraph(node) {
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el?.closest?.('p') || null;
  }

  function extractContextForRange(range) {
    const startP = getSelectionParagraph(range?.startContainer);
    const endP = getSelectionParagraph(range?.endContainer);
    if (!startP || !endP || startP !== endP) return null;

    const paragraphText = startP?.textContent?.trim?.() || '';
    if (!paragraphText) {
      return {
        previousSentence: '',
        currentSentence: paragraphText,
        nextSentence: '',
        fullContext: paragraphText
      };
    }

    const sentenceDelimiters = /[.!?¡¿。！？]+\s*/g;

    const preRange = document.createRange();
    preRange.selectNodeContents(startP);
    try {
      preRange.setEnd(range.startContainer, range.startOffset);
    } catch {
      return {
        previousSentence: '',
        currentSentence: paragraphText,
        nextSentence: '',
        fullContext: paragraphText
      };
    }

    const offset = preRange.toString().length;

    const boundaries = [0];
    let match;
    while ((match = sentenceDelimiters.exec(paragraphText)) !== null) {
      boundaries.push(match.index + match[0].length);
    }
    boundaries.push(paragraphText.length);

    let currentSentenceIndex = -1;
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (offset >= boundaries[i] && offset < boundaries[i + 1]) {
        currentSentenceIndex = i;
        break;
      }
    }
    if (currentSentenceIndex === -1) {
      currentSentenceIndex = boundaries.length - 2;
    }

    const currentSentence = paragraphText.substring(
      boundaries[currentSentenceIndex],
      boundaries[currentSentenceIndex + 1]
    ).trim();

    return {
      previousSentence: '',
      currentSentence,
      nextSentence: '',
      fullContext: currentSentence
    };
  }

  function handleReadingSelectionEnd() {
    setTimeout(() => {
      if (state.isPhraseSelecting) return;

      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed) return;

      const selectedText = collapseWhitespace(selection.toString());
      if (!selectedText) return;

      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!range) return;

      handleProcessedSelection(range, selectedText);
    }, 0);
  }

  function handleReadingTouchStart(event) {
    if (!state.isPageFlipMode) return;
    if (!event.touches || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const target = event.target?.closest?.('.word');
    if (!target || !elements.readingContent.contains(target)) return;

    phraseSelection.touchId = touch.identifier;
    phraseSelection.startX = touch.clientX;
    phraseSelection.startY = touch.clientY;

    clearPhraseTimers();
    phraseSelection.longPressTimer = window.setTimeout(() => beginPhraseSelection(target, touch.identifier), PHRASE_LONG_PRESS_MS);
  }

  function handleReadingTouchMove(event) {
    if (!event.touches || phraseSelection.touchId == null) return;
    const touch = getTouchById(event.touches, phraseSelection.touchId);
    if (!touch) return;

    const dx = touch.clientX - phraseSelection.startX;
    const dy = touch.clientY - phraseSelection.startY;
    const movedFar = Math.hypot(dx, dy) > PHRASE_MOVE_CANCEL_PX;

    if (!phraseSelection.active) {
      // If the user is scrolling/moving, cancel the long-press quickly.
      if (movedFar) clearPhraseTimers();
      return;
    }

    const elAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
    const wordEl = elAtPoint?.closest?.('.word');
    if (!wordEl || !elements.readingContent.contains(wordEl)) return;

    const paragraphEl = wordEl.closest?.('p') || null;
    if (!paragraphEl || paragraphEl !== phraseSelection.paragraphEl) return;

    const endIndex = phraseSelection.words.indexOf(wordEl);
    if (endIndex < 0 || endIndex === phraseSelection.endIndex) return;

    phraseSelection.endIndex = endIndex;
    const nextMin = Math.min(phraseSelection.startIndex, endIndex);
    const nextMax = Math.max(phraseSelection.startIndex, endIndex);
    updatePhraseHighlightRange(nextMin, nextMax);
  }

  function handleReadingTouchEnd(event) {
    if (phraseSelection.touchId == null) return;
    const touch = getTouchById(event.changedTouches, phraseSelection.touchId);
    if (!touch) return;

    clearPhraseTimers();

    if (phraseSelection.active) {
      commitPhraseSelection();
      // Keep touchId until reset to avoid re-entrancy with other listeners.
      phraseSelection.touchId = null;
      return;
    }

    phraseSelection.touchId = null;
  }

  function extractContextForWordSpan(wordEl) {
    const paragraph = wordEl.closest('p');
    const paragraphText = paragraph?.textContent?.trim() || '';
    if (!paragraphText || !paragraph) {
      return {
        previousSentence: '',
        currentSentence: paragraphText,
        nextSentence: '',
        fullContext: paragraphText
      };
    }

    const sentenceDelimiters = /[.!?¡¿。！？]+\s*/g;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.setEndBefore(wordEl);
    const offset = range.toString().length;

    const boundaries = [0];
    let match;
    while ((match = sentenceDelimiters.exec(paragraphText)) !== null) {
      boundaries.push(match.index + match[0].length);
    }
    boundaries.push(paragraphText.length);

    let currentSentenceIndex = -1;
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (offset >= boundaries[i] && offset < boundaries[i + 1]) {
        currentSentenceIndex = i;
        break;
      }
    }
    if (currentSentenceIndex === -1) {
      currentSentenceIndex = boundaries.length - 2;
    }

    const currentSentence = paragraphText.substring(
      boundaries[currentSentenceIndex],
      boundaries[currentSentenceIndex + 1]
    ).trim();

    return {
      previousSentence: '',
      currentSentence,
      nextSentence: '',
      fullContext: currentSentence
    };
  }

  return {
    applyWordStatusesToContainer,
    handleReadingWordClick,
    handleReadingSelectionEnd,
    handleReadingTouchStart,
    handleReadingTouchMove,
    handleReadingTouchEnd,
    resetPhraseSelection
  };
}
