import { listVocabulary, upsertVocabularyItem, upsertVocabularyItems, deleteVocabularyItem, getVocabularyItem } from '../db.js';
import { makeVocabId, normalizeWord } from '../word-status.js';
import { getCloudContext, isOnline } from './cloud-context.js';

function toIso(value) {
  return typeof value === 'string' && value ? value : null;
}

function mapLocalBookVocabToRow(userId, item) {
  return {
    user_id: userId,
    id: item.id || makeVocabId(item.bookId, item.word),
    kind: 'book',
    book_id: item.bookId,
    language: item.language || null,
    word: item.word,
    display_word: item.displayWord || null,
    status: item.status || null,
    context: item.context || null,
    analysis: item.analysis || null,
    source_chapter_id: item.sourceChapterId || null,
    created_at: toIso(item.createdAt) || new Date().toISOString(),
    updated_at: toIso(item.updatedAt) || new Date().toISOString()
  };
}

export function mapRowToLocalBookVocab(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    language: row.language || null,
    word: normalizeWord(row.word || ''),
    displayWord: row.display_word || null,
    status: row.status || null,
    context: row.context || null,
    analysis: row.analysis || null,
    sourceChapterId: row.source_chapter_id || null,
    createdAt: row.created_at || row.updated_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

let pendingUpserts = [];
let flushTimer = null;

async function flushPendingUpserts() {
  flushTimer = null;
  const batch = pendingUpserts;
  pendingUpserts = [];
  if (batch.length === 0) return;

  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return;

  const rows = batch.map((item) => mapLocalBookVocabToRow(ctx.user.id, item));
  const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
  if (error) {
    console.warn('Supabase vocabulary upsert failed:', error);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushPendingUpserts();
  }, 1200);
}

export async function upsertBookVocabularyItem(item) {
  const local = await upsertVocabularyItem(item);

  const ctx = await getCloudContext();
  if (ctx && isOnline()) {
    pendingUpserts.push(local);
    scheduleFlush();
  }

  return local;
}

export async function upsertBookVocabularyItems(items) {
  const locals = await upsertVocabularyItems(items);

  const ctx = await getCloudContext();
  if (ctx && isOnline() && locals.length > 0) {
    pendingUpserts.push(...locals);
    scheduleFlush();
  }

  return locals;
}

export async function deleteBookVocabularyItem(bookId, word) {
  await deleteVocabularyItem(bookId, word);

  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return true;

  const id = makeVocabId(bookId, word);
  const { error } = await ctx.supabase.from('vocabulary').delete().eq('user_id', ctx.user.id).eq('id', id);
  if (error) console.warn('Supabase vocabulary delete failed:', error);
  return true;
}

export async function listBookVocabulary(bookId, status = null) {
  const local = await listVocabulary(bookId, status);

  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return local;

  let query = ctx.supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('kind', 'book')
    .eq('book_id', bookId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) {
    console.warn('Supabase vocabulary select failed:', error);
    return local;
  }

  for (const row of data || []) {
    const remoteItem = mapRowToLocalBookVocab(row);
    const existing = await getVocabularyItem(remoteItem.bookId, remoteItem.word).catch(() => null);
    const localUpdatedAt = existing?.updatedAt || '';
    if (!localUpdatedAt || String(remoteItem.updatedAt) > String(localUpdatedAt)) {
      await upsertVocabularyItem(remoteItem);
    }
  }

  return listVocabulary(bookId, status);
}

export async function pullBookVocabularyUpdates({ bookId, since = null } = {}) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return [];

  let query = ctx.supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('kind', 'book')
    .eq('book_id', bookId);
  if (since) query = query.gt('updated_at', since);

  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToLocalBookVocab);
}
