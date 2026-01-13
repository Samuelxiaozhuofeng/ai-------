/**
 * Japanese Token Types and Constants
 * Defines token structure, versions, and utility functions
 */

// Tokenizer version - increment when logic changes
export const JA_TOKENIZER_VERSION = '1';

// Dictionary version - should match the vendored kuromoji dict
export const JA_DICT_VERSION = 'ipadic-2.7.0';

// Tokenizer ID
export const JA_TOKENIZER_ID = 'kuromoji+kuroshiro';

/**
 * POS (Part of Speech) types that should NOT be treated as learnable words
 */
export const NON_LEARNABLE_POS = new Set([
  '助詞',     // Particles
  '助動詞',   // Auxiliary verbs
  '記号',     // Symbols/Punctuation
]);

/**
 * Token structure (TypeScript-style JSDoc)
 * @typedef {Object} JapaneseToken
 * @property {string} surface - Original text (e.g., 食べている)
 * @property {string} lemma - Base form/dictionary form (e.g., 食べる)
 * @property {string|null} reading - Reading in katakana (e.g., タベテイル)
 * @property {string|null} pos - Part of speech (e.g., 動詞, 名詞)
 * @property {string|null} posDetail - Detailed POS info
 * @property {boolean} isWord - Should this be rendered as clickable .word span?
 * @property {number} start - Start offset in canonicalText
 * @property {number} end - End offset in canonicalText
 */

/**
 * Tokenization cache entry
 * @typedef {Object} TokenizationCacheEntry
 * @property {string} id - Composite ID: bookId:chapterId:tokenizerId:version:hash
 * @property {string} bookId
 * @property {string} chapterId
 * @property {string} tokenizerId
 * @property {string} tokenizerVersion
 * @property {string} dictVersion
 * @property {string} textHash - fnv1a32 hash of canonicalText
 * @property {string} createdAt - ISO timestamp
 * @property {JapaneseToken[]} tokens
 */

/**
 * Determine if a token should be treated as a learnable word
 * @param {Object} tokenData - Raw token data from kuromoji
 * @returns {boolean}
 */
export function isLearnableWord(tokenData) {
  if (!tokenData.pos) return false;

  // Filter out particles, auxiliary verbs, and symbols
  if (NON_LEARNABLE_POS.has(tokenData.pos)) {
    return false;
  }

  // Filter out single-character punctuation
  if (tokenData.surface_form && tokenData.surface_form.length === 1) {
    if (/[、。！？「」『』（）…・]/.test(tokenData.surface_form)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a normalized lemma from token data
 * @param {Object} tokenData - Raw token data from kuromoji
 * @returns {string}
 */
export function getLemma(tokenData) {
  // Use basic_form if available, otherwise fall back to surface
  return tokenData.basic_form && tokenData.basic_form !== '*'
    ? tokenData.basic_form
    : tokenData.surface_form;
}

/**
 * Validate token structure
 * @param {JapaneseToken} token
 * @returns {boolean}
 */
export function isValidToken(token) {
  return (
    typeof token.surface === 'string' &&
    typeof token.lemma === 'string' &&
    typeof token.isWord === 'boolean' &&
    typeof token.start === 'number' &&
    typeof token.end === 'number' &&
    token.start >= 0 &&
    token.end > token.start
  );
}

/**
 * Create cache entry ID
 * @param {string} bookId
 * @param {string} chapterId
 * @param {string} textHash
 * @returns {string}
 */
export function createCacheId(bookId, chapterId, textHash) {
  return `${bookId}:${chapterId}:${JA_TOKENIZER_ID}:${JA_TOKENIZER_VERSION}:${textHash}`;
}
