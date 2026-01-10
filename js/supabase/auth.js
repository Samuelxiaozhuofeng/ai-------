import { getSupabaseClient, isSupabaseConfigured } from './client.js';

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase 未配置：请提供 SUPABASE_URL 和 SUPABASE_ANON_KEY');
  }
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client unavailable');
  return client;
}

export async function signUp(email, password) {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data?.user || null;
}

export async function signIn(email, password) {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data?.user || null;
}

export async function signOut() {
  const supabase = requireClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    try {
      callback(event, session?.user || null, session || null);
    } catch {
      // ignore
    }
  });

  return () => {
    try {
      data?.subscription?.unsubscribe?.();
    } catch {
      // ignore
    }
  };
}

