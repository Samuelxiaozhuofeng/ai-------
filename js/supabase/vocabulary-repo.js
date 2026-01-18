import { listVocabulary, upsertVocabularyItem, upsertVocabularyItems, deleteVocabularyItem } from '../db.js';
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
    lemma: item.lemma || null,
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
    lemma: row.lemma || null,
    status: row.status || null,
    context: row.context || null,
    analysis: row.analysis || null,
    sourceChapterId: row.source_chapter_id || null,
    createdAt: row.created_at || row.updated_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export async function upsertBookVocabularyItem(item) {
  const local = await upsertVocabularyItem(item);
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return local;

  const row = mapLocalBookVocabToRow(ctx.user.id, local);
  const { error } = await ctx.supabase.from('vocabulary').upsert([row], { onConflict: 'user_id,id' });
  if (error) console.warn('Supabase vocabulary upsert failed:', error);

  return local;
}

export async function upsertBookVocabularyItems(items) {
  const locals = await upsertVocabularyItems(items);
  const ctx = await getCloudContext();
  if (!ctx || !isOnline() || locals.length === 0) return locals;

  const rows = locals.map((item) => mapLocalBookVocabToRow(ctx.user.id, item));
  const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
  if (error) console.warn('Supabase vocabulary upsert failed:', error);

  return locals;
}

export async function deleteBookVocabularyItem(bookId, word) {
  await deleteVocabularyItem(bookId, word);

  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return true;

  const id = makeVocabId(bookId, word);
  const { error } = await ctx.supabase
    .from('vocabulary')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('kind', 'book')
    .eq('id', id);
  if (error) console.warn('Supabase vocabulary delete failed:', error);
  return true;
}

export async function listBookVocabulary(bookId, status = null) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return listVocabulary(bookId, status);

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
    return listVocabulary(bookId, status);
  }

  const mapped = (data || []).map(mapRowToLocalBookVocab);
  for (const remoteItem of mapped) {
    await upsertVocabularyItem(remoteItem);
  }

  return mapped;
}
