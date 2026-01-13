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

const DEFAULT_INIT_TIMEOUT_MS = 12000;
const DEFAULT_TOKENIZE_TIMEOUT_MS = 20000;

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
    if (entry.timer != null) clearTimeout(entry.timer);
    entry.reject(new Error('Japanese tokenizer worker terminated'));
    pending.delete(id);
  }
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./japanese-tokenizer.worker.js', import.meta.url));
  worker.onmessage = (event) => {
    const message = event?.data || null;
    const requestId = Number(message?.requestId) || 0;
    const entry = pending.get(requestId) || null;
    if (!entry) return;
    pending.delete(requestId);
    if (entry.timer != null) clearTimeout(entry.timer);

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
    const timer = window.setTimeout(() => {
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
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function ensureWorkerReady() {
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async () => {
    try {
      const response = await postToWorker('init', {}, DEFAULT_INIT_TIMEOUT_MS);
      if (response?.type !== 'ready') throw new Error('Japanese tokenizer worker init failed');
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
 * @param {import('./japanese-token-types.js').JapaneseToken[]} tokens
 * @returns {import('./japanese-token-types.js').JapaneseToken[]}
 */
function sortAndDedupeTokens(tokens) {
  const sorted = Array.isArray(tokens) ? [...tokens] : [];
  sorted.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  /** @type {import('./japanese-token-types.js').JapaneseToken[]} */
  const out = [];
  let lastKey = '';
  for (const token of sorted) {
    if (!isValidToken(token)) continue;
    const key = `${token.start}:${token.end}:${token.lemma}:${token.surface}`;
    if (key === lastKey) continue;
    lastKey = key;
    out.push(token);
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

  const cached = await getJapaneseTokenCacheEntry(safeBookId, safeChapterId, safeHash);
  if (cached?.tokens?.length) {
    return { tokens: cached.tokens, fromCache: true };
  }

  await ensureWorkerReady();

  const paraPayload = Array.isArray(paragraphs)
    ? paragraphs.map((p) => ({
      text: typeof p?.text === 'string' ? p.text : '',
      startOffset: Number(p?.startOffset) || 0
    }))
    : [];

  const response = await postToWorker(
    'tokenize',
    { paragraphs: paraPayload },
    DEFAULT_TOKENIZE_TIMEOUT_MS
  );

  const rawTokens = Array.isArray(response?.tokens) ? response.tokens : [];
  const normalized = sortAndDedupeTokens(normalizeWorkerTokens(rawTokens));

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

