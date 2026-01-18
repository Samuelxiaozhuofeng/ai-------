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

export async function updatePageProgressCloud(bookId, progress) {
  const ok = await updatePageProgress(bookId, progress);
  const ctx = await getCloudContext();
  if (!ctx || !isOnline()) return ok;

  const merged = await getReadingProgress(bookId).catch(() => null);
  if (!merged) return ok;

  const row = mapLocalToRow(ctx.user.id, bookId, merged);
  const { error } = await ctx.supabase.from('progress').upsert([row], { onConflict: 'user_id,book_id' });
  if (error) console.warn('Supabase progress upsert failed:', error);

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
  await updatePageProgress(bookId, remote);
  return remote;
}
