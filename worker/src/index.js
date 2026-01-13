import { createClient } from '@supabase/supabase-js';

import { getConfig } from './config.js';
import { extractChaptersByToc, extractChaptersFromSpine, extractCoverDataUrl, extractTocEntries, loadEpubFromBuffer } from './epub.js';
import { tokenizeJapaneseCanonicalText } from './japanese.js';
import { gzipJson } from './storage.js';

const config = getConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    // Ensure PostgREST sees the JWT role as service_role for server-side RPC checks.
    headers: { Authorization: `Bearer ${config.supabaseServiceRoleKey}` }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

async function updateJob(jobId, patch) {
  await rpc('update_book_processing_job', {
    job_id: jobId,
    new_status: patch.status ?? null,
    new_progress: typeof patch.progress === 'number' ? patch.progress : null,
    new_stage: patch.stage ?? null,
    new_error: patch.error ?? null,
    new_processed_path: patch.processedPath ?? null
  });
}

async function updateBookFields(userId, bookId, patch) {
  await rpc('update_book_processing_fields', {
    target_user_id: userId,
    target_book_id: bookId,
    new_status: patch.status ?? null,
    new_progress: typeof patch.progress === 'number' ? patch.progress : null,
    new_stage: patch.stage ?? null,
    new_error: patch.error ?? null,
    new_processed_path: patch.processedPath ?? null,
    did_delete_source: Boolean(patch.didDeleteSource)
  });
}

async function downloadStorageObject(path) {
  const { data, error } = await supabase.storage.from(config.bucket).download(path);
  if (error) throw error;
  if (!data) throw new Error('Storage download returned empty body');
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadStorageObject(path, buffer, contentType) {
  const body = buffer instanceof Blob
    ? buffer
    : new Blob([buffer], { type: contentType || 'application/octet-stream' });
  const { error } = await supabase.storage.from(config.bucket).upload(path, body, {
    upsert: true,
    contentType: contentType || 'application/octet-stream',
    cacheControl: '3600'
  });
  if (error) throw error;
}

async function deleteStorageObject(path) {
  const { error } = await supabase.storage.from(config.bucket).remove([path]);
  if (error) throw error;
}

async function setBookMetadata(userId, bookId, patch) {
  const { error } = await supabase
    .from('books')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', bookId);
  if (error) throw error;
}

async function processJob(job) {
  const jobId = job.id;
  const userId = job.user_id;
  const bookId = job.book_id;
  const language = (job.language || 'en').toString().trim().toLowerCase();
  const sourcePath = job.source_path;

  const processedManifestPath = `${userId}/${bookId}/processed/manifest.json.gz`;

  const stage = async (progress, stageName) => {
    await updateJob(jobId, { status: 'processing', progress, stage: stageName, error: null, processedPath: processedManifestPath });
    await updateBookFields(userId, bookId, { status: 'processing', progress, stage: stageName, error: null, processedPath: processedManifestPath });
  };

  try {
    await stage(2, 'download-source');
    const epubBuffer = await downloadStorageObject(sourcePath);

    await stage(8, 'parse-epub');
    const loaded = await loadEpubFromBuffer(epubBuffer);
    const cover = await extractCoverDataUrl(loaded).catch(() => null);

    await stage(15, 'read-toc');
    const toc = await extractTocEntries(loaded);
    let chapters = await extractChaptersByToc({ zip: loaded.zip, baseDir: toc.baseDir || loaded.opfDir, tocEntries: toc.entries });
    if (!chapters.length) {
      await stage(18, `toc-empty:${toc.kind}:${toc.entries?.length || 0};fallback-spine`);
      chapters = await extractChaptersFromSpine({
        zip: loaded.zip,
        opfDir: loaded.opfDir,
        manifestItems: loaded.manifestItems,
        spineIdrefs: loaded.spineIdrefs
      });
    }
    if (!chapters.length) {
      throw new Error(`No chapters extracted (toc=${toc.kind}, tocEntries=${toc.entries?.length || 0})`);
    }

    await stage(language === 'ja' ? 30 : 65, language === 'ja' ? 'tokenize-ja' : 'build-manifest');

    const manifest = {
      version: '1',
      bookId,
      title: (loaded.title || '').trim(),
      language,
      cover: cover || null,
      tocKind: toc.kind,
      chapters: []
    };

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const chapterEntry = {
        id: ch.id,
        title: ch.title,
        content: ch.content,
        rawHtml: ch.rawHtml
      };

      if (language === 'ja') {
        const tokenized = await tokenizeJapaneseCanonicalText(ch.content);
        const tokensPath = `${userId}/${bookId}/processed/tokens/${ch.id}.json.gz`;
        const tokenPayload = {
          version: '1',
          bookId,
          chapterId: ch.id,
          textHash: tokenized.textHash,
          tokenizer: tokenized.tokenizer,
          tokens: tokenized.tokens
        };
        await uploadStorageObject(tokensPath, gzipJson(tokenPayload), 'application/gzip');
        chapterEntry.textHash = tokenized.textHash;
        chapterEntry.tokensPath = tokensPath;

        const progress = Math.min(90, 30 + Math.round(((i + 1) / chapters.length) * 55));
        await stage(progress, `tokenize-ja:${i + 1}/${chapters.length}`);
      }

      manifest.chapters.push(chapterEntry);
    }

    await stage(92, 'upload-manifest');
    await uploadStorageObject(processedManifestPath, gzipJson(manifest), 'application/gzip');

    await stage(96, 'delete-source');
    await deleteStorageObject(sourcePath);

    await stage(98, 'finalize');
    await setBookMetadata(userId, bookId, {
      title: manifest.title || `Book ${bookId}`,
      cover: manifest.cover,
      chapter_count: manifest.chapters.length,
      processed_path: processedManifestPath,
      processing_status: 'ready',
      processing_progress: 100,
      processing_stage: 'done',
      processing_error: null,
      processed_at: new Date().toISOString(),
      source_deleted_at: new Date().toISOString()
    });

    await updateJob(jobId, { status: 'done', progress: 100, stage: 'done', error: null, processedPath: processedManifestPath });
    await updateBookFields(userId, bookId, { status: 'ready', progress: 100, stage: 'done', error: null, processedPath: processedManifestPath, didDeleteSource: true });
  } catch (error) {
    const message = error?.message || String(error);
    await updateJob(jobId, { status: 'error', progress: job.progress || 0, stage: 'error', error: message, processedPath: processedManifestPath }).catch(() => {});
    await updateBookFields(userId, bookId, { status: 'error', progress: job.progress || 0, stage: 'error', error: message, processedPath: processedManifestPath }).catch(() => {});
    throw error;
  }
}

async function loop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const claimed = await rpc('claim_book_processing_job', {
        worker_id: config.workerId,
        lock_minutes: 15,
        max_attempts: config.maxAttempts
      });

      const job = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!job?.id) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      console.log(`[worker] claimed`, { jobId: job.id, bookId: job.book_id, language: job.language, attempts: job.attempts });
      await processJob(job);
      console.log(`[worker] done`, { jobId: job.id, bookId: job.book_id });
    } catch (error) {
      console.error('[worker] loop error', error);
      await sleep(Math.max(2000, config.pollIntervalMs));
    }
  }
}

console.log(`[worker] starting`, { workerId: config.workerId, bucket: config.bucket });
await loop();
