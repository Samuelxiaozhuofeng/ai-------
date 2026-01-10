/**
 * Sync Service Module
 * Supabase sync for vocabulary + reading progress (+ optional realtime).
 */

import { getSettings } from './storage.js';
import {
  getBook,
  getAllBooks,
  getGlobalVocabItem,
  getReadingProgress,
  getVocabularyItem,
  listGlobalVocab,
  listVocabulary,
  updatePageProgress,
  upsertGlobalVocabItem,
  upsertVocabularyItem
} from './db.js';
import { getCloudContext, isOnline } from './supabase/cloud-context.js';
import { flushGlobalVocabPendingNow, mapLocalGlobalVocabToRow, pullGlobalVocabUpdates } from './supabase/global-vocab-repo.js';
import { flushBookVocabularyPendingNow, pullBookVocabularyUpdates } from './supabase/vocabulary-repo.js';
import { flushProgressPendingNow } from './supabase/progress-repo.js';
import { showNotification } from './ui/notifications.js';

let timerId = null;
let realtimeChannel = null;
let currentBookIdForSync = null;
let status = { state: 'offline', lastSyncAt: null, error: null };
let onStatusChange = null;
let lastToastKey = '';
let lastToastAt = 0;
let syncInFlight = null;
let lastAutoSyncAt = 0;
let hasOnlineListener = false;

function maybeToast(message, type) {
  if (typeof document === 'undefined') return;
  const now = Date.now();
  const key = `${type}:${message}`;
  if (key === lastToastKey && now - lastToastAt < 10_000) return;
  lastToastKey = key;
  lastToastAt = now;
  showNotification(message, type);
}

function ensureOnlineListener() {
  if (hasOnlineListener) return;
  if (typeof window === 'undefined') return;
  hasOnlineListener = true;
  window.addEventListener(
    'online',
    () => {
      void autoSyncIfNeeded({ reason: 'online' });
    },
    { passive: true }
  );
}

export async function autoSyncIfNeeded({ reason = 'auto' } = {}) {
  const ctx = await getCloudContext();
  if (!ctx) return;
  const books = await getAllBooks().catch(() => []);
  if (!books || books.length === 0) return;

  const now = Date.now();
  if (now - lastAutoSyncAt < 15_000) return;
  lastAutoSyncAt = now;

  try {
    await syncNow(null);
  } catch (error) {
    console.warn(`Auto sync failed (${reason}):`, error);
  }
}

function setStatus(next) {
  status = { ...status, ...next };
  if (onStatusChange) onStatusChange(status);
}

export function getSyncStatus() {
  return status;
}

export function setSyncStatusListener(listener) {
  onStatusChange = listener;
}

function getLastSyncKey(userId) {
  return `language-reader-supabase-last-sync:${userId}`;
}

