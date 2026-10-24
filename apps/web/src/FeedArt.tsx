import { useEffect, useState } from "react";
import { transparentSketch } from "./sketchImage";
import { readSavedSketch, saveSketch } from "./sketchCache";

// Keep processed artwork across card remounts during Home/Explore navigation.
// Store blobs rather than object URLs so each card still owns its URL lifecycle.
const sketchCache = new Map<string, { blob: Blob; expires: number }>();
const cacheLifetime = 10 * 60 * 1000;
const cacheByteLimit = 16 * 1024 * 1024;
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

export function FeedArt({ feed }: { kind?: string; feed?: { id?: string; title: string; interestProfile?: string; ownerUsername?: string; slug?: string } }) {
  const [image, setImage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    setImage(""); setLoaded(false); setFailure("");
    if (!feed?.ownerUsername || !feed?.slug) { return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl = "";
    let retries = 0;
    let inFlight = false;
    let refreshPending = false;
    let checkedStorage = false;
    const sketchUrl = `/api/feed/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/sketch`;
    const saved = cachedSketch(sketchUrl);
    if (saved) {
      objectUrl = URL.createObjectURL(saved);
      setImage(objectUrl);
    }
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
        if (!checkedStorage) {
          checkedStorage = true;
          const stored = await readSavedSketch(sketchUrl);
          if (controller.signal.aborted) return;
          if (stored) {
            rememberSketch(sketchUrl, stored);
            objectUrl = URL.createObjectURL(stored);
            setImage(objectUrl);
            return;
          }
        }
        const response = await fetch(sketchUrl, { signal: controller.signal, cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          const blob = await transparentSketch(await response.blob());
          if (controller.signal.aborted) return;
          rememberSketch(sketchUrl, blob);
          clearTimeout(timer);
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
          void saveSketch(sketchUrl, blob);
          return;
        }
        if (response.status === 404 && retries++ < 20 && !controller.signal.aborted) {
          schedule(3000);
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
  }, [feed?.ownerUsername, feed?.slug, feed?.id]);
  return <span className="topic-art pencil-art" title={failure || undefined} aria-hidden="true">

    {image && <img src={image} alt="" style={{ visibility: loaded ? "visible" : "hidden" }} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); }}/>}
  </span>;
}
