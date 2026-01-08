/**
 * Sync Service Module
 * Optional backend sync for vocabulary + reading progress.
 */

import { getSettings } from './storage.js';
import { listVocabulary, upsertVocabularyItem, getReadingProgress, updatePageProgress } from './db.js';

let timerId = null;
let status = { state: 'offline', lastSyncAt: null, error: null };
let onStatusChange = null;

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

function baseUrl() {
  const settings = getSettings();
  const url = (settings.backendUrl || '').trim().replace(/\/+$/, '');
  return url;
}

async function request(path, options = {}) {
  const url = baseUrl();
  if (!url) throw new Error('Backend URL not set');
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Backend error: ${response.status} ${text}`.trim());
  }
  return response;
}

export async function syncNow(bookId) {
  const settings = getSettings();
  if (!settings.syncEnabled) {
    setStatus({ state: 'offline', error: null });
    return;
  }

  try {
    setStatus({ state: 'syncing', error: null });

    // Health check
    await request('/health', { method: 'GET' });

    const vocabulary = bookId ? await listVocabulary(bookId, null) : [];
    const syncPayload = await request('/api/v1/sync', {
      method: 'POST',
      body: JSON.stringify({ vocabulary })
    }).then((r) => r.json());

    const merged = syncPayload?.vocabulary || [];
    for (const item of merged) {
      await upsertVocabularyItem({
        bookId: item.bookId,
        word: item.word,
        status: item.status,
        context: item.context || null,
        analysis: item.analysis || null,
        displayWord: item.displayWord || null,
        sourceChapterId: item.sourceChapterId || null,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null
      });
    }

    // Progress: best-effort upsync
    if (bookId) {
      const progress = await getReadingProgress(bookId);
      if (progress) {
        await request(`/api/v1/progress/${encodeURIComponent(bookId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            chapterId: progress.chapterId,
            pageNumber: progress.pageNumber,
            scrollPosition: progress.scrollPosition,
            updatedAt: progress.updatedAt
          })
        });
      }

      // Pull progress back (last-write-wins)
      const remoteProgress = await request(`/api/v1/progress/${encodeURIComponent(bookId)}`, { method: 'GET' }).then((r) => r.json());
      if (remoteProgress && remoteProgress.updatedAt) {
        const localUpdatedAt = progress?.updatedAt || '';
        if (!localUpdatedAt || String(remoteProgress.updatedAt) > String(localUpdatedAt)) {
          await updatePageProgress(bookId, {
            chapterId: remoteProgress.chapterId ?? null,
            pageNumber: typeof remoteProgress.pageNumber === 'number' ? remoteProgress.pageNumber : 0,
            scrollPosition: typeof remoteProgress.scrollPosition === 'number' ? remoteProgress.scrollPosition : 0,
            updatedAt: remoteProgress.updatedAt
          });
        }
      }
    }

    setStatus({ state: 'synced', lastSyncAt: new Date().toISOString(), error: null });
  } catch (error) {
    setStatus({ state: 'offline', error: error.message || String(error) });
  }
}

export function startBackgroundSync(bookId) {
  const settings = getSettings();
  if (!settings.syncEnabled) return;
  if (timerId) return;

  timerId = setInterval(() => {
    syncNow(bookId);
  }, 30_000);
}

export function stopBackgroundSync() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
