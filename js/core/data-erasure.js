import { clearAllLocalStores } from '../db.js';
import { resetLocalPreferences } from '../storage.js';
import { getCloudContext, isOnline } from '../supabase/cloud-context.js';
import { deleteEPUB, listUserEPUBs } from '../supabase/epub-service.js';
import { globalVocabByWord } from './global-vocab-cache.js';

const DEFAULT_ORDER = [
  'vocabulary',
  'progress',
  'books',
  'storage',
  'indexeddb',
  'localStorage'
];

function buildResult() {
  return {
    success: [],
    failed: [],
    storage: { total: 0, deleted: 0, failed: 0 },
    order: [...DEFAULT_ORDER]
  };
}

function recordSuccess(result, step, detail = null) {
  result.success.push({ step, detail });
}

function recordFailure(result, step, error) {
  console.warn(`Data erasure failed for ${step}:`, error);
  result.failed.push({ step, error: error?.message || String(error || '') });
}

export async function eraseAllUserData() {
  const result = buildResult();
  const ctx = await getCloudContext().catch(() => null);
  const online = Boolean(ctx && isOnline());
  let storagePaths = [];
  let storageListError = null;

  // This flow deletes only user-scoped data; Supabase Auth account remains intact.
  if (online) {
    try {
      const books = await listUserEPUBs();
      storagePaths = (books || [])
        .map((book) => String(book?.storage_path || '').trim())
        .filter(Boolean);
    } catch (error) {
      storageListError = error;
    }
  }

  // 1) Vocabulary records (all kinds)
  try {
    if (!online) throw new Error('offline');
    const { error } = await ctx.supabase.from('vocabulary').delete().eq('user_id', ctx.user.id);
    if (error) throw error;
    recordSuccess(result, 'vocabulary');
  } catch (error) {
    recordFailure(result, 'vocabulary', error);
  }

  // 2) Reading progress / bookmarks / highlights
  try {
    if (!online) throw new Error('offline');
    const { error } = await ctx.supabase.from('progress').delete().eq('user_id', ctx.user.id);
    if (error) throw error;
    recordSuccess(result, 'progress');
  } catch (error) {
    recordFailure(result, 'progress', error);
  }

  // 3) Books metadata (and processing jobs)
  try {
    if (!online) throw new Error('offline');
    const { error } = await ctx.supabase.from('books').delete().eq('user_id', ctx.user.id);
    if (error) throw error;
    const { error: jobsError } = await ctx.supabase.from('book_processing_jobs').delete().eq('user_id', ctx.user.id);
    if (jobsError) throw jobsError;
    recordSuccess(result, 'books');
  } catch (error) {
    recordFailure(result, 'books', error);
  }

  // 4) EPUB files in Supabase Storage
  if (online && storagePaths.length > 0) {
    result.storage.total = storagePaths.length;
    const storageErrors = [];
    for (const path of storagePaths) {
      try {
        await deleteEPUB(path);
        result.storage.deleted += 1;
      } catch (error) {
        result.storage.failed += 1;
        storageErrors.push(error);
      }
    }
    if (result.storage.failed === 0 && !storageListError) {
      recordSuccess(result, 'storage', { total: result.storage.total });
    } else {
      const err = storageListError || storageErrors[0] || new Error('storage-delete-failed');
      recordFailure(result, 'storage', err);
    }
  } else if (!online) {
    recordFailure(result, 'storage', new Error('offline'));
  } else {
    if (storageListError) {
      recordFailure(result, 'storage', storageListError);
    } else {
      recordSuccess(result, 'storage', { total: 0 });
    }
  }

  // 5) IndexedDB stores
  try {
    await clearAllLocalStores();
    globalVocabByWord.clear();
    recordSuccess(result, 'indexeddb');
  } catch (error) {
    recordFailure(result, 'indexeddb', error);
  }

  // 6) localStorage (reset app settings; preserve auth/session + theme/lang)
  try {
    resetLocalPreferences({ preserveTheme: true, preserveLanguageFilter: true });
    recordSuccess(result, 'localStorage');
  } catch (error) {
    recordFailure(result, 'localStorage', error);
  }

  return result;
}
