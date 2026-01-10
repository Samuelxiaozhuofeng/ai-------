import { listVocabulary, upsertVocabularyItem, upsertVocabularyItems, deleteVocabularyItem, getVocabularyItem } from '../db.js';
import { makeVocabId, normalizeWord } from '../word-status.js';
import { getCloudContext, isOnline } from './cloud-context.js';
import { loadPendingDeletes, savePendingDeletes } from './pending-deletes.js';

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
  return `language-reader-supabase-pending-deletes:book-vocabulary:${userId}`;
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

async function flushPendingDeletes(ctx) {
  ensureDeletesLoaded(ctx.user.id);
  if (pendingDeletesById.size === 0) return true;

  const entries = Array.from(pendingDeletesById.entries());
  const ids = entries.map(([id]) => id);

  /** @type {Set<string>} */
  const doneIds = new Set();

  for (const batchIds of chunk(ids, 100)) {
    const { data, error } = await ctx.supabase
      .from('vocabulary')
      .select('id,updated_at')
      .eq('user_id', ctx.user.id)
      .eq('kind', 'book')
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
        .eq('kind', 'book')
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
  return true;
}

async function flushPendingUpserts() {
  flushTimer = null;
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const entries = Array.from(pendingUpsertsById.entries());
    const ctx = await getCloudContext();
    if (!ctx) return;
    ensureDeletesLoaded(ctx.user.id);

    if (entries.length === 0 && pendingDeletesById.size === 0) {
      retryDelayMs = 1500;
      return;
    }

    if (!isOnline()) {
      ensureOnlineListener();
      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      return;
    }

    if (pendingDeletesById.size > 0) {
      try {
        await flushPendingDeletes(ctx);
      } catch (error) {
        console.warn('Supabase vocabulary delete failed:', error);
        scheduleFlush(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
        return;
      }
    }

    if (entries.length === 0) {
      retryDelayMs = 1500;
      return;
    }

    const rows = entries.map(([, item]) => mapLocalBookVocabToRow(ctx.user.id, item));
    const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
    if (error) {
      console.warn('Supabase vocabulary upsert failed:', error);
      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      return;
    }

    for (const [id, sentItem] of entries) {
      const current = pendingUpsertsById.get(id);
      if (!current) continue;
      const currentUpdatedAt = current?.updatedAt || '';
      const sentUpdatedAt = sentItem?.updatedAt || '';
      if (String(currentUpdatedAt) <= String(sentUpdatedAt)) {
        pendingUpsertsById.delete(id);
      }
    }
    retryDelayMs = 1500;
    if (pendingUpsertsById.size > 0) scheduleFlush(250);
  } finally {
    flushInFlight = false;
  }
}

function scheduleFlush(delayMs = 1200) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushPendingUpserts();
  }, Math.max(0, delayMs));
}

export async function flushBookVocabularyPendingNow() {
  await flushPendingUpserts();
}

export async function upsertBookVocabularyItem(item) {
  const local = await upsertVocabularyItem(item);

  const ctx = await getCloudContext();
  if (ctx) {
    ensureDeletesLoaded(ctx.user.id);
    if (pendingDeletesById.delete(local.id)) persistDeletes(ctx.user.id);
    pendingUpsertsById.set(local.id, local);
    scheduleFlush();
  }

  return local;
}

export async function upsertBookVocabularyItems(items) {
  const locals = await upsertVocabularyItems(items);

  const ctx = await getCloudContext();
  if (ctx && locals.length > 0) {
    ensureDeletesLoaded(ctx.user.id);
    for (const local of locals) {
      if (!local?.id) continue;
      pendingDeletesById.delete(local.id);
      pendingUpsertsById.set(local.id, local);
    }
    persistDeletes(ctx.user.id);
    scheduleFlush();
  }

  return locals;
}

export async function deleteBookVocabularyItem(bookId, word) {
  await deleteVocabularyItem(bookId, word);

  const ctx = await getCloudContext();
  if (!ctx) return true;

  const id = makeVocabId(bookId, word);
  ensureDeletesLoaded(ctx.user.id);
  pendingUpsertsById.delete(id);
  pendingDeletesById.set(id, new Date().toISOString());
  persistDeletes(ctx.user.id);
  scheduleFlush(0);
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
