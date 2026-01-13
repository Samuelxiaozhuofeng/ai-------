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
 * Tokenize canonicalText into offsets-aligned tokens.
 * @param {string} canonicalText
 */
export async function tokenizeJapaneseCanonicalText(canonicalText) {
  const safeText = canonicalizeText(canonicalText);
  const textHash = hashCanonicalText(safeText);

  /** @type {Array<{surface: string, lemma: string, reading: string|null, pos: string|null, posDetail: string|null, isWord: boolean, start: number, end: number}>} */
  const out = [];

  /** @type {any[]} */
  const rawTokens = await sudachiTokenize(safeText);

  for (const raw of rawTokens) {
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
