import { normalizeWord } from '../word-status.js';

let WORD_REGEX = null;

export function getWordRegex() {
  if (WORD_REGEX) return WORD_REGEX;
  try {
    WORD_REGEX = new RegExp("[\\p{L}\\p{N}]+(?:[’'\\-][\\p{L}\\p{N}]+)*", 'gu');
  } catch {
    WORD_REGEX =
      /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]+(?:[’'\-][A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]+)*/g;
  }
  return WORD_REGEX;
}

export function normalizeNewlines(value) {
  return String(value || '').replace(/\r\n?/g, '\n');
}

export function splitChapterIntoParagraphs(text) {
  return normalizeNewlines(text)
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim());
}

export function tokenizeParagraphInto(paragraphEl, paragraphText) {
  const regex = getWordRegex();
  regex.lastIndex = 0;

  let lastIndex = 0;
  let match;
  while ((match = regex.exec(paragraphText)) !== null) {
    const wordStart = match.index;
    const wordText = match[0];
    const normalized = normalizeWord(wordText);

    if (wordStart > lastIndex) {
      paragraphEl.appendChild(document.createTextNode(paragraphText.slice(lastIndex, wordStart)));
    }

    if (normalized) {
      const span = document.createElement('span');
      span.className = 'word';
      span.dataset.word = normalized;
      span.textContent = wordText;
      paragraphEl.appendChild(span);
    } else {
      paragraphEl.appendChild(document.createTextNode(wordText));
    }

    lastIndex = wordStart + wordText.length;
  }

  if (lastIndex < paragraphText.length) {
    paragraphEl.appendChild(document.createTextNode(paragraphText.slice(lastIndex)));
  }
}

export function buildTokenizedChapterWrapperWithMeta(text) {
  const wrapper = document.createElement('div');
  const paragraphs = splitChapterIntoParagraphs(text || '');

  paragraphs.forEach((paragraphText) => {
    const paragraphEl = document.createElement('p');
    tokenizeParagraphInto(paragraphEl, paragraphText);
    wrapper.appendChild(paragraphEl);
  });

  if (paragraphs.length === 0) {
    wrapper.innerHTML = `
            <div class="welcome-state">
              <div class="welcome-icon">📖</div>
              <h2>No content</h2>
              <p>该章节内容为空</p>
            </div>
        `;
  }

  return { wrapper, canonicalText: paragraphs.join('\n\n') };
}

export function buildTokenizedChapterWrapper(text) {
  return buildTokenizedChapterWrapperWithMeta(text).wrapper;
}

export function renderTokenizedChapterContent(container, text) {
  container.innerHTML = '';
  container.appendChild(buildTokenizedChapterWrapper(text));
}

export function collapseWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTextToKey(rawText) {
  const collapsed = collapseWhitespace(rawText);
  if (!collapsed) return '';

  const parts = [];
  const regex = getWordRegex();
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(collapsed)) !== null) {
    const normalized = normalizeWord(match[0]);
    if (normalized) parts.push(normalized);
  }
  if (parts.length > 0) return parts.join(' ');

  return normalizeWord(collapsed);
}
