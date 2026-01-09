import { listGlobalVocab } from '../db.js';

/** @type {Map<string, any>} */
export let globalVocabByWord = new Map(); // globalId -> global vocab entry

export async function refreshGlobalVocabCache() {
  try {
    const items = await listGlobalVocab();
    globalVocabByWord = new Map(items.map((item) => [item.id || item.normalizedWord, item]));
  } catch (error) {
    console.warn('Failed to refresh global vocabulary cache:', error);
    globalVocabByWord = new Map();
  }
  return globalVocabByWord;
}

