// Keep this version in sync with changes that invalidate stored artwork.
export const FEED_ART_CACHE_VERSION = 'v10';
const cacheName = `distilled-processed-sketches-${FEED_ART_CACHE_VERSION}`;
const lifetime = 7 * 24 * 60 * 60 * 1000;

export async function readSavedSketch(path: string): Promise<Blob | undefined> {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(cacheName);
    const response = await cache.match(path);
    if (!response) return;
    const savedAt = Number(response.headers.get('x-sketch-saved-at'));
    if (!savedAt || Date.now() - savedAt >= lifetime) {
      await cache.delete(path);
      return;
    }
    return await response.blob();
  } catch { /* Storage may be unavailable; use the normal image request. */ }
}

export async function saveSketch(path: string, blob: Blob): Promise<void> {
  try {
    if (!('caches' in window) || blob.size > 512 * 1024) return;
    const cache = await caches.open(cacheName);
    await cache.delete(path);
    await cache.put(path, new Response(blob, { headers: {
      'content-type': blob.type || 'image/png', 'x-sketch-saved-at': String(Date.now())
    } }));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 32)).map(key => cache.delete(key)));
  } catch { /* An optional cache must never prevent artwork from displaying. */ }
}