function getLastSyncAt(userId) {
  try {
    const value = localStorage.getItem(getLastSyncKey(userId));
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

function setLastSyncAt(userId, iso) {
  try {
    localStorage.setItem(getLastSyncKey(userId), iso);
  } catch {
    // ignore
  }
}

function mapLocalBookVocabToRow(userId, item) {
  return {
    user_id: userId,
    id: item.id,
    kind: 'book',
    book_id: item.bookId,
    language: item.language || null,
    word: item.word,
    display_word: item.displayWord || null,
    status: item.status || null,
    context: item.context || null,
    analysis: item.analysis || null,
    source_chapter_id: item.sourceChapterId || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

function mapProgressToRow(userId, bookId, progress) {
  return {
    user_id: userId,
    book_id: bookId,
    chapter_id: progress?.chapterId ?? null,
    page_number: typeof progress?.pageNumber === 'number' ? progress.pageNumber : 0,
    scroll_position: typeof progress?.scrollPosition === 'number' ? progress.scrollPosition : 0,
    updated_at: progress?.updatedAt || new Date().toISOString()
  };
}

function mapRowToLocalProgress(row) {
  return {
    bookId: row.book_id,
    chapterId: row.chapter_id ?? null,
    pageNumber: typeof row.page_number === 'number' ? row.page_number : Number(row.page_number || 0),
    scrollPosition: typeof row.scroll_position === 'number' ? row.scroll_position : Number(row.scroll_position || 0),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

async function syncProgress({ ctx, bookId }) {
  const local = await getReadingProgress(bookId).catch(() => null);

  const { data: remoteRow, error } = await ctx.supabase
    .from('progress')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;

  const remote = remoteRow ? mapRowToLocalProgress(remoteRow) : null;

  const localUpdatedAt = local?.updatedAt || '';
  const remoteUpdatedAt = remote?.updatedAt || '';

  if (local && (!remote || String(localUpdatedAt) > String(remoteUpdatedAt))) {
    const row = mapProgressToRow(ctx.user.id, bookId, local);
    const { error: upsertError } = await ctx.supabase.from('progress').upsert(row, { onConflict: 'user_id,book_id' });
    if (upsertError) throw upsertError;
  } else if (remote && (!local || String(remoteUpdatedAt) > String(localUpdatedAt))) {
    await updatePageProgress(bookId, remote);
  }
}

async function syncBookVocabulary({ ctx, bookId, since }) {
  const locals = await listVocabulary(bookId, null);
  const delta = since ? locals.filter((it) => (it?.updatedAt || '') > since) : locals;
  if (delta.length > 0) {
    const rows = delta.map((it) => mapLocalBookVocabToRow(ctx.user.id, it));
    const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
  }

  const remoteUpdates = await pullBookVocabularyUpdates({ bookId, since });
  for (const item of remoteUpdates) {
    const existing = await getVocabularyItem(item.bookId, item.word).catch(() => null);
    const localUpdatedAt = existing?.updatedAt || '';
    if (!localUpdatedAt || String(item.updatedAt) > String(localUpdatedAt)) {
      await upsertVocabularyItem(item);
    }
  }
}

async function syncGlobalVocabulary({ ctx, since }) {
  const locals = await listGlobalVocab().catch(() => []);
  const delta = since ? locals.filter((it) => (it?.updatedAt || '') > since) : locals;
  if (delta.length > 0) {
    const rows = delta.map((it) => mapLocalGlobalVocabToRow(ctx.user.id, it));
    const { error } = await ctx.supabase.from('vocabulary').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
  }

  const remoteUpdates = await pullGlobalVocabUpdates({ since });
  for (const item of remoteUpdates) {
    const existing = await getGlobalVocabItem(item.id || item.normalizedWord || '').catch(() => null);
    const localUpdatedAt = existing?.updatedAt || '';
    if (!localUpdatedAt || String(item.updatedAt) > String(localUpdatedAt)) {
      await upsertGlobalVocabItem({ ...item, _skipRemote: true });
    }
  }
}

async function syncBookMetadata({ ctx, bookId }) {
  const localBook = await getBook(bookId).catch(() => null);
  if (!localBook) return;

  const patch = {
    current_chapter: typeof localBook?.currentChapter === 'number' ? localBook.currentChapter : 0,
    last_read_at: localBook?.lastReadAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await ctx.supabase.from('books').update(patch).eq('user_id', ctx.user.id).eq('id', bookId);
  if (error) throw error;
}

async function ensureRealtimeSubscription() {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return;
  if (realtimeChannel) return;

  realtimeChannel = ctx.supabase
    .channel(`language-reader:${ctx.user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'progress', filter: `user_id=eq.${ctx.user.id}` },
      (payload) => {
        try {
          const row = payload?.new || null;
          if (!row?.book_id || !row?.updated_at) return;
          void (async () => {
            const local = await getReadingProgress(row.book_id).catch(() => null);
            const localUpdatedAt = local?.updatedAt || '';
            if (!localUpdatedAt || String(row.updated_at) > String(localUpdatedAt)) {
              await updatePageProgress(row.book_id, mapRowToLocalProgress(row));
            }
          })();
        } catch {
          // ignore
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vocabulary', filter: `user_id=eq.${ctx.user.id}` },
      (payload) => {
        try {
          const row = payload?.new || null;
          if (!row?.id || !row?.updated_at) return;
          void (async () => {
            if (row.kind === 'global') {
              const local = await getGlobalVocabItem(row.id).catch(() => null);
              const localUpdatedAt = local?.updatedAt || '';
              if (!localUpdatedAt || String(row.updated_at) > String(localUpdatedAt)) {
                const { mapRowToLocalGlobalVocab } = await import('./supabase/global-vocab-repo.js');
                await upsertGlobalVocabItem({ ...mapRowToLocalGlobalVocab(row), _skipRemote: true });
              }
              return;
            }

            if (row.kind === 'book' && row.book_id) {
              const { mapRowToLocalBookVocab } = await import('./supabase/vocabulary-repo.js');
              const localItem = mapRowToLocalBookVocab(row);
              const existing = await getVocabularyItem(localItem.bookId, localItem.word).catch(() => null);
              const localUpdatedAt = existing?.updatedAt || '';
              if (!localUpdatedAt || String(localItem.updatedAt) > String(localUpdatedAt)) {
                await upsertVocabularyItem(localItem);
              }
            }
          })();
        } catch {
          // ignore
        }
      }
    )
    .subscribe();
}

async function stopRealtimeSubscription() {
  const ctx = await getCloudContext({ requireSyncEnabled: false }).catch(() => null);
  if (!ctx || !realtimeChannel) {
    realtimeChannel = null;
    return;
  }
  try {
    ctx.supabase.removeChannel(realtimeChannel);
  } catch {
    // ignore
  }
  realtimeChannel = null;
}

export async function syncNow(bookId) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const settings = getSettings();

    const ctx = await getCloudContext();
    if (!ctx) {
      setStatus({ state: 'offline', error: '请登录以启用同步' });
      return;
    }

    if (!isOnline()) {
      ensureOnlineListener();
      setStatus({ state: 'offline', error: '离线：等待网络恢复' });
      return;
    }

    try {
      setStatus({ state: 'syncing', error: null });

      await flushGlobalVocabPendingNow();
      await flushBookVocabularyPendingNow();
      await flushProgressPendingNow();

      const since = getLastSyncAt(ctx.user.id);
      const nowIso = new Date().toISOString();

      await syncGlobalVocabulary({ ctx, since });

      if (bookId) {
        await syncBookVocabulary({ ctx, bookId, since });
        await syncProgress({ ctx, bookId });
        await syncBookMetadata({ ctx, bookId });
      } else {
        const books = await getAllBooks().catch(() => []);
        for (const book of books) {
          if (!book?.id) continue;
          await syncBookVocabulary({ ctx, bookId: book.id, since });
          await syncProgress({ ctx, bookId: book.id });
          await syncBookMetadata({ ctx, bookId: book.id });
        }
      }

      setLastSyncAt(ctx.user.id, nowIso);
      await ensureRealtimeSubscription();

      setStatus({ state: 'synced', lastSyncAt: nowIso, error: null });
      if (settings?.syncEnabled) {
        // Background sync enabled: stay quiet on success by default.
      }
    } catch (error) {
      setStatus({ state: 'offline', error: error?.message || String(error) });
      maybeToast(`同步失败：${error?.message || String(error)}`, 'error');
    }
  })();
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function startBackgroundSync(bookId) {
  const settings = getSettings();
  if (!settings.syncEnabled) return;
  currentBookIdForSync = bookId || null;
  if (timerId) return;

  timerId = setInterval(() => {
    syncNow(currentBookIdForSync);
  }, 30_000);

  void ensureRealtimeSubscription();
}

export function stopBackgroundSync() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  currentBookIdForSync = null;
  void stopRealtimeSubscription();
}
