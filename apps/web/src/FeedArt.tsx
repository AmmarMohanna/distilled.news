import { Atom, BookOpen, Building2, Cpu, Globe2, Landmark, Music, Newspaper, Palette, Plane, Scale, Sprout, Trees, Trophy, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { generateFeedSketch } from "./api";
import { transparentSketch } from "./sketchImage";

const generationAttempts = new Map<string, Promise<void>>();
let generationQueue: Promise<void> = Promise.resolve();
function requestMissingSketch(id: string, revision: string) {
  const key = `${id}:${revision}`;
  let pending = generationAttempts.get(key);
  if (!pending) {
    pending = generationQueue.then(() => generateFeedSketch(id));
    generationQueue = pending.catch(() => {});
    generationAttempts.set(key, pending);
  }
  return pending;
}

const subjects = [
  { pattern: /politic|politique|election|élection|parliament|government|diplomac|سياس|انتخاب/i, icon: Landmark },
  { pattern: /football|soccer|sport|premier league|champions league|fifa|basketball|tennis|كرة القدم|رياضة/i, icon: Trophy },
  { pattern: /plant|garden|jardin|botan|flower|agricultur|نبات|زراع/i, icon: Sprout },
  { pattern: /econom|économ|financ|market|business|bank|اقتصاد|أسواق/i, icon: Building2 },
  { pattern: /\bai\b|tech|software|comput|robot|artificial intelligence/i, icon: Cpu },
  { pattern: /climate|environment|forest|nature|lebanon|beirut/i, icon: Trees },
  { pattern: /science|physics|research|space/i, icon: Atom },
  { pattern: /music|concert|song/i, icon: Music },
  { pattern: /educat|book|literature|school/i, icon: BookOpen },
  { pattern: /travel|touris|aviation/i, icon: Plane },
  { pattern: /food|cook|restaurant/i, icon: Utensils },
  { pattern: /\blaw\b|justice|court|legal/i, icon: Scale },
  { pattern: /culture|media|art|film|cinema/i, icon: Palette },
  { pattern: /world|global|international/i, icon: Globe2 }
];

export function FeedArt({ kind, feed, canGenerate = false }: { kind?: string; canGenerate?: boolean; feed?: { id?: string; title: string; interestProfile?: string; ownerUsername?: string; slug?: string } }) {
  const [image, setImage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    setImage(""); setLoaded(false); setFailure("");
    if (!feed?.ownerUsername || !feed?.slug) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl = "";
    let requested = false;
    let retries = 0;
    let inFlight = false;
    let refreshPending = false;
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
        const response = await fetch(`/api/feed/${encodeURIComponent(feed.ownerUsername!)}/${encodeURIComponent(feed.slug!)}/sketch`, { signal: controller.signal, cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          const blob = await transparentSketch(await response.blob());
          if (controller.signal.aborted) return;
          clearTimeout(timer);
          objectUrl = URL.createObjectURL(blob); setImage(objectUrl); return;
        }
        if (response.status === 404 && canGenerate && feed.id && !requested && !controller.signal.aborted) {
          requested = true;
          await requestMissingSketch(feed.id, JSON.stringify([feed.title, feed.interestProfile]));
          if (!controller.signal.aborted) schedule(0);
        } else if (response.status === 404 && retries++ < 20 && !controller.signal.aborted) {
          schedule(3000);
        }
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : "Illustration unavailable.");
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
  }, [feed?.ownerUsername, feed?.slug, feed?.title, feed?.interestProfile, feed?.id, canGenerate]);
  // Resolve title first so incidental words in a longer profile don't replace
  // the feed's main topic. Public cards need only the public title.
  const match = subjects.find(item => item.pattern.test(feed?.title ?? ""))
    ?? subjects.find(item => item.pattern.test(feed?.interestProfile ?? ""));
  const Icon = match?.icon ?? ({ coast: Trees, world: Globe2, tech: Cpu, city: Building2, science: Atom, culture: Palette })[kind ?? ""] ?? Newspaper;
  return <span className="topic-art pencil-art" title={failure || undefined} aria-hidden="true">
    {!loaded && <span className="pencil-drawing"><Icon strokeWidth={0.95}/><Icon className="pencil-trace" strokeWidth={0.45}/></span>}
    {image && <img src={image} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)}/>}
  </span>;
}
