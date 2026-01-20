import { initDB } from '../../db.js';

const STORE_PAGINATION_CACHE = 'paginationCache';
const PAGINATION_CACHE_ENABLED_KEY = 'language-reader-pagination-cache-enabled';

function readRootCssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (value || fallback).toString().trim();
}

function getReaderWidthSetting() {
  if (typeof document === 'undefined') return '';
  return document.documentElement.dataset.readingWidth || '';
}

function toSafeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function serializeCacheKey(payload) {
  return JSON.stringify({
    bookId: payload.bookId,
    chapterIndex: payload.chapterIndex,
    viewport: {
      width: payload.viewport?.width || 0,
      height: payload.viewport?.height || 0
    },
    settings: {
      fontSize: payload.settings?.fontSize || '',
      lineHeight: payload.settings?.lineHeight || '',
      readerWidth: payload.settings?.readerWidth || '',
      zenMode: Boolean(payload.settings?.zenMode)
    },
    chapterHash: payload.chapterHash || ''
  });
}

function normalizeCacheKey(cacheKey) {
  if (!cacheKey) return null;
  if (typeof cacheKey === 'string') {
    return {
      cacheKey,
      bookId: '',
      chapterIndex: 0,
      viewport: { width: 0, height: 0 },
      settings: { fontSize: '', lineHeight: '', readerWidth: '', zenMode: false },
      chapterHash: ''
    };
  }
  if (typeof cacheKey?.cacheKey === 'string') return cacheKey;
  return null;
}

export function isPaginationCacheEnabled() {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(PAGINATION_CACHE_ENABLED_KEY);
  if (raw === '0' || raw === 'false') return false;
  return true;
}

export function setPaginationCacheEnabled(enabled) {
  if (typeof localStorage === 'undefined') return false;
  localStorage.setItem(PAGINATION_CACHE_ENABLED_KEY, enabled ? '1' : '0');
  return true;
}

export function buildPaginationCacheKey({ bookId, chapterIndex, chapterHash, readingContent, readerView }) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  if (!safeBookId) return null;

  const viewport = {
    width: toSafeInt(readingContent?.clientWidth),
    height: toSafeInt(readingContent?.clientHeight)
  };

  const settings = {
    fontSize: readRootCssVar('--reader-font-size'),
    lineHeight: readRootCssVar('--reader-line-height'),
    readerWidth: getReaderWidthSetting() || readRootCssVar('--reader-content-max-width'),
    zenMode: Boolean(readerView?.classList?.contains('zen-mode'))
  };

  const payload = {
    bookId: safeBookId,
    chapterIndex: toSafeInt(chapterIndex),
    viewport,
    settings,
    chapterHash: typeof chapterHash === 'string' ? chapterHash.trim() : ''
  };

  return {
    ...payload,
    cacheKey: serializeCacheKey(payload)
  };
}

export async function getCachedPagination(cacheKey) {
  const normalized = normalizeCacheKey(cacheKey);
  if (!normalized?.cacheKey) return null;

  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_PAGINATION_CACHE], 'readonly');
        const store = transaction.objectStore(STORE_PAGINATION_CACHE);
        const request = store.get(normalized.cacheKey);
        request.onsuccess = () => {
          const result = request.result || null;
          if (!result?.pages || !Array.isArray(result.pages) || result.pages.length === 0) {
            resolve(null);
            return;
          }
          resolve(result);
        };
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.warn('分页缓存读取失败，已回退到无缓存模式:', error);
    return null;
  }
}

export async function setCachedPagination(cacheKey, payload) {
  const normalized = normalizeCacheKey(cacheKey);
  if (!normalized?.cacheKey) return false;
  if (!payload?.pages || !Array.isArray(payload.pages) || payload.pages.length === 0) return false;

  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_PAGINATION_CACHE], 'readwrite');
        const store = transaction.objectStore(STORE_PAGINATION_CACHE);
        const entry = {
          cacheKey: normalized.cacheKey,
          bookId: normalized.bookId,
          chapterIndex: normalized.chapterIndex,
          viewport: normalized.viewport,
          settings: normalized.settings,
          chapterHash: normalized.chapterHash,
          chapterTextHash: payload.chapterTextHash || null,
          pages: payload.pages,
          pageStartCharOffsets: Array.isArray(payload.pageStartCharOffsets) ? payload.pageStartCharOffsets : [],
          updatedAt: new Date().toISOString()
        };
        const request = store.put(entry);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.warn('分页缓存写入失败，已回退到无缓存模式:', error);
    return false;
  }
}

export async function clearCacheForBook(bookId) {
  const safeBookId = typeof bookId === 'string' ? bookId.trim() : '';
  if (!safeBookId) return false;

  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_PAGINATION_CACHE], 'readwrite');
        const store = transaction.objectStore(STORE_PAGINATION_CACHE);

        if (!store.indexNames.contains('bookId')) {
          const request = store.getAll();
          request.onsuccess = () => {
            const items = request.result || [];
            items
              .filter((item) => item?.bookId === safeBookId)
              .forEach((item) => store.delete(item.cacheKey));
            resolve(true);
          };
          request.onerror = () => reject(request.error);
          return;
        }

        const index = store.index('bookId');
        const range = IDBKeyRange.only(safeBookId);
        const cursorRequest = index.openCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            resolve(true);
            return;
          }
          cursor.delete();
          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.warn('分页缓存清理失败:', error);
    return false;
  }
}

export async function clearAllCache() {
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_PAGINATION_CACHE], 'readwrite');
        const store = transaction.objectStore(STORE_PAGINATION_CACHE);
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.warn('分页缓存清理失败:', error);
    return false;
  }
}
