/* global kuromoji, Kuroshiro, KuromojiAnalyzer */

let tokenizer = null;
let initPromise = null;
let lastDicPath = null;

function loadVendorScripts() {
  // Relative to: js/tokenizers/japanese/japanese-tokenizer.worker.js
  importScripts(
    '../../../vendor/kuromoji/kuromoji.js',
    '../../../vendor/kuroshiro/kuroshiro.js',
    '../../../vendor/kuroshiro/kuroshiro-analyzer-kuromoji.js'
  );
}

function ensureTokenizer(dicPath) {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    try {
      loadVendorScripts();
    } catch (error) {
      initPromise = null;
      reject(error);
      return;
    }

    if (!self.kuromoji?.builder) {
      initPromise = null;
      reject(new Error('Kuromoji not available in worker'));
      return;
    }

    const path = typeof dicPath === 'string' && dicPath ? dicPath : null;
    if (!path) {
      initPromise = null;
      reject(new Error('Missing dicPath for Kuromoji'));
      return;
    }

    self.kuromoji.builder({ dicPath: path }).build((error, builtTokenizer) => {
      if (error) {
        initPromise = null;
        reject(error);
        return;
      }

      tokenizer = builtTokenizer || null;
      if (!tokenizer?.tokenize) {
        initPromise = null;
        reject(new Error('Kuromoji tokenizer build failed'));
        return;
      }

      // Kuroshiro is optional in MVP; initialize lazily later if needed.
      resolve(tokenizer);
    });
  });

  return initPromise;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 * @param {any[]} raw
 * @param {number} startOffset
 * @returns {any[]}
 */
function attachOffsets(text, raw, startOffset) {
  const result = [];
  const base = Math.max(0, Number(startOffset) || 0);

  let cursor = 0;
  for (const token of raw) {
    if (!token || typeof token !== 'object') continue;
    const surface = typeof token.surface_form === 'string' ? token.surface_form : '';
    if (!surface) continue;

    let startRel = null;
    const wordPosition = safeNumber(token.word_position);
    if (wordPosition != null && wordPosition >= 1) {
      startRel = wordPosition - 1;
    } else {
      const foundAt = text.indexOf(surface, cursor);
      if (foundAt >= 0) startRel = foundAt;
    }

    if (startRel == null || startRel < 0) continue;

    const endRel = startRel + surface.length;
    cursor = Math.max(cursor, endRel);

    result.push({
      surface_form: surface,
      basic_form: token.basic_form ?? null,
      reading: token.reading ?? null,
      pos: token.pos ?? null,
      pos_detail_1: token.pos_detail_1 ?? null,
      pos_detail_2: token.pos_detail_2 ?? null,
      pos_detail_3: token.pos_detail_3 ?? null,
      start: base + startRel,
      end: base + endRel
    });
  }

  return result;
}

async function handleInit(message) {
  const dicPath = message?.dicPath || null;
  // Keep init lightweight: ensure vendor scripts are loaded and kick off tokenizer build in the background.
  // The first tokenize call will await the same initPromise and block until ready.
  lastDicPath = typeof dicPath === 'string' && dicPath ? dicPath : lastDicPath;
  try {
    loadVendorScripts();
  } catch (error) {
    throw error;
  }
  if (!self.kuromoji?.builder) {
    throw new Error('Kuromoji not available in worker');
  }
  if (lastDicPath) {
    // Fire-and-forget warm-up.
    void ensureTokenizer(lastDicPath);
  }
  return { ok: true, warming: Boolean(lastDicPath) };
}

async function handleTokenize(message) {
  const dicPath = message?.dicPath || lastDicPath || null;
  lastDicPath = typeof dicPath === 'string' && dicPath ? dicPath : lastDicPath;
  await ensureTokenizer(dicPath);

  const paragraphs = Array.isArray(message?.paragraphs) ? message.paragraphs : [];
  /** @type {any[]} */
  const all = [];

  for (const para of paragraphs) {
    const text = typeof para?.text === 'string' ? para.text : '';
    if (!text) continue;
    const startOffset = Number(para?.startOffset) || 0;
    const raw = tokenizer.tokenize(text) || [];
    const withOffsets = attachOffsets(text, raw, startOffset);
    all.push(...withOffsets);
  }

  return { tokens: all };
}

self.onmessage = (event) => {
  const message = event?.data || null;
  const requestId = message?.requestId ?? null;
  const type = message?.type || '';

  const respond = (payload) => {
    self.postMessage({ requestId, ...payload });
  };

  (async () => {
    try {
      if (type === 'init') {
        const result = await handleInit(message);
        respond({ type: 'ready', ...result });
        return;
      }

      if (type === 'tokenize') {
        const result = await handleTokenize(message);
        respond({ type: 'tokenizeResult', ...result });
        return;
      }

      respond({ type: 'error', error: 'Unknown message type' });
    } catch (error) {
      respond({
        type: 'error',
        error: error?.message || String(error || 'Worker error')
      });
    }
  })();
};
