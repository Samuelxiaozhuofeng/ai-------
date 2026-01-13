import { cacheEpub, deleteCachedEpub, getCachedEpub } from '../db.js';
import { getSupabaseClient, isSupabaseConfigured } from './client.js';
import { getSessionUser } from './session.js';
import { upsertBookProcessingJob } from './book-processing-jobs.js';

const BUCKET = 'epubs';

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error('Supabase 未配置');
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client unavailable');
  return client;
}

function requireUser(user) {
  if (!user?.id) throw new Error('请先登录以启用云端同步');
  return user;
}

function normalizeBookMetadata(metadata) {
  return {
    bookId: String(metadata?.bookId || '').trim(),
    title: String(metadata?.title || '').trim(),
    cover: typeof metadata?.cover === 'string' ? metadata.cover : null,
    language: String(metadata?.language || '').trim() || 'en',
    chapterCount: Number.isFinite(Number(metadata?.chapterCount)) ? Number(metadata.chapterCount) : null
  };
}

export async function uploadEPUB(file, metadata) {
  const supabase = requireClient();
  const user = requireUser(await getSessionUser());

  const info = normalizeBookMetadata(metadata);
  if (!info.bookId) throw new Error('Missing bookId');
  if (!(file instanceof File)) throw new Error('Invalid file');

  const path = `${user.id}/${info.bookId}/source.epub`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/epub+zip'
  });
  if (uploadError) throw uploadError;

  const nowIso = new Date().toISOString();
  const record = {
    user_id: user.id,
    id: info.bookId,
    title: info.title || file.name.replace(/\.epub$/i, ''),
    cover: info.cover,
    language: info.language,
    chapter_count: info.chapterCount,
    storage_path: path,
    processed_path: null,
    file_size: typeof file.size === 'number' ? file.size : null,
    file_updated_at: nowIso,
    processing_status: 'queued',
    processing_progress: 0,
    processing_stage: 'queued',
    processing_error: null,
    updated_at: nowIso
  };

  const { data, error } = await supabase
    .from('books')
    .upsert(record, { onConflict: 'user_id,id' })
    .select('*')
    .single();
  if (error) throw error;

  await upsertBookProcessingJob({ bookId: info.bookId, language: info.language, sourcePath: path });
  return data;
}

export async function downloadEPUB(filePath, { expectedUpdatedAt = null } = {}) {
  const supabase = requireClient();
  requireUser(await getSessionUser());

  const path = String(filePath || '').trim();
  if (!path) throw new Error('Missing filePath');

  const cached = await getCachedEpub(path).catch(() => null);
  if (cached?.blob) {
    if (!expectedUpdatedAt || !cached.updatedAt || String(cached.updatedAt) >= String(expectedUpdatedAt)) {
      return cached.blob;
    }
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  if (!data) throw new Error('Download failed');

  await cacheEpub(path, data, expectedUpdatedAt || new Date().toISOString());
  return data;
}

export async function listUserEPUBs() {
  const supabase = requireClient();
  const user = requireUser(await getSessionUser());

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', user.id)
    .order('last_read_at', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteEPUB(filePath) {
  const supabase = requireClient();
  const user = requireUser(await getSessionUser());

  const path = String(filePath || '').trim();
  if (!path) return true;

  // Best-effort delete: for folder layout "<user>/<book>/...", remove processed artifacts too.
  const parts = path.split('/').filter(Boolean);
  const isFolderLayout = parts.length >= 3 && parts[0] === user.id;
  const bookId = isFolderLayout ? parts[1] : null;

  const removePaths = new Set([path]);
  if (bookId) {
    removePaths.add(`${user.id}/${bookId}/processed/manifest.json.gz`);

    const tokensPrefix = `${user.id}/${bookId}/processed/tokens`;
    const { data: listed, error: listError } = await supabase.storage.from(BUCKET).list(tokensPrefix, { limit: 2000 });
    if (listError) throw listError;
    (listed || []).forEach((it) => {
      if (it?.name) removePaths.add(`${tokensPrefix}/${it.name}`);
    });
  }

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(Array.from(removePaths));
  if (storageError) {
    const msg = storageError?.message || String(storageError);
    // Deleting a processed book may include a missing source.epub (already deleted by worker).
    if (!/not found/i.test(msg)) throw storageError;
  }

  const { error: dbError } = await supabase.from('books').delete().eq('user_id', user.id).eq('storage_path', path);
  if (dbError) throw dbError;

  if (bookId) {
    await supabase.from('book_processing_jobs').delete().eq('user_id', user.id).eq('book_id', bookId);
  }

  await deleteCachedEpub(path).catch(() => {});
  return true;
}
