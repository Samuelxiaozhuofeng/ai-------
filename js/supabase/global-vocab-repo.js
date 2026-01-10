import { normalizeWord } from '../word-status.js';
import { getCloudContext, isOnline } from './cloud-context.js';

function toIso(value) {
  return typeof value === 'string' && value ? value : null;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function mapLocalGlobalVocabToRow(userId, item) {
  const language = typeof item?.language === 'string' ? item.language.trim() : '';
  const normalizedWord = normalizeWord(item?.normalizedWord || item?.word || '');
  const id = String(item?.id || '').trim();

  return {
    user_id: userId,
    id: id || (language && normalizedWord ? `${language}:${normalizedWord}` : normalizedWord),
    kind: 'global',
    book_id: null,
    language: language || null,
    word: normalizedWord || null,
    display_word: item?.displayWord || null,
    status: item?.status || null,
    source_books: Array.isArray(item?.sourceBooks) ? item.sourceBooks : [],
    meaning: item?.meaning || null,
    usage: item?.usage || null,
    contextual_meaning: item?.contextualMeaning || null,
    context_sentence: item?.contextSentence || null,

    due: toIso(item?.due),
    stability: asNumber(item?.stability),
    difficulty: asNumber(item?.difficulty),
    elapsed_days: asNumber(item?.elapsed_days),
    scheduled_days: asNumber(item?.scheduled_days),
    reps: asInt(item?.reps),
    lapses: asInt(item?.lapses),
    state: asInt(item?.state),
    last_review: toIso(item?.last_review),

    created_at: toIso(item?.createdAt) || toIso(item?.created_at) || new Date().toISOString(),
    updated_at: toIso(item?.updatedAt) || toIso(item?.updated_at) || new Date().toISOString()
  };
}

export function mapRowToLocalGlobalVocab(row) {
  const language = typeof row?.language === 'string' ? row.language.trim() : '';
  const normalizedWord = normalizeWord(row?.word || row?.normalized_word || row?.id || '');
  return {
    id: row.id,
    language: language || null,
    normalizedWord,
    displayWord: row.display_word || null,
    status: row.status || null,
    sourceBooks: Array.isArray(row.source_books) ? row.source_books : [],
    meaning: row.meaning || null,
    usage: row.usage || null,
    contextualMeaning: row.contextual_meaning || null,
    contextSentence: row.context_sentence || null,

    due: row.due || null,
    stability: typeof row.stability === 'number' ? row.stability : Number(row.stability || 0),
    difficulty: typeof row.difficulty === 'number' ? row.difficulty : Number(row.difficulty || 0),
    elapsed_days: typeof row.elapsed_days === 'number' ? row.elapsed_days : Number(row.elapsed_days || 0),
    scheduled_days: typeof row.scheduled_days === 'number' ? row.scheduled_days : Number(row.scheduled_days || 0),
    reps: typeof row.reps === 'number' ? row.reps : Number(row.reps || 0),
    lapses: typeof row.lapses === 'number' ? row.lapses : Number(row.lapses || 0),
    state: typeof row.state === 'number' ? row.state : Number(row.state || 0),
    last_review: row.last_review || null,

    createdAt: row.created_at || row.updated_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export async function upsertGlobalVocabRemote(item) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return null;
  const row = mapLocalGlobalVocabToRow(ctx.user.id, item);
  const { error } = await ctx.supabase.from('vocabulary').upsert(row, { onConflict: 'user_id,id' });
  if (error) console.warn('Supabase global vocab upsert failed:', error);
  return row;
}

export async function deleteGlobalVocabRemote(id) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return true;
  const key = String(id || '').trim();
  if (!key) return true;
  const { error } = await ctx.supabase.from('vocabulary').delete().eq('user_id', ctx.user.id).eq('id', key);
  if (error) console.warn('Supabase global vocab delete failed:', error);
  return true;
}

export async function pullGlobalVocabUpdates({ since = null } = {}) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return [];
  let query = ctx.supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('kind', 'global');
  if (since) query = query.gt('updated_at', since);
  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToLocalGlobalVocab);
}

