import { useEffect, useState } from "react";
import { transparentSketch } from "./sketchImage";
import { FEED_ART_CACHE_VERSION, readSavedSketch, saveSketch } from "./sketchCache";

// Keep processed artwork across card remounts during Home/Explore navigation.
// Store blobs rather than object URLs so each card still owns its URL lifecycle.
const sketchCache = new Map<string, { blob: Blob; expires: number }>();
const cacheLifetime = 60 * 60 * 1000;
// Home and Explore may mount the same public feed together. Share its network/conversion work.
const sketchRequests = new Map<string, Promise<{blob?: Blob; pending: boolean}>>();
const cacheByteLimit = 16 * 1024 * 1024;
const inkRotations = [0, 34, 66, 128, 166, 205, 305];

function inkRotation(feedKey: string) {
  let hash = 2166136261;
  for (const letter of feedKey) hash = Math.imul(hash ^ letter.codePointAt(0)!, 16777619);
  return inkRotations[(hash >>> 0) % inkRotations.length];
}
function cachedSketch(key: string): Blob | undefined {
  const entry = sketchCache.get(key);
  if (!entry) return;
  sketchCache.delete(key);
  if (entry.expires <= Date.now()) return;
  sketchCache.set(key, entry);
  return entry.blob;
}
function rememberSketch(key: string, blob: Blob) {
  sketchCache.delete(key);
  sketchCache.set(key, { blob, expires: Date.now() + cacheLifetime });
  let bytes = [...sketchCache.values()].reduce((total, entry) => total + entry.blob.size, 0);
  for (const [oldest, entry] of sketchCache) {
    if (sketchCache.size <= 32 && bytes <= cacheByteLimit) break;
    sketchCache.delete(oldest);
    bytes -= entry.blob.size;
  }
}

export function FeedArt({ feed, centered = false }: { centered?: boolean; kind?: string; feed?: { id?: string; title: string; interestProfile?: string; ownerUsername?: string; slug?: string; publicFeedEnabled?: boolean } }) {
  const [image, setImage] = useState<{ url: string; fullCover: boolean }>();
  const [loadedAspect, setLoadedAspect] = useState(0);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    setImage(undefined); setLoadedAspect(0); setFailure("");
    // Wait for feed metadata rather than fetching the placeholder before visibility is known.
    if (!feed?.ownerUsername || !feed?.slug || feed.publicFeedEnabled === undefined) { return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl = "";
    let retries = 0;
    let inFlight = false;
    let refreshPending = false;
    const refreshArtwork = new URLSearchParams(window.location.search).get('refresh-artwork') === feed.id;
    let checkedStorage = refreshArtwork;
    const sketchUrl = `/api/feed/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/sketch`;
    const cacheKey = centered ? sketchUrl + "?artwork=centered-v2" : sketchUrl;
    const cacheable = feed.publicFeedEnabled === true;
    const show = (blob: Blob) => {
      objectUrl = URL.createObjectURL(blob);
      setImage({ url: objectUrl, fullCover: blob.type === "image/jpeg" });
    };
    const saved = cacheable && !refreshArtwork ? cachedSketch(cacheKey) : undefined;
    if (saved) show(saved);
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void check(); }, delay);
    };
    const check = async () => {
      if (controller.signal.aborted || objectUrl) return;
      if (inFlight) { refreshPending = true; return; }
      clearTimeout(timer);
      inFlight = true;
      try {
        if (cacheable && !checkedStorage) {
          checkedStorage = true;
          const stored = await readSavedSketch(cacheKey);
          if (controller.signal.aborted) return;
          if (stored) {
            rememberSketch(cacheKey, stored);
            show(stored);
            return;
          }
        }
        const load = async () => {
          const imageRequestUrl = cacheable ? `${sketchUrl}?v=${FEED_ART_CACHE_VERSION}` : sketchUrl;
          const response = await fetch(imageRequestUrl, { ...(cacheable ? {} : {signal:controller.signal}), cache: cacheable ? refreshArtwork ? "reload" : "default" : "no-store" });
          if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
            const blob = await response.blob();
            const fullCover = response.headers.get("X-Feed-Artwork-Style") === "pencil-cover-v1" && blob.type === "image/jpeg";
            const artwork = fullCover
              ? await transparentSketch(blob, false, true).catch(() => blob)
              : await transparentSketch(blob, centered);
            return { blob: artwork, pending: false };
          }
          // A missing job cannot become ready merely by repeatedly reading its URL.
          return {pending:response.status === 404 && Boolean(response.headers?.get("Retry-After"))};
        };
        let request = cacheable && !refreshArtwork ? sketchRequests.get(cacheKey) : undefined;
        if (!request) {
          request = load();
          if (cacheable) {
            sketchRequests.set(cacheKey, request);
            void request.then(() => sketchRequests.delete(cacheKey), () => sketchRequests.delete(cacheKey));
          }
        }
        const {blob,pending} = await request;
        if (pending && retries++ < 20 && !controller.signal.aborted) schedule(Math.min(30_000, 3000 * 2 ** Math.min(4, retries - 1)));
        if (blob) {
          if (controller.signal.aborted) return;
          if (cacheable) rememberSketch(cacheKey, blob);
          clearTimeout(timer);
          show(blob);
          if (cacheable) void saveSketch(cacheKey, blob);
          if (refreshArtwork) {
            const url = new URL(window.location.href);
            if (url.searchParams.get('refresh-artwork') === feed.id) {
              url.searchParams.delete('refresh-artwork');
              window.history.replaceState(window.history.state, '', url);
            }
          }
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) { setFailure(error instanceof Error ? error.message : "Illustration unavailable."); }
      } finally {
        inFlight = false;
        if (refreshPending && !objectUrl && !controller.signal.aborted) schedule(0);
        refreshPending = false;
      }
    };
    const refresh = () => { if (!objectUrl && !controller.signal.aborted) { clearTimeout(timer); void check(); } };
    window.addEventListener("feed-sketch-updated", refresh);
    void check();
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("feed-sketch-updated", refresh); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [feed?.ownerUsername, feed?.slug, feed?.id, feed?.publicFeedEnabled, centered]);
  const panoramic = loadedAspect >= 3;
  const fullCover = image?.fullCover || panoramic;
  return <span className={`topic-art pencil-art${fullCover ? " full-cover-art" : ""}`} title={failure || undefined} aria-hidden="true">

    {image && <img src={image.url} alt="" className={panoramic ? `panoramic-cover-image${image.fullCover ? "" : " transparent-cover-image"}` : undefined} style={{
      visibility: loadedAspect ? "visible" : "hidden",
      filter: fullCover ? undefined : `hue-rotate(${inkRotation(feed?.id ?? `${feed?.ownerUsername}/${feed?.slug}`)}deg)`
    }} onLoad={({ currentTarget }) => {
      setLoadedAspect(currentTarget.naturalHeight ? currentTarget.naturalWidth / currentTarget.naturalHeight : 1);
    }} onError={() => setLoadedAspect(0)}/>}
  </span>;
}
