import { useLanguage } from "./LanguageControl";
import { Atom, BookOpen, Building2, Cpu, Globe2, Landmark, Music, Newspaper, Palette, Plane, Scale, Sprout, Trees, Trophy, Utensils } from "lucide-react";

import { useEffect, useState } from "react";
import { generateFeedSketch } from "./api";
import { transparentSketch } from "./sketchImage";

// Share an attempt across cards/remounts; a failed request must not become a loop.
const generationAttempts = new Map<string, Promise<void>>();
let generationQueue: Promise<void> = Promise.resolve();
function requestMissingSketch(id: string, revision: string) {
  const key = `${id}:${revision}`;
  let pending = generationAttempts.get(key);
  if (!pending) {
    // Loading several old feeds must not burst image requests at the provider.
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
  const { t } = useLanguage();
  const [image, setImage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setImage(""); setLoaded(false); setFailure("");
    if (!feed?.ownerUsername || !feed?.slug) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let objectUrl = "";
    let requested = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/feed/${encodeURIComponent(feed.ownerUsername!)}/${encodeURIComponent(feed.slug!)}/sketch`, { signal: controller.signal, cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          const original = await response.blob();
          // A cosmetic conversion failure must not hide a valid stored image.
          const blob = await transparentSketch(original).catch(() => original);
          if (controller.signal.aborted) return;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob); setImage(objectUrl);
          if (response.headers.get("x-sketch-current") === "false" && canGenerate && feed.id && !requested) {
            requested = true;
            await requestMissingSketch(feed.id, JSON.stringify([feed.title, feed.interestProfile]));
            if (!controller.signal.aborted) timer = setTimeout(check, 0);
          }
          return;
        }
        if (response.status === 404 && canGenerate && feed.id && !requested && !controller.signal.aborted) {
          requested = true;
          await requestMissingSketch(feed.id, JSON.stringify([feed.title, feed.interestProfile]));
          if (!controller.signal.aborted) timer = setTimeout(check, 0);
        } else if (response.status === 404 && requested) {
          throw new Error("The illustration was not saved. Retry generation or check the server logs.");
        } else if (response.status !== 404) {
          throw new Error(`Could not load illustration (HTTP ${response.status}).`);
        }
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : "Illustration unavailable. Your feed is still ready to use.");
      }
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [feed?.ownerUsername, feed?.slug, feed?.title, feed?.interestProfile, feed?.id, canGenerate, retry]);
  // Resolve title first so incidental words in a longer profile don't replace
  // the feed's main topic. Public cards need only the public title.
  const match = subjects.find(item => item.pattern.test(feed?.title ?? ""))
    ?? subjects.find(item => item.pattern.test(feed?.interestProfile ?? ""));
  const Icon = match?.icon ?? ({ coast: Trees, world: Globe2, tech: Cpu, city: Building2, science: Atom, culture: Palette })[kind ?? ""] ?? Newspaper;
  return <span className="topic-art pencil-art" title={failure || undefined} aria-label={failure || undefined} aria-hidden={failure ? undefined : true}>
    {!loaded && <span className="pencil-drawing"><Icon strokeWidth={0.95}/><Icon className="pencil-trace" strokeWidth={0.45}/></span>}
    {image && <img src={image} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)}/>}
    {failure && <span className="sketch-status">{t("Illustration unavailable")}{canGenerate && <button type="button" onClick={event => {
      event.preventDefault(); event.stopPropagation();
      if (feed?.id) generationAttempts.delete(`${feed.id}:${JSON.stringify([feed.title, feed.interestProfile])}`);
      setRetry(value => value + 1);
    }}>{t("Retry illustration")}</button>}</span>}
  </span>;
}
