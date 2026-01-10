function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDeletedAt(value) {
  return typeof value === 'string' && value ? value : null;
}

/**
 * @param {string} storageKey
 * @returns {Map<string, string>}
 */
export function loadPendingDeletes(storageKey) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (typeof localStorage === 'undefined') return map;
  const key = normalizeId(storageKey);
  if (!key) return map;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const entry of parsed) {
      const id = normalizeId(entry?.id);
      const deletedAt = normalizeDeletedAt(entry?.deletedAt);
      if (!id || !deletedAt) continue;
      map.set(id, deletedAt);
    }
  } catch {
    // ignore
  }
  return map;
}

/**
 * @param {string} storageKey
 * @param {Map<string, string>} deletes
 */
export function savePendingDeletes(storageKey, deletes) {
  if (typeof localStorage === 'undefined') return;
  const key = normalizeId(storageKey);
  if (!key) return;

  try {
    const items = Array.from(deletes.entries()).map(([id, deletedAt]) => ({ id, deletedAt }));
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

