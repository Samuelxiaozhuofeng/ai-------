import { getSettings } from '../storage.js';
import { getSupabaseClient, isSupabaseConfigured } from './client.js';
import { getSessionUser } from './session.js';

export function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export async function getCloudContext({ requireSyncEnabled = true } = {}) {
  const settings = getSettings();
  if (requireSyncEnabled && !settings?.syncEnabled) return null;
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const user = await getSessionUser();
  if (!user) return null;
  return { supabase, user, settings };
}

