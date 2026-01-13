export function normalizeNewlines(value) {
  return String(value || '').replace(/\r\n?/g, '\n');
}

export function splitParagraphs(value) {
  return normalizeNewlines(value)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function canonicalizeText(value) {
  return splitParagraphs(value).join('\n\n');
}

export function fnv1a32HexFromString(value) {
  const str = String(value || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashCanonicalText(value) {
  return `fnv1a32:${fnv1a32HexFromString(value)}`;
}

export function normalizeWord(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return '';

  let leading;
  let trailing;
  try {
    leading = /^[^\p{L}\p{N}]+/u;
    trailing = /[^\p{L}\p{N}]+$/u;
  } catch {
    leading = /^[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/i;
    trailing = /[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+$/i;
  }

  return trimmed.replace(leading, '').replace(trailing, '');
}

