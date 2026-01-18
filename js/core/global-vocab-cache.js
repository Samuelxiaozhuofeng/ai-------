import { listGlobalVocab, upsertGlobalVocabItem } from '../db.js';
import { listGlobalVocabRemote } from '../supabase/global-vocab-repo.js';

/** @type {Map<string, any>} */
export let globalVocabByWord = new Map(); // globalId -> global vocab entry

export async function refreshGlobalVocabCache() {
  try {
    let remoteItems = [];
    try {
      remoteItems = await listGlobalVocabRemote();
    } catch (error) {
      console.warn('Failed to fetch global vocabulary from Supabase:', error);
    }

    if (remoteItems.length > 0) {
      for (const item of remoteItems) {
        await upsertGlobalVocabItem({ ...item, _skipRemote: true });
      }
    }

    const items = await listGlobalVocab();
    globalVocabByWord = new Map((items || []).map((item) => [item.id || item.normalizedWord, item]));
  } catch (error) {
    console.warn('Failed to refresh global vocabulary cache:', error);
    globalVocabByWord = new Map();
  }
  return globalVocabByWord;
}
