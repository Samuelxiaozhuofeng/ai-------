/**
 * Word Status Module
 * Provides vocabulary status types, normalization, and helpers.
 */

/**
 * @typedef {'new' | 'seen' | 'learning' | 'known'} WordStatus
 */

export const WORD_STATUSES = /** @type {const} */ ({
  NEW: 'new',
  SEEN: 'seen',
  LEARNING: 'learning',
  KNOWN: 'known'
});

const FALLBACK_STRIP_LEADING = /^[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/i;
const FALLBACK_STRIP_TRAILING = /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+$/i;

/** @type {{leading:RegExp,trailing:RegExp}|null} */
let UNICODE_STRIP = null;
try {
  UNICODE_STRIP = {
    leading: /^[^\p{L}\p{N}]+/u,
    trailing: /[^\p{L}\p{N}]+$/u
  };
} catch {
  UNICODE_STRIP = null;
}

/**
 * Normalize a word for consistent matching/storage.
 * Keeps letters/numbers across scripts; strips leading/trailing punctuation while preserving in-word apostrophes/dashes.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeWord(raw) {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  const leading = UNICODE_STRIP?.leading || FALLBACK_STRIP_LEADING;
  const trailing = UNICODE_STRIP?.trailing || FALLBACK_STRIP_TRAILING;
  return trimmed.replace(leading, '').replace(trailing, '');
}

/**
 * Create a stable ID for a vocabulary entry (unique per book + normalized word).
 * @param {string} bookId
 * @param {string} word
 * @returns {string}
 */
export function makeVocabId(bookId, word) {
  return `${bookId}:${normalizeWord(word)}`;
}

/**
 * Map a word status to its CSS class.
 * @param {WordStatus} status
 * @returns {string}
 */
export function statusToClass(status) {
  if (status === WORD_STATUSES.SEEN) return 'word-seen';
  if (status === WORD_STATUSES.LEARNING) return 'word-learning';
  if (status === WORD_STATUSES.KNOWN) return 'word-known';
  return 'word-new';
}
