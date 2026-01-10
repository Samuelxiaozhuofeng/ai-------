export function sanitizeHtml(html) {
  const raw = String(html || '');
  const purify = /** @type {any} */ (globalThis).DOMPurify;
  if (!purify || typeof purify.sanitize !== 'function') return raw;
  return purify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onmouseenter']
  });
}

