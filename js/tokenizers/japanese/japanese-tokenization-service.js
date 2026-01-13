import { normalizeWord } from '../../word-status.js';
import { getJapaneseTokenCacheEntry, saveJapaneseTokensToCache } from './japanese-token-cache.js';
import {
  JA_DICT_VERSION,
  JA_TOKENIZER_ID,
  JA_TOKENIZER_VERSION,
  getLemma,
  isLearnableWord,
  isValidToken
} from './japanese-token-types.js';

// First-time Kuromoji init loads and inflates multiple .gz dictionary files and can be slow on mobile.
const DEFAULT_INIT_TIMEOUT_MS = 90000;
// Tokenization may include first-time dict downloads + decompression and can take minutes on slow devices/networks.
const DEFAULT_TOKENIZE_TIMEOUT_MS = 8 * 60 * 1000;

const MAX_SEGMENT_CHARS = 8000;
const MAX_BATCH_CHARS = 50000;
const MAX_BATCH_SEGMENTS = 24;

let worker = null;
let workerInitPromise = null;
let requestSeq = 0;
/** @type {Map<number, {resolve: Function, reject: Function, timer: number | null}>} */
const pending = new Map();

function makeDicPath() {
  // Worker is located under js/tokenizers/japanese/, so '../../../vendor/kuromoji/dict/' reaches root vendor.
  return new URL('../../../vendor/kuromoji/dict/', import.meta.url).toString();
}

function terminateWorker() {
  try {
    worker?.terminate?.();
  } catch {
    // ignore
  }
  worker = null;
  workerInitPromise = null;
  for (const [id, entry] of pending.entries()) {
    if (entry.timer != null) globalThis.clearTimeout(entry.timer);
    entry.reject(new Error('Japanese tokenizer worker terminated'));
    pending.delete(id);
  }
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./japanese-tokenizer.worker.js', import.meta.url));
  worker.onmessage = (event) => {
    const message = event?.data || null;
    if (message?.type === 'debug') {
      const msg = typeof message?.message === 'string' ? message.message : 'debug';
      console.debug('[ja-tokenizer]', msg, message?.extra || null);
      return;
    }
    const requestId = Number(message?.requestId) || 0;
    const entry = pending.get(requestId) || null;
    if (!entry) return;
    pending.delete(requestId);
    if (entry.timer != null) globalThis.clearTimeout(entry.timer);

    if (message?.type === 'error') {
      entry.reject(new Error(message?.error || 'Japanese tokenizer worker error'));
      return;
    }

    entry.resolve(message);
  };
  worker.onerror = () => {
    terminateWorker();
  };
  return worker;
}

