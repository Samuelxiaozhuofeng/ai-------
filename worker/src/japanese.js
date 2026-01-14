import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { canonicalizeText, hashCanonicalText, normalizeWord } from './text.js';

const NON_LEARNABLE_POS = new Set(['助詞', '助動詞', '補助記号', '空白']);

export const JA_TOKENIZER_ID = 'sudachipy';
export const JA_TOKENIZER_VERSION = '2';
export const JA_DICT_VERSION = 'sudachidict_core';

const SUDACHI_SCRIPT_PATH = fileURLToPath(new URL('./tokenizers/sudachi_tokenizer.py', import.meta.url));

/**
 * @param {any} tokenData
 */
function isLearnableWord(tokenData) {
  if (!tokenData?.pos) return false;
  if (NON_LEARNABLE_POS.has(tokenData.pos)) return false;
  const surface = typeof tokenData.surface === 'string' ? tokenData.surface : '';
  if (surface && surface.length === 1 && /[、。！？「」『』（）…・]/.test(surface)) return false;
  return true;
}

/**
 * @param {any} tokenData
 */
function getLemma(tokenData) {
  const basic = tokenData?.lemma;
  if (typeof basic === 'string' && basic && basic !== '*') return basic;
  const surface = tokenData?.surface;
  return typeof surface === 'string' ? surface : '';
}

/**
 * @param {string} text
 * @returns {Promise<any[]>}
 */
async function sudachiTokenize(text) {
  const safeText = typeof text === 'string' ? text : '';
  return await new Promise((resolve, reject) => {
    const python = spawn('python3', [SUDACHI_SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    python.stdout.setEncoding('utf8');
    python.stderr.setEncoding('utf8');

    python.stdout.on('data', (data) => {
      stdout += data;
    });

    python.stderr.on('data', (data) => {
      stderr += data;
    });

    python.on('error', (error) => reject(error));

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Sudachi tokenizer failed (code=${code}): ${stderr || 'unknown error'}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        reject(new Error(`Failed to parse Sudachi tokenizer output: ${error?.message || String(error)}`));
      }
    });

    try {
      python.stdin.write(safeText);
      python.stdin.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Split text into chunks that fit within Sudachi's byte limit (~45KB to be safe).
 * Tries to split at sentence boundaries (。) when possible.
 * @param {string} text
 * @param {number} maxBytes
 * @returns {Array<{text: string, offset: number}>}
 */
function splitTextIntoChunks(text, maxBytes = 45000) {
  const chunks = [];
  const encoder = new TextEncoder();

  let currentOffset = 0;

  while (currentOffset < text.length) {
    let endOffset = text.length;
    let chunk = text.slice(currentOffset, endOffset);

    // If chunk is too large, find a good split point
    while (encoder.encode(chunk).length > maxBytes && chunk.length > 0) {
      // Try to find the last sentence boundary
      const lastSentence = chunk.lastIndexOf('。');
      if (lastSentence > 0) {
        endOffset = currentOffset + lastSentence + 1;
      } else {
        // No sentence boundary, just split at maxBytes character estimate
        const estimatedChars = Math.floor(chunk.length * maxBytes / encoder.encode(chunk).length);
        endOffset = currentOffset + Math.max(1, estimatedChars);
      }
      chunk = text.slice(currentOffset, endOffset);
    }

    if (chunk.length > 0) {
      chunks.push({ text: chunk, offset: currentOffset });
      currentOffset = endOffset;
    } else {
      // Safety: if we can't make progress, skip one character
      currentOffset++;
    }
  }

  return chunks;
}

/**
 * Tokenize canonicalText into offsets-aligned tokens.
 * Handles long texts by splitting into chunks.
 * @param {string} canonicalText
 */
export async function tokenizeJapaneseCanonicalText(canonicalText) {
  const safeText = canonicalizeText(canonicalText);
  const textHash = hashCanonicalText(safeText);

  /** @type {Array<{surface: string, lemma: string, reading: string|null, pos: string|null, posDetail: string|null, isWord: boolean, start: number, end: number}>} */
  const out = [];

  // Check if we need to chunk the text
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(safeText).length;
  const MAX_SUDACHI_BYTES = 45000; // Conservative limit to avoid Sudachi's 49KB limit

  let allRawTokens = [];

  if (textBytes > MAX_SUDACHI_BYTES) {
    // Process in chunks
    const chunks = splitTextIntoChunks(safeText, MAX_SUDACHI_BYTES);
    console.log(`[tokenizer] Text too large (${textBytes} bytes), splitting into ${chunks.length} chunks`);

    for (const chunk of chunks) {
      const chunkTokens = await sudachiTokenize(chunk.text);
      // Adjust offsets to account for chunk position
      for (const token of chunkTokens) {
        if (token && typeof token === 'object') {
          token.start = (token.start || 0) + chunk.offset;
          token.end = (token.end || 0) + chunk.offset;
        }
      }
      allRawTokens.push(...chunkTokens);
    }
  } else {
    // Process as single text
    allRawTokens = await sudachiTokenize(safeText);
  }

  for (const raw of allRawTokens) {
    if (!raw || typeof raw !== 'object') continue;
    const surface = typeof raw.surface === 'string' ? raw.surface : '';
    if (!surface) continue;

    const start = Number(raw.start);
    const end = Number(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
    if (end > safeText.length) continue;
    if (safeText.slice(start, end) !== surface) continue;

    const lemmaRaw = getLemma(raw) || surface;
    const normalizedLemma = normalizeWord(lemmaRaw) || normalizeWord(surface) || '';
    if (!normalizedLemma) continue;

    const reading = typeof raw.reading === 'string' && raw.reading && raw.reading !== '*'
      ? raw.reading
      : null;
    const pos = typeof raw.pos === 'string' && raw.pos && raw.pos !== '*'
      ? raw.pos
      : null;
    const posDetail = typeof raw.posDetail === 'string' && raw.posDetail && raw.posDetail !== '*'
      ? raw.posDetail
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

  return {
    textHash,
    tokens: out,
    tokenizer: { id: JA_TOKENIZER_ID, version: JA_TOKENIZER_VERSION, dictVersion: JA_DICT_VERSION }
  };
}
