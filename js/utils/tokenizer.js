import { normalizeWord } from '../word-status.js';

let WORD_REGEX = null;

export function hashCanonicalText(value) {
  const str = String(value || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `fnv1a32:${hex}`;
}

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

function tokenizeJapaneseParagraphInto(paragraphEl, paragraphText, paragraphStartOffset, tokens) {
  const startBase = Math.max(0, Number(paragraphStartOffset) || 0);
  const endBase = startBase + paragraphText.length;

  const localTokens = Array.isArray(tokens)
    ? tokens
      .filter((token) => token && token.start >= startBase && token.end <= endBase)
      .sort((a, b) => (a.start - b.start) || (a.end - b.end))
    : [];

  let cursor = 0;
  for (const token of localTokens) {
    const startRel = token.start - startBase;
    const endRel = token.end - startBase;
    if (startRel < cursor) continue;
    if (startRel > paragraphText.length) continue;
    if (endRel > paragraphText.length) continue;
    if (endRel <= startRel) continue;

    if (startRel > cursor) {
      paragraphEl.appendChild(document.createTextNode(paragraphText.slice(cursor, startRel)));
    }

    const surface = paragraphText.slice(startRel, endRel);
    if (token.isWord && token.lemma) {
      const span = document.createElement('span');
      span.className = 'word';
      span.dataset.word = token.lemma;
      span.dataset.surface = surface;
      span.dataset.lemma = token.lemma;
      if (token.reading) span.dataset.reading = token.reading;
      if (token.pos) span.dataset.pos = token.pos;
      if (token.posDetail) span.dataset.posDetail = token.posDetail;
      span.textContent = surface;
      paragraphEl.appendChild(span);
    } else {
      paragraphEl.appendChild(document.createTextNode(surface));
    }

    cursor = endRel;
  }

  if (cursor < paragraphText.length) {
    paragraphEl.appendChild(document.createTextNode(paragraphText.slice(cursor)));
  }
}

export async function buildTokenizedChapterWrapperWithMetaForLanguage(text, options = {}) {
  const language = (options?.language || 'en').toString().trim().toLowerCase();
  if (language !== 'ja') return buildTokenizedChapterWrapperWithMeta(text);

  const wrapper = document.createElement('div');
  const paragraphs = splitChapterIntoParagraphs(text || '');
  const canonicalText = paragraphs.join('\n\n');

  if (paragraphs.length === 0) {
    wrapper.innerHTML = `
            <div class="welcome-state">
              <div class="welcome-icon">📖</div>
              <h2>No content</h2>
              <p>该章节内容为空</p>
            </div>
        `;
    return { wrapper, canonicalText };
  }

  const bookId = typeof options?.bookId === 'string' ? options.bookId.trim() : '';
  const chapterId = typeof options?.chapterId === 'string' ? options.chapterId.trim() : '';
  if (!bookId || !chapterId) {
    paragraphs.forEach((paragraphText) => {
      const paragraphEl = document.createElement('p');
      tokenizeParagraphInto(paragraphEl, paragraphText);
      wrapper.appendChild(paragraphEl);
    });
    return { wrapper, canonicalText };
  }

  const textHash = hashCanonicalText(canonicalText);

  /** @type {{text: string, startOffset: number}[]} */
  const paragraphPayload = [];
  let offsetCursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphText = paragraphs[i];
    paragraphPayload.push({ text: paragraphText, startOffset: offsetCursor });
    offsetCursor += paragraphText.length + (i < paragraphs.length - 1 ? 2 : 0);
  }

  try {
    const { tokenizeJapaneseChapter } = await import('../tokenizers/japanese/japanese-tokenization-service.js');
    const result = await tokenizeJapaneseChapter({
      bookId,
      chapterId,
      textHash,
      paragraphs: paragraphPayload
    });

    const tokens = Array.isArray(result?.tokens) ? result.tokens : [];

    // Minimal safety check: offsets must point into canonicalText.
    const maxChecks = Math.min(tokens.length, 2000);
    for (let i = 0; i < maxChecks; i++) {
      const token = tokens[i];
      if (!token) continue;
      const slice = canonicalText.slice(token.start, token.end);
      if (slice !== token.surface) {
        throw new Error('Japanese token offsets do not match canonicalText');
      }
    }

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraphText = paragraphs[i];
      const startOffset = paragraphPayload[i]?.startOffset || 0;
      const paragraphEl = document.createElement('p');
      tokenizeJapaneseParagraphInto(paragraphEl, paragraphText, startOffset, tokens);
      wrapper.appendChild(paragraphEl);
    }

    return { wrapper, canonicalText };
  } catch (error) {
    console.warn('Japanese tokenization failed, falling back to regex tokenizer:', error);
    paragraphs.forEach((paragraphText) => {
      const paragraphEl = document.createElement('p');
      tokenizeParagraphInto(paragraphEl, paragraphText);
      wrapper.appendChild(paragraphEl);
    });
    return { wrapper, canonicalText };
  }
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
