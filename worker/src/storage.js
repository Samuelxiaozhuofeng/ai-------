import { gunzipSync, gzipSync } from 'node:zlib';

export function gzipJson(obj) {
  const json = JSON.stringify(obj);
  return gzipSync(Buffer.from(json, 'utf-8'));
}

export function ungzipToJson(buffer) {
  const data = gunzipSync(Buffer.from(buffer));
  return JSON.parse(data.toString('utf-8'));
}

