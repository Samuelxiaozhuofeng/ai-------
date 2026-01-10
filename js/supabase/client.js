import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const FALLBACK_SUPABASE_URL = 'YOUR_SUPABASE_URL';
const FALLBACK_SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

function readString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholder(value) {
  if (!value) return true;
  return value.includes('YOUR_SUPABASE_');
}

export function getSupabaseConfig() {
  const injected = /** @type {any} */ (globalThis).__SUPABASE__ || {};
  const url = readString(injected.url) || readString(/** @type {any} */ (globalThis).SUPABASE_URL) || FALLBACK_SUPABASE_URL;
  const anonKey =
    readString(injected.anonKey) || readString(/** @type {any} */ (globalThis).SUPABASE_ANON_KEY) || FALLBACK_SUPABASE_ANON_KEY;

  const configured = !isPlaceholder(url) && !isPlaceholder(anonKey);
  return { url, anonKey, configured };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig().configured;
}

export function getSupabaseClient() {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return client;
}

