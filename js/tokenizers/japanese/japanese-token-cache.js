import { initDB } from '../../db.js';
import {
  JA_DICT_VERSION,
  JA_TOKENIZER_ID,
  JA_TOKENIZER_VERSION,
  createCacheId,
  isValidToken
} from './japanese-token-types.js';

const STORE_TOKENIZATION_CACHE = 'tokenizationCache';

/**
 * @param {any} entry
 * @returns {entry is import('./japanese-token-types.js').TokenizationCacheEntry}
 */
function isValidCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.tokenizerId !== JA_TOKENIZER_ID) return false;
  if (entry.tokenizerVersion !== JA_TOKENIZER_VERSION) return false;
  if (entry.dictVersion !== JA_DICT_VERSION) return false;
  if (typeof entry.textHash !== 'string' || !entry.textHash) return false;
  if (!Array.isArray(entry.tokens)) return false;
  if (entry.tokens.length === 0) return false;
  return entry.tokens.every((token) => isValidToken(token));
}

/**
 * @param {string} bookId
 * @param {string} chapterId
 * @param {string} textHash
 * @returns {Promise<import('./japanese-token-types.js').TokenizationCacheEntry | null>}
 */
export async function getJapaneseTokenCacheEntry(bookId, chapterId, textHash) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  const safeChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
  const safeHash = typeof textHash === 'string' ? textHash.trim() : '';
  if (!safeBookId || !safeChapterId || !safeHash) return null;

  const id = createCacheId(safeBookId, safeChapterId, safeHash);

  /** @type {IDBDatabase} */
  const db = await initDB();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_TOKENIZATION_CACHE], 'readonly');
      const store = transaction.objectStore(STORE_TOKENIZATION_CACHE);
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result || null;
        resolve(isValidCacheEntry(result) ? result : null);
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * @param {import('./japanese-token-types.js').TokenizationCacheEntry} entry
 * @returns {Promise<boolean>}
 */
export async function putJapaneseTokenCacheEntry(entry) {
  if (!isValidCacheEntry(entry)) return false;

  /** @type {IDBDatabase} */
  const db = await initDB();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_TOKENIZATION_CACHE], 'readwrite');
      const store = transaction.objectStore(STORE_TOKENIZATION_CACHE);
      const request = store.put(entry);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * @param {string} bookId
 * @param {string} chapterId
 * @param {string} textHash
 * @param {import('./japanese-token-types.js').JapaneseToken[]} tokens
 * @returns {Promise<boolean>}
 */
export async function saveJapaneseTokensToCache(bookId, chapterId, textHash, tokens) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  const safeChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
  const safeHash = typeof textHash === 'string' ? textHash.trim() : '';
  if (!safeBookId || !safeChapterId || !safeHash) return false;
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  if (!tokens.every((token) => isValidToken(token))) return false;

  const entry = {
    id: createCacheId(safeBookId, safeChapterId, safeHash),
    bookId: safeBookId,
    chapterId: safeChapterId,
    tokenizerId: JA_TOKENIZER_ID,
    tokenizerVersion: JA_TOKENIZER_VERSION,
    dictVersion: JA_DICT_VERSION,
    textHash: safeHash,
    createdAt: new Date().toISOString(),
    tokens
  };

  return putJapaneseTokenCacheEntry(entry);
}

