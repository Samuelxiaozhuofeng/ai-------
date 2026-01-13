/**
 * Japanese Token Types and Constants
 * Defines token structure, versions, and cache keys.
 */

// Tokenizer version - increment when logic changes
export const JA_TOKENIZER_VERSION = '2';

// Dictionary version - matches the Sudachi core dictionary used by the worker.
export const JA_DICT_VERSION = 'sudachidict_core';

// Tokenizer ID
export const JA_TOKENIZER_ID = 'sudachipy';

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
