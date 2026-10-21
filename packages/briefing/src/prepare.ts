import type { Article, PriorItem } from "./types";
import { containment, cosine, jaccard, normalizeSpace, normalizeUrl, shingles, tfidf, tokens } from "./text";

export interface PreparedArticle {
  /** Short reference used inside prompts, e.g. "S3". */
  ref: string;
  id: string;
  /** Ids of near-identical articles folded into this one; cited together with it. */
  alsoIds: string[];
  source: string;
  title?: string;
  url?: string;
  publishedAt: string;
  text: string;
  /** Refs whose wording is close to this article; a hint, never a decision. */
  similarRefs: string[];
}

export interface PrepareOptions {
  minChars: number;
  maxArticleChars: number;
  nearDuplicate: number;
  relatedHint: number;
}

export const DEFAULT_PREPARE: PrepareOptions = {
  minChars: 40,
  maxArticleChars: 6000,
  nearDuplicate: 0.72,
  relatedHint: 0.32
};

export function trimArticleText(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = Math.floor(max * 0.2);
  const head = max - tail - 7;
  return `${text.slice(0, head).trimEnd()}\n[...]\n${text.slice(text.length - tail).trimStart()}`;
}

export function prepareArticles(
  articles: Article[],
  options: Partial<PrepareOptions> = {}
): { prepared: PreparedArticle[]; skipped: Array<{ id: string; reason: string }> } {
  const opts = { ...DEFAULT_PREPARE, ...options };
  const skipped: Array<{ id: string; reason: string }> = [];
  const candidates = [...articles]
    .map((article) => ({ ...article, text: normalizeSpace(article.text ?? "") }))
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));

  type Keeper = { article: (typeof candidates)[number]; alsoIds: string[]; set: Set<number> };
  const keepers: Keeper[] = [];
  const urls = new Map<string, Keeper>();

  for (const article of candidates) {
    if (article.text.length < opts.minChars) {
      skipped.push({ id: article.id, reason: "empty_or_too_short" });
      continue;
    }
    const url = normalizeUrl(article.url);
    const set = shingles(article.text);
    let twin = url ? urls.get(url) : undefined;
    if (!twin) {
      twin = keepers.find(
        (keeper) =>
          jaccard(keeper.set, set) >= opts.nearDuplicate ||
          (Math.min(keeper.set.size, set.size) >= 12 && containment(keeper.set, set) >= 0.9)
      );
    }
    if (twin) {
      // The fuller copy becomes the primary text; the other id stays cited alongside it.
      if (article.text.length > twin.article.text.length * 1.15) {
        twin.alsoIds.push(twin.article.id);
        skipped.push({ id: twin.article.id, reason: "duplicate_of_other_article" });
        twin.article = article;
      } else {
        twin.alsoIds.push(article.id);
        skipped.push({ id: article.id, reason: "duplicate_of_other_article" });
      }
      continue;
    }
    const keeper: Keeper = { article, alsoIds: [], set };
    keepers.push(keeper);
    if (url) urls.set(url, keeper);
  }

  const vectors = tfidf(keepers.map((keeper) => tokens(`${keeper.article.title ?? ""} ${keeper.article.text}`)));
  const related = keepers.map((_, i) =>
    keepers.flatMap((__, j) => (i !== j && cosine(vectors[i], vectors[j]) >= opts.relatedHint ? [j] : []))
  );

  // Order related articles next to each other so the editor reads one story at a time.
  const order: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < keepers.length; i += 1) {
    if (seen.has(i)) continue;
    const queue = [i];
    seen.add(i);
    const group: number[] = [];
    while (queue.length) {
      const next = queue.shift()!;
      group.push(next);
      for (const j of related[next]) if (!seen.has(j)) (seen.add(j), queue.push(j));
    }
    order.push(...group.sort((a, b) => a - b));
  }

  const refOf = new Map(order.map((index, position) => [index, `S${position + 1}`]));
  const prepared = order.map((index) => {
    const { article, alsoIds } = keepers[index];
    return {
      ref: refOf.get(index)!,
      id: article.id,
      alsoIds,
      source: article.source,
      title: article.title,
      url: article.url,
      publishedAt: article.publishedAt,
      text: trimArticleText(article.text, opts.maxArticleChars),
      similarRefs: related[index].map((j) => refOf.get(j)!)
    };
  });
  return { prepared, skipped };
}

/** Groups prepared articles into chunks of bounded size without splitting a run of related articles when avoidable. */
export function chunkArticles(articles: PreparedArticle[], maxChars: number): PreparedArticle[][] {
  const size = (article: PreparedArticle) => article.text.length + (article.title?.length ?? 0) + 200;
  const chunks: PreparedArticle[][] = [];
  let current: PreparedArticle[] = [];
  let used = 0;
  for (const article of articles) {
    if (current.length && used + size(article) > maxChars) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(article);
    used += size(article);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export interface MemoryOptions {
  maxItems: number;
  recentItems: number;
  maxAgeDays: number;
}

/**
 * Chooses which previously published items the editor must see: the ones most similar to the
 * incoming articles plus the most recent few. Keeps tokens bounded however long the feed history is.
 */
export function selectPrior(
  prior: PriorItem[],
  articles: PreparedArticle[],
  now: Date,
  options: Partial<MemoryOptions> = {}
): PriorItem[] {
  const opts: MemoryOptions = { maxItems: 16, recentItems: 4, maxAgeDays: 21, ...options };
  const cutoff = now.getTime() - opts.maxAgeDays * 86_400_000;
  const live = prior.filter((item) => {
    const at = Date.parse(item.at);
    return !Number.isFinite(at) || at >= cutoff;
  });
  if (live.length <= opts.maxItems) return live.sort((a, b) => a.at.localeCompare(b.at));

  const docs = [
    ...articles.map((article) => tokens(`${article.title ?? ""} ${article.text}`)),
    ...live.map((item) => tokens(`${item.headline} ${item.body}`))
  ];
  const vectors = tfidf(docs);
  const articleVectors = vectors.slice(0, articles.length);
  const scored = live.map((item, index) => ({
    item,
    score: Math.max(0, ...articleVectors.map((vector) => cosine(vector, vectors[articles.length + index])))
  }));
  const recent = [...live].sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.recentItems);
  const chosen = new Map(recent.map((item) => [item.id, item]));
  for (const { item, score } of scored.sort((a, b) => b.score - a.score)) {
    if (chosen.size >= opts.maxItems) break;
    if (score > 0.05) chosen.set(item.id, item);
  }
  return [...chosen.values()].sort((a, b) => a.at.localeCompare(b.at));
}
