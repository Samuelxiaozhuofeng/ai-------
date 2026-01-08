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

/**
 * Normalize a word for consistent matching/storage.
 * Keeps letters/numbers and common in-word punctuation like apostrophes.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeWord(raw) {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  // Remove leading/trailing punctuation while preserving in-word apostrophes/dashes.
  return trimmed
    .replace(/^[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/i, '')
    .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+$/i, '');
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