function postToWorker(type, payload, timeoutMs) {
  const w = ensureWorker();
  const requestId = ++requestSeq;

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Japanese tokenizer worker timeout: ${type}`));
    }, Math.max(1000, Number(timeoutMs) || DEFAULT_TOKENIZE_TIMEOUT_MS));

    pending.set(requestId, { resolve, reject, timer });
    try {
      w.postMessage({
        type,
        requestId,
        dicPath: makeDicPath(),
        ...payload
      });
    } catch (error) {
      pending.delete(requestId);
      globalThis.clearTimeout(timer);
      reject(error);
    }
  });
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
    // If we got a concrete mismatch, surface it; otherwise allow fallback to local worker tokenization.
    if (String(error?.message || '').includes('textHash mismatch')) throw error;
    return false;
  }
}

async function ensureWorkerReady() {
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async () => {
    try {
      console.debug('[ja-tokenizer] init:start');
      const response = await postToWorker('init', {}, DEFAULT_INIT_TIMEOUT_MS);
      if (response?.type !== 'ready') throw new Error('Japanese tokenizer worker init failed');
      console.debug('[ja-tokenizer] init:ready', { warming: Boolean(response?.warming) });
      return true;
    } catch (error) {
      terminateWorker();
      throw error;
    }
  })();

  return workerInitPromise;
}

/**
 * Convert raw worker tokens into stable JapaneseToken objects.
 * @param {any[]} rawTokens
 * @returns {import('./japanese-token-types.js').JapaneseToken[]}
 */
function normalizeWorkerTokens(rawTokens) {
  const out = [];
  if (!Array.isArray(rawTokens)) return out;

  for (const raw of rawTokens) {
    if (!raw || typeof raw !== 'object') continue;
    const surface = typeof raw.surface_form === 'string' ? raw.surface_form : '';
    if (!surface) continue;

    const start = Number(raw.start);
    const end = Number(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;

    const lemmaRaw = getLemma(raw) || surface;
    const lemma = typeof lemmaRaw === 'string' ? lemmaRaw : surface;
    const normalizedLemma = normalizeWord(lemma) || normalizeWord(surface) || '';
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

  return out;
}

/**
 * Split very long segments to reduce postMessage payload size and avoid long blocking tokenization on huge chapters.
 * Attempts to split on Japanese punctuation before falling back to hard splits.
 * @param {string} text
 * @param {number} startOffset
 * @returns {{text: string, startOffset: number}[]}
 */
function splitSegment(text, startOffset) {
  const safeText = typeof text === 'string' ? text : '';
  if (!safeText) return [];
  const base = Math.max(0, Number(startOffset) || 0);
  if (safeText.length <= MAX_SEGMENT_CHARS) return [{ text: safeText, startOffset: base }];

  /** @type {{text: string, startOffset: number}[]} */
  const out = [];
  let cursor = 0;
  while (cursor < safeText.length) {
    const remaining = safeText.length - cursor;
    if (remaining <= MAX_SEGMENT_CHARS) {
      out.push({ text: safeText.slice(cursor), startOffset: base + cursor });
      break;
    }

    const windowEnd = cursor + MAX_SEGMENT_CHARS;
    const probe = safeText.slice(cursor, windowEnd);
    let splitAt = -1;
    splitAt = Math.max(splitAt, probe.lastIndexOf('。'));
    splitAt = Math.max(splitAt, probe.lastIndexOf('！'));
    splitAt = Math.max(splitAt, probe.lastIndexOf('？'));
    splitAt = Math.max(splitAt, probe.lastIndexOf('、'));
    splitAt = Math.max(splitAt, probe.lastIndexOf('\n'));

    const chunkLen = splitAt >= 0 ? (splitAt + 1) : MAX_SEGMENT_CHARS;
    out.push({ text: safeText.slice(cursor, cursor + chunkLen), startOffset: base + cursor });
    cursor += chunkLen;
  }

  return out;
}

/**
 * Tokenize Japanese chapter by paragraph (Worker) with IndexedDB cache.
 * @param {Object} args
 * @param {string} args.bookId
 * @param {string} args.chapterId
 * @param {string} args.textHash - fnv1a32 hash of canonicalText
 * @param {{text: string, startOffset: number}[]} args.paragraphs
 * @returns {Promise<{tokens: import('./japanese-token-types.js').JapaneseToken[], fromCache: boolean}>}
 */
export async function tokenizeJapaneseChapter({ bookId, chapterId, textHash, paragraphs }) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  const safeChapterId = typeof chapterId === 'string' ? chapterId.trim() : '';
  const safeHash = typeof textHash === 'string' ? textHash.trim() : '';
  if (!safeBookId || !safeChapterId || !safeHash) {
    throw new Error('Missing bookId/chapterId/textHash for Japanese tokenization');
  }
  if (globalThis.location?.protocol === 'file:') {
    throw new Error('Japanese tokenization requires serving files over http(s) (not file://)');
  }

  const cached = await getJapaneseTokenCacheEntry(safeBookId, safeChapterId, safeHash);
  if (cached?.tokens?.length) {
    return { tokens: cached.tokens, fromCache: true };
  }

  // Prefer cloud precomputed tokens (no Kuromoji dict downloads in browser).
  const hydrated = await tryHydrateTokensFromCloud({ bookId: safeBookId, chapterId: safeChapterId, expectedTextHash: safeHash });
  if (hydrated) {
    const nextCached = await getJapaneseTokenCacheEntry(safeBookId, safeChapterId, safeHash);
    if (nextCached?.tokens?.length) {
      return { tokens: nextCached.tokens, fromCache: true };
    }
  }

  await ensureWorkerReady();

  /** @type {{text: string, startOffset: number}[]} */
  const segments = [];
  if (Array.isArray(paragraphs)) {
    paragraphs.forEach((p) => {
      const text = typeof p?.text === 'string' ? p.text : '';
      const startOffset = Number(p?.startOffset) || 0;
      if (!text) return;
      splitSegment(text, startOffset).forEach((piece) => segments.push(piece));
    });
  }

  /** @type {import('./japanese-token-types.js').JapaneseToken[]} */
  const normalized = [];
  let segmentIndex = 0;
  const startedAt = Date.now();

  while (segmentIndex < segments.length) {
    /** @type {{text: string, startOffset: number}[]} */
    const batch = [];
    let batchChars = 0;

    while (
      segmentIndex < segments.length
      && batch.length < MAX_BATCH_SEGMENTS
      && batchChars < MAX_BATCH_CHARS
    ) {
      const seg = segments[segmentIndex];
      const segText = seg?.text || '';
      if (!segText) {
        segmentIndex += 1;
        continue;
      }
      if (batch.length > 0 && (batchChars + segText.length) > MAX_BATCH_CHARS) break;
      batch.push({ text: segText, startOffset: seg.startOffset });
      batchChars += segText.length;
      segmentIndex += 1;
    }

    const response = await postToWorker('tokenize', { paragraphs: batch }, DEFAULT_TOKENIZE_TIMEOUT_MS);
    const rawTokens = Array.isArray(response?.tokens) ? response.tokens : [];
    const batchTokens = normalizeWorkerTokens(rawTokens);
    batchTokens.forEach((token) => {
      if (isValidToken(token)) normalized.push(token);
    });

    if (segmentIndex < segments.length) {
      console.debug('[ja-tokenizer] progress', {
        segmentsDone: segmentIndex,
        segmentsTotal: segments.length,
        tokens: normalized.length,
        elapsedMs: Date.now() - startedAt
      });
      await new Promise((r) => globalThis.setTimeout(r, 0));
    }
  }

  if (normalized.length === 0) {
    throw new Error('Japanese tokenizer returned no tokens');
  }

  await saveJapaneseTokensToCache(safeBookId, safeChapterId, safeHash, normalized);
  return { tokens: normalized, fromCache: false };
}

export function getJapaneseTokenizerMeta() {
  return {
    tokenizerId: JA_TOKENIZER_ID,
    tokenizerVersion: JA_TOKENIZER_VERSION,
    dictVersion: JA_DICT_VERSION
  };
}
