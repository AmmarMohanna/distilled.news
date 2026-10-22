const STOPWORDS = new Set(
  "the a an and or but of to in on for with at by from as is are was were be been it its this that these those he she they we you i not no will would can could has have had said says also after before over into than then there their about more most new".split(
    " "
  )
);

export function normalizeSpace(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 2 && !STOPWORDS.has(token)
  );
}

function fnv(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function shingles(value: string, size = 5): Set<number> {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<number>();
  if (words.length <= size) {
    if (words.length) out.add(fnv(words.join(" ")));
    return out;
  }
  for (let i = 0; i + size <= words.length; i += 1) out.add(fnv(words.slice(i, i + size).join(" ")));
  return out;
}

export function jaccard(a: Set<number>, b: Set<number>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Share of the smaller set contained in the larger: catches an article quoting another. */
export function containment(a: Set<number>, b: Set<number>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) inter += 1;
  return inter / small.size;
}

export type Vector = Map<string, number>;

/** TF-IDF vectors over a small corpus; idf is smoothed so tiny batches still work. */
export function tfidf(docs: string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  const n = docs.length;
  return docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);
    const vec: Vector = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      const weight = (1 + Math.log(count)) * (Math.log((n + 1) / ((df.get(term) ?? 0) + 0.5)) + 1);
      vec.set(term, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, weight] of vec) vec.set(term, weight / norm);
    return vec;
  });
}

export function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) dot += weight * (large.get(term) ?? 0);
  return dot;
}

/** Numbers that carry meaning in news: multi-digit, decimal, percent or currency. Normalised to digits. */
export function significantNumbers(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/(?<![\p{L}\p{N}])[$€£]?\d[\d,]*(?:\.\d+)?%?/gu)) {
    const raw = match[0].replace(/[$€£,%]/g, "").replace(/\.$/, "");
    if (raw.length >= 2 || /[.%$€£]/.test(match[0])) found.add(raw);
  }
  return [...found];
}

export function approxTokens(chars: number): number {
  return Math.ceil(chars / 3.6);
}

export function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|ref_)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.replace(/^www\./, "");
    return `${url.hostname}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}
