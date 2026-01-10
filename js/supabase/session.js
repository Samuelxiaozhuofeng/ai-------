import { getSupabaseClient, isSupabaseConfigured } from './client.js';

export async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.user || null;
}

