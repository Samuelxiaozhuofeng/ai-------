import { parseJsonFromMaybeGzippedBlob } from '../utils/gzip.js';
import { getSupabaseClient, isSupabaseConfigured } from './client.js';
import { getSessionUser } from './session.js';

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

export function getProcessedManifestPath(userId, bookId) {
  const uid = String(userId || '').trim();
  const bid = String(bookId || '').trim();
  if (!uid || !bid) return null;
  return `${uid}/${bid}/processed/manifest.json.gz`;
}

export function getJapaneseTokensPath(userId, bookId, chapterId) {
  const uid = String(userId || '').trim();
  const bid = String(bookId || '').trim();
  const cid = String(chapterId || '').trim();
  if (!uid || !bid || !cid) return null;
  return `${uid}/${bid}/processed/tokens/${cid}.json.gz`;
}

export async function downloadProcessedManifest(processedPathOrNull, { bookId = null } = {}) {
  const supabase = requireClient();
  const user = requireUser(await getSessionUser());

  const path = String(processedPathOrNull || '').trim() || getProcessedManifestPath(user.id, bookId);
  if (!path) throw new Error('Missing processed manifest path');

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  if (!data) throw new Error('Download failed');

  return await parseJsonFromMaybeGzippedBlob(data);
}

export async function downloadJapaneseTokens({ bookId, chapterId, tokensPath = null } = {}) {
  const supabase = requireClient();
  const user = requireUser(await getSessionUser());

  const path = String(tokensPath || '').trim() || getJapaneseTokensPath(user.id, bookId, chapterId);
  if (!path) throw new Error('Missing tokens path');

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  if (!data) throw new Error('Download failed');

  return await parseJsonFromMaybeGzippedBlob(data);
}

