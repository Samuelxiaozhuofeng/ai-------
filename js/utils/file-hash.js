/**
 * Compute a stable FNV-1a 32-bit hash for a Blob/File.
 * Used to create a deterministic bookId without parsing EPUB content.
 * @param {Blob} blob
 * @returns {Promise<string>} hex hash (8 chars)
 */
export async function fnv1a32HexFromBlob(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function computeBookIdFromFile(file) {
  const hex = await fnv1a32HexFromBlob(file);
  return `book-${hex}`;
}

