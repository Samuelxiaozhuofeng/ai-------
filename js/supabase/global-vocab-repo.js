import { normalizeWord } from '../word-status.js';
import { getCloudContext, isOnline } from './cloud-context.js';
import { loadPendingDeletes, savePendingDeletes } from './pending-deletes.js';

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
    lemma: item?.lemma || null,
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
    lemma: row.lemma || null,
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

/** @type {Map<string, any>} */
let pendingUpsertsById = new Map();
/** @type {Map<string, string>} */
let pendingDeletesById = new Map();
let loadedDeletesForUserId = null;
let flushTimer = null;
let flushInFlight = false;
let retryDelayMs = 1500;
const maxRetryDelayMs = 30_000;
let hasOnlineListener = false;

function ensureOnlineListener() {
  if (hasOnlineListener) return;
  if (typeof window === 'undefined') return;
  hasOnlineListener = true;
  window.addEventListener(
    'online',
    () => {
      scheduleFlush(0);
    },
    { passive: true }
  );
}

function getDeletesStorageKey(userId) {
  return `language-reader-supabase-pending-deletes:global-vocabulary:${userId}`;
}

function ensureDeletesLoaded(userId) {
  if (!userId) return;
  if (loadedDeletesForUserId === userId) return;
  loadedDeletesForUserId = userId;
  pendingDeletesById = loadPendingDeletes(getDeletesStorageKey(userId));
}

function persistDeletes(userId) {
  if (!userId) return;
  savePendingDeletes(getDeletesStorageKey(userId), pendingDeletesById);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function flushPending(ctx) {
  if (flushInFlight) return;
  flushInFlight = true;
  flushTimer = null;
  try {
    ensureDeletesLoaded(ctx.user.id);

    if (!isOnline()) {
      ensureOnlineListener();
      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      return;
    }

    if (pendingDeletesById.size > 0) {
      const entries = Array.from(pendingDeletesById.entries());
      const ids = entries.map(([id]) => id);
      /** @type {Set<string>} */
      const doneIds = new Set();

      for (const batchIds of chunk(ids, 100)) {
        const { data, error } = await ctx.supabase
          .from('vocabulary')
          .select('id,updated_at')
          .eq('user_id', ctx.user.id)
          .eq('kind', 'global')
          .in('id', batchIds);
        if (error) throw error;

        const remoteUpdatedAtById = new Map((data || []).map((row) => [row.id, row.updated_at || '']));
        const idsToDelete = [];
        for (const id of batchIds) {
          const deletedAt = pendingDeletesById.get(id) || '';
          const remoteUpdatedAt = remoteUpdatedAtById.get(id) || '';
          if (!remoteUpdatedAt) {
            doneIds.add(id);
            continue;
          }
          if (String(remoteUpdatedAt) <= String(deletedAt)) {
            idsToDelete.push(id);
          } else {
            doneIds.add(id);
          }
        }

        if (idsToDelete.length > 0) {
          const { error: deleteError } = await ctx.supabase
            .from('vocabulary')
            .delete()
            .eq('user_id', ctx.user.id)
            .eq('kind', 'global')
            .in('id', idsToDelete);
          if (deleteError) throw deleteError;
          idsToDelete.forEach((id) => doneIds.add(id));
        }
      }

      let changed = false;
      for (const id of doneIds) {
        if (pendingDeletesById.delete(id)) changed = true;
      }
      if (changed) persistDeletes(ctx.user.id);
    }

    if (pendingUpsertsById.size > 0) {
      const entries = Array.from(pendingUpsertsById.entries());
      const rows = entries.map(([, item]) => mapLocalGlobalVocabToRow(ctx.user.id, item));
      const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;

      for (const [id, sentItem] of entries) {
        const current = pendingUpsertsById.get(id);
        if (!current) continue;
        const currentUpdatedAt = current?.updatedAt || current?.updated_at || '';
        const sentUpdatedAt = sentItem?.updatedAt || sentItem?.updated_at || '';
        if (String(currentUpdatedAt) <= String(sentUpdatedAt)) {
          pendingUpsertsById.delete(id);
        }
      }
    }

    retryDelayMs = 1500;
    if (pendingDeletesById.size > 0 || pendingUpsertsById.size > 0) scheduleFlush(250);
  } catch (error) {
    console.warn('Supabase global vocab sync failed:', error);
    scheduleFlush(retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
  } finally {
    flushInFlight = false;
  }
}

function scheduleFlush(delayMs = 1200) {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    const ctx = await getCloudContext();
    if (!ctx) return;
    void flushPending(ctx);
  }, Math.max(0, delayMs));
}

export async function flushGlobalVocabPendingNow() {
  const ctx = await getCloudContext();
  if (!ctx) return;
  await flushPending(ctx);
}

export async function queueGlobalVocabUpsert(item) {
  const ctx = await getCloudContext();
  if (!ctx) return null;
  const row = mapLocalGlobalVocabToRow(ctx.user.id, item);
  ensureDeletesLoaded(ctx.user.id);
  if (pendingDeletesById.delete(row.id)) persistDeletes(ctx.user.id);
  pendingUpsertsById.set(row.id, item);
  scheduleFlush(0);
  return row;
}

export async function queueGlobalVocabDelete(id, deletedAt = null) {
  const ctx = await getCloudContext();
  if (!ctx) return true;
  const key = String(id || '').trim();
  if (!key) return true;
  ensureDeletesLoaded(ctx.user.id);
  pendingUpsertsById.delete(key);
  pendingDeletesById.set(key, deletedAt || new Date().toISOString());
  persistDeletes(ctx.user.id);
  scheduleFlush(0);
  return true;
}

export async function upsertGlobalVocabRemote(item) {
  return queueGlobalVocabUpsert(item);
}

export async function deleteGlobalVocabRemote(id) {
  return queueGlobalVocabDelete(id);
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
