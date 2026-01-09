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

    if (state.selectedWordEl) state.selectedWordEl.classList.remove('word-selected');
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
      await setSelectedWordStatus(WORD_STATUSES.LEARNING, { trigger: 'click' });
    }

    if (state.selectedWord && !state.selectedWordAnalysis) {
      queueSelectedWordAnalysis({ debounceMs: 250 });
    }

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
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed) return;

      const selectedText = collapseWhitespace(selection.toString());
      if (!selectedText) return;
      if (selectedText.length > 80) return;
      if (/\n/.test(selectedText)) return;

      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!range) return;

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorEl = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentNode : anchorNode;
      const focusEl = focusNode?.nodeType === Node.TEXT_NODE ? focusNode.parentNode : focusNode;
      if (!elements.readingContent.contains(anchorEl) || !elements.readingContent.contains(focusEl)) return;

      const context = extractContextForRange(range);
      if (!context) return;

      const normalized = normalizeTextToKey(selectedText);
      if (!normalized) return;

      state.suppressWordClickUntil = Date.now() + 300;

      if (state.selectedWordEl) state.selectedWordEl.classList.remove('word-selected');
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

      if (!state.selectedWordAnalysis) {
        queueSelectedWordAnalysis({ debounceMs: 250 });
      }

      renderVocabularyPanel();
    }, 0);
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
    handleReadingSelectionEnd
  };
}

