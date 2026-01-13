import kuromoji from 'kuromoji';
import { fileURLToPath } from 'node:url';

import { canonicalizeText, hashCanonicalText, normalizeWord, splitParagraphs } from './text.js';

const NON_LEARNABLE_POS = new Set(['助詞', '助動詞', '記号']);

export const JA_TOKENIZER_ID = 'kuromoji+kuroshiro';
export const JA_TOKENIZER_VERSION = '1';
export const JA_DICT_VERSION = 'ipadic-2.7.0';

/**
 * @param {any} tokenData
 */
function isLearnableWord(tokenData) {
  if (!tokenData?.pos) return false;
  if (NON_LEARNABLE_POS.has(tokenData.pos)) return false;
  const surface = typeof tokenData.surface_form === 'string' ? tokenData.surface_form : '';
  if (surface && surface.length === 1 && /[、。！？「」『』（）…・]/.test(surface)) return false;
  return true;
}

/**
 * @param {any} tokenData
 */
function getLemma(tokenData) {
  const basic = tokenData?.basic_form;
  if (typeof basic === 'string' && basic && basic !== '*') return basic;
  const surface = tokenData?.surface_form;
  return typeof surface === 'string' ? surface : '';
}

/** @type {Promise<any> | null} */
let tokenizerPromise = null;

function ensureTokenizer() {
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = new Promise((resolve, reject) => {
    const dicPath = fileURLToPath(new URL('../node_modules/kuromoji/dict/', import.meta.url));
    kuromoji.builder({ dicPath }).build((error, tokenizer) => {
      if (error) reject(error);
      else resolve(tokenizer);
    });
  });
  return tokenizerPromise;
}

/**
 * Tokenize canonicalText into offsets-aligned tokens.
 * @param {string} canonicalText
 */
export async function tokenizeJapaneseCanonicalText(canonicalText) {
  const tokenizer = await ensureTokenizer();
  const safeText = canonicalizeText(canonicalText);
  const textHash = hashCanonicalText(safeText);
  const paragraphs = splitParagraphs(safeText);

  /** @type {Array<{surface: string, lemma: string, reading: string|null, pos: string|null, posDetail: string|null, isWord: boolean, start: number, end: number}>} */
  const out = [];

  let offsetCursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphText = paragraphs[i];
    const base = offsetCursor;

    /** @type {any[]} */
    const rawTokens = tokenizer.tokenize(paragraphText) || [];
    let cursor = 0;

    for (const raw of rawTokens) {
      if (!raw || typeof raw !== 'object') continue;
      const surface = typeof raw.surface_form === 'string' ? raw.surface_form : '';
      if (!surface) continue;

      let startRel = null;
      const wordPos = Number(raw.word_position);
      if (Number.isFinite(wordPos) && wordPos >= 1) {
        startRel = wordPos - 1;
      } else {
        const found = paragraphText.indexOf(surface, cursor);
        if (found >= 0) startRel = found;
      }
      if (startRel == null || startRel < 0) continue;
      const endRel = startRel + surface.length;
      cursor = Math.max(cursor, endRel);

      if (endRel > paragraphText.length) continue;

      const lemmaRaw = getLemma(raw) || surface;
      const normalizedLemma = normalizeWord(lemmaRaw) || normalizeWord(surface) || '';
      if (!normalizedLemma) continue;

      const reading = typeof raw.reading === 'string' && raw.reading && raw.reading !== '*'
        ? raw.reading
        : null;
      const pos = typeof raw.pos === 'string' && raw.pos && raw.pos !== '*'
        ? raw.pos
        : null;
      const posDetail = typeof raw.pos_detail_1 === 'string' && raw.pos_detail_1 && raw.pos_detail_1 !== '*'
        ? raw.pos_detail_1
        : null;

      const start = base + startRel;
      const end = base + endRel;
      if (safeText.slice(start, end) !== surface) {
        continue;
      }

      out.push({
        surface,
        lemma: normalizedLemma,
        reading,
        pos,
        posDetail,
        isWord: Boolean(isLearnableWord(raw)),
        start,
        end
      });
    }

    offsetCursor += paragraphText.length + (i < paragraphs.length - 1 ? 2 : 0);
  }

  return {
    textHash,
    tokens: out,
    tokenizer: { id: JA_TOKENIZER_ID, version: JA_TOKENIZER_VERSION, dictVersion: JA_DICT_VERSION }
  };
}
