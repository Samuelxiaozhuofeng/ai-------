const GZIP_MAGIC_1 = 0x1f;
const GZIP_MAGIC_2 = 0x8b;

function isGzip(u8) {
  return u8 && u8.length >= 2 && u8[0] === GZIP_MAGIC_1 && u8[1] === GZIP_MAGIC_2;
}

/**
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
async function maybeGunzipToArrayBuffer(blob) {
  const buf = await blob.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (!isGzip(u8)) return buf;

  if (typeof DecompressionStream !== 'function') {
    throw new Error('Browser does not support gzip decompression (DecompressionStream missing)');
  }

  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

/**
 * @param {Blob} blob
 * @returns {Promise<any>}
 */
export async function parseJsonFromMaybeGzippedBlob(blob) {
  const buf = await maybeGunzipToArrayBuffer(blob);
  const text = new TextDecoder().decode(buf);
  return JSON.parse(text);
}

