import type { BriefingConfig } from "@distilled/core";
import type { Env, SourceRecord } from "./types";

export interface SourceSuggestion {
  id: string;
  title: string;
  description: string;
  provider: "rss";
  kind: "rss_feed" | "google_news";
  input: string;
  homepageUrl: string;
  language: "en" | "ar" | "fr";
  region: string;
  reason: string;
  origin: "curated" | "gdelt" | "google_news";
  confidence: "high" | "medium";
  alreadyAdded: boolean;
}

type CatalogEntry = Omit<SourceSuggestion, "reason" | "origin" | "confidence" | "alreadyAdded"> & { tags: string[] };

const CATALOG: CatalogEntry[] = [
  { id: "bbc-world", title: "BBC World", description: "International reporting and explainers.", provider: "rss", kind: "rss_feed", input: "rss: https://feeds.bbci.co.uk/news/world/rss.xml", homepageUrl: "https://www.bbc.com/news/world", language: "en", region: "GLOBAL", tags: ["world", "politics", "science", "technology", "health"] },
  { id: "aljazeera-en", title: "Al Jazeera English", description: "Regional and international coverage with strong Middle East reporting.", provider: "rss", kind: "rss_feed", input: "rss: https://www.aljazeera.com/xml/rss/all.xml", homepageUrl: "https://www.aljazeera.com/", language: "en", region: "MENA", tags: ["middle east", "lebanon", "politics", "security", "world"] },
  { id: "france24-ar", title: "فرانس 24 عربي", description: "أخبار دولية وإقليمية باللغة العربية.", provider: "rss", kind: "rss_feed", input: "rss: https://www.france24.com/ar/rss", homepageUrl: "https://www.france24.com/ar/", language: "ar", region: "MENA", tags: ["العالم", "لبنان", "سياسة", "اقتصاد", "أخبار"] },
  { id: "bbc-ar", title: "BBC عربي", description: "تغطية عربية للأخبار الإقليمية والدولية.", provider: "rss", kind: "rss_feed", input: "rss: https://feeds.bbci.co.uk/arabic/rss.xml", homepageUrl: "https://www.bbc.com/arabic", language: "ar", region: "MENA", tags: ["العالم", "لبنان", "سياسة", "اقتصاد", "علوم"] },
  { id: "france24-fr", title: "France 24", description: "Actualité internationale en français.", provider: "rss", kind: "rss_feed", input: "rss: https://www.france24.com/fr/rss", homepageUrl: "https://www.france24.com/fr/", language: "fr", region: "GLOBAL", tags: ["monde", "liban", "politique", "économie", "technologie"] },
  { id: "techcrunch", title: "TechCrunch", description: "Startups, technology companies, and product news.", provider: "rss", kind: "rss_feed", input: "rss: https://techcrunch.com/feed/", homepageUrl: "https://techcrunch.com/", language: "en", region: "GLOBAL", tags: ["technology", "startups", "ai", "business", "software"] },
  { id: "arstechnica", title: "Ars Technica", description: "Technology, science, and digital policy reporting.", provider: "rss", kind: "rss_feed", input: "rss: https://feeds.arstechnica.com/arstechnica/index", homepageUrl: "https://arstechnica.com/", language: "en", region: "GLOBAL", tags: ["technology", "science", "ai", "software", "security"] },
  { id: "nature", title: "Nature", description: "Research and science news from Nature.", provider: "rss", kind: "rss_feed", input: "rss: https://www.nature.com/nature.rss", homepageUrl: "https://www.nature.com/", language: "en", region: "GLOBAL", tags: ["science", "research", "health", "climate"] }
];

export async function suggestSources(input: {
  briefing: BriefingConfig;
  interestProfile: string;
  language: "en" | "ar" | "fr";
  existingSources: SourceRecord[];
  env: Partial<Env>;
  fetcher?: typeof fetch;
}): Promise<{ suggestions: SourceSuggestion[]; degraded: boolean }> {
  const existing = new Set(input.existingSources.flatMap((source) => [source.input, source.sourceUrl, source.url].filter(Boolean) as string[]));
  const tokens = tokenize(input.interestProfile);
  const curated = CATALOG
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens, input.language) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry, score }) => toSuggestion(entry, existing, score));

  const discovered = input.fetcher ? await gdeltSuggestions(input, existing).catch(() => null) : [];
  const google: SourceSuggestion = {
    id: `google-${stableHash(input.interestProfile)}`,
    title: `Google News: ${input.interestProfile}`,
    description: "A broad search across recent coverage.",
    provider: "rss",
    kind: "google_news",
    input: `news: ${input.interestProfile}`,
    homepageUrl: "https://news.google.com/",
    language: input.language,
    region: "GLOBAL",
    reason: "Broad coverage for this interest",
    origin: "google_news",
    confidence: "medium",
    alreadyAdded: existing.has(`news: ${input.interestProfile}`)
  };

  return { suggestions: dedupe([...curated, ...(discovered ?? []), google]).slice(0, 10), degraded: discovered === null };
}

async function gdeltSuggestions(input: Parameters<typeof suggestSources>[0], existing: Set<string>): Promise<SourceSuggestion[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("q", input.interestProfile);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "12");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("format", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await input.fetcher!(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`GDELT discovery failed: ${response.status}`);
    const body = await response.json() as { articles?: Array<{ title?: string; url?: string; domain?: string }> };
    return (body.articles ?? []).flatMap((article) => {
      if (!article.url || !article.title) return [];
      const parsed = safeHttpUrl(article.url);
      if (!parsed) return [];
      const hostname = article.domain ?? parsed.hostname.replace(/^www\./, "");
      return [{
        id: `gdelt-${stableHash(parsed.origin)}`, title: hostname, description: article.title.slice(0, 180),
        provider: "rss" as const, kind: "google_news" as const, input: `news: site:${hostname} ${input.interestProfile}`,
        homepageUrl: parsed.origin, language: input.language, region: "GLOBAL", reason: `Recent reporting relevant to ${input.interestProfile}`,
        origin: "gdelt" as const, confidence: "medium" as const, alreadyAdded: existing.has(`news: site:${hostname} ${input.interestProfile}`)
      }];
    });
  } finally { clearTimeout(timer); }
}

function scoreEntry(entry: CatalogEntry, tokens: string[], language: string): number {
  const haystack = tokenize(`${entry.title} ${entry.description} ${entry.tags.join(" ")}`);
  const overlap = tokens.filter((token) => haystack.includes(token)).length;
  return overlap * 4 + (entry.language === language ? 3 : 0) + (entry.region === "GLOBAL" ? 1 : 0);
}
function toSuggestion(entry: CatalogEntry, existing: Set<string>, score: number): SourceSuggestion {
  const { tags: _tags, ...rest } = entry;
  return { ...rest, reason: entry.region === "LB" ? "Strong local coverage" : "Relevant trusted coverage", origin: "curated", confidence: score >= 7 ? "high" : "medium", alreadyAdded: existing.has(entry.input) || existing.has(entry.homepageUrl) };
}
function tokenize(value: string): string[] { return value.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1); }
function dedupe(items: SourceSuggestion[]): SourceSuggestion[] { const seen = new Set<string>(); return items.filter((item) => { const key = `${item.homepageUrl}|${item.input}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function safeHttpUrl(value: string): URL | null { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url : null; } catch { return null; } }
function stableHash(input: string): string { let hash = 5381; for (let i = 0; i < input.length; i += 1) hash = (hash * 33) ^ input.charCodeAt(i); return (hash >>> 0).toString(36); }
