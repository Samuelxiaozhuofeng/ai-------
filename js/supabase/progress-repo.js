import { getReadingProgress, updatePageProgress } from '../db.js';
import { getCloudContext, isOnline } from './cloud-context.js';

function mapLocalToRow(userId, bookId, progress) {
  return {
    user_id: userId,
    book_id: bookId,
    chapter_id: progress?.chapterId ?? null,
    page_number: typeof progress?.pageNumber === 'number' ? progress.pageNumber : 0,
    scroll_position: typeof progress?.scrollPosition === 'number' ? progress.scrollPosition : 0,
    char_offset: typeof progress?.charOffset === 'number' ? progress.charOffset : 0,
    chapter_text_hash: typeof progress?.chapterTextHash === 'string' ? progress.chapterTextHash : null,
    updated_at: typeof progress?.updatedAt === 'string' && progress.updatedAt ? progress.updatedAt : new Date().toISOString()
  };
}

function mapRowToLocal(row) {
  return {
    bookId: row.book_id,
    chapterId: row.chapter_id ?? null,
    pageNumber: typeof row.page_number === 'number' ? row.page_number : Number(row.page_number || 0),
    scrollPosition: typeof row.scroll_position === 'number' ? row.scroll_position : Number(row.scroll_position || 0),
    charOffset: typeof row.char_offset === 'number' ? row.char_offset : Number(row.char_offset || 0),
    chapterTextHash: typeof row.chapter_text_hash === 'string' ? row.chapter_text_hash : null,
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

let pendingByBook = new Map();
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

async function flushPending() {
  flushTimer = null;
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const ctx = await getCloudContext();
    if (!ctx) return;

    const entries = Array.from(pendingByBook.entries());
    if (entries.length === 0) {
      retryDelayMs = 1500;
      return;
    }

    if (!isOnline()) {
      ensureOnlineListener();
      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      return;
    }

    const rows = entries.map(([bookId, progress]) => mapLocalToRow(ctx.user.id, bookId, progress));
    const { error } = await ctx.supabase.from('progress').upsert(rows, { onConflict: 'user_id,book_id' });
    if (error) {
      console.warn('Supabase progress upsert failed:', error);
      scheduleFlush(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      return;
    }

    for (const [bookId, sentProgress] of entries) {
      const current = pendingByBook.get(bookId);
      if (!current) continue;
      const currentUpdatedAt = current?.updatedAt || '';
      const sentUpdatedAt = sentProgress?.updatedAt || '';
      if (String(currentUpdatedAt) <= String(sentUpdatedAt)) {
        pendingByBook.delete(bookId);
      }
    }

    retryDelayMs = 1500;
    if (pendingByBook.size > 0) scheduleFlush(250);
  } finally {
    flushInFlight = false;
  }
}

function scheduleFlush(delayMs = 1200) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushPending();
  }, Math.max(0, delayMs));
}

export async function flushProgressPendingNow() {
  await flushPending();
}

export async function updatePageProgressCloud(bookId, progress) {
  const ok = await updatePageProgress(bookId, progress);

  const ctx = await getCloudContext();
  if (ctx) {
    const merged = await getReadingProgress(bookId).catch(() => null);
    if (merged) {
      pendingByBook.set(bookId, merged);
      scheduleFlush();
    }
  }

  return ok;
}

export async function getReadingProgressCloud(bookId) {
  const local = await getReadingProgress(bookId).catch(() => null);

  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return local;

  const { data, error } = await ctx.supabase
    .from('progress')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('book_id', bookId)
    .maybeSingle();

  if (error) {
    console.warn('Supabase progress select failed:', error);
    return local;
  }

  if (!data) return local;

  const remote = mapRowToLocal(data);
  const localUpdatedAt = local?.updatedAt || '';
  if (!localUpdatedAt || String(remote.updatedAt) > String(localUpdatedAt)) {
    await updatePageProgress(bookId, remote);
    return remote;
  }

  if (local && String(localUpdatedAt) > String(remote.updatedAt || '')) {
    pendingByBook.set(bookId, local);
    scheduleFlush();
  }

  return local;
}

export async function pullProgressUpdates({ bookId, since = null } = {}) {
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return [];

  let query = ctx.supabase.from('progress').select('*').eq('user_id', ctx.user.id);
  if (bookId) query = query.eq('book_id', bookId);
  if (since) query = query.gt('updated_at', since);

  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToLocal);
}
