import { getJapaneseTokenCacheEntry, saveJapaneseTokensToCache } from './japanese-token-cache.js';

/**
 * @param {any} error
 */
function markMissingTokensError(error) {
  try {
    error.code = 'JA_TOKENS_MISSING';
  } catch {
    // ignore
  }
  return error;
}

/**
 * @param {any} error
 * @returns {boolean}
 */
export function isJapaneseTokensMissingError(error) {
  return String(error?.code || '') === 'JA_TOKENS_MISSING';
}

async function tryHydrateTokensFromCloud({ bookId, chapterId, expectedTextHash }) {
  try {
    const { getCloudContext, isOnline } = await import('../../supabase/cloud-context.js');
    if (!isOnline()) return false;
    const ctx = await getCloudContext();
    if (!ctx?.user?.id) return false;

    const { downloadJapaneseTokens } = await import('../../supabase/processed-books-service.js');
    const payload = await downloadJapaneseTokens({ bookId, chapterId });
    const textHash = typeof payload?.textHash === 'string' ? payload.textHash : '';
    const tokens = Array.isArray(payload?.tokens) ? payload.tokens : [];

    if (!textHash || tokens.length === 0) return false;
    if (expectedTextHash && textHash !== expectedTextHash) {
      throw new Error(`Cloud Japanese tokens textHash mismatch (${textHash} != ${expectedTextHash})`);
    }

    await saveJapaneseTokensToCache(bookId, chapterId, textHash, tokens);
    return true;
  } catch (error) {
    if (String(error?.message || '').includes('textHash mismatch')) throw error;
    return false;
  }
}

/**
 * Cache-only tokenization for Japanese: no browser Kuromoji fallback.
 * @param {Object} args
 * @param {string} args.bookId
 * @param {string} args.chapterId
 * @param {string} args.textHash - fnv1a32 hash of canonicalText
 * @returns {Promise<{tokens: import('./japanese-token-types.js').JapaneseToken[], fromCache: boolean}>}
 */
export async function getJapaneseChapterTokens({ bookId, chapterId, textHash }) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  const safeChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
  const safeHash = typeof textHash === 'string' ? textHash.trim() : '';
  if (!safeBookId || !safeChapterId || !safeHash) {
    throw new Error('Missing bookId/chapterId/textHash for Japanese tokens');
  }

  const cached = await getJapaneseTokenCacheEntry(safeBookId, safeChapterId, safeHash);
  if (cached?.tokens?.length) {
    return { tokens: cached.tokens, fromCache: true };
  }

  const hydrated = await tryHydrateTokensFromCloud({
    bookId: safeBookId,
    chapterId: safeChapterId,
    expectedTextHash: safeHash
  });
  if (hydrated) {
    const nextCached = await getJapaneseTokenCacheEntry(safeBookId, safeChapterId, safeHash);
    if (nextCached?.tokens?.length) {
      return { tokens: nextCached.tokens, fromCache: true };
    }
  }

  throw markMissingTokensError(new Error('Japanese tokens not available in cache'));
}
