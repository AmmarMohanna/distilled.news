const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "he",
  "in",
  "into",
  "is",
  "it",
  "its",
  "new",
  "no",
  "not",
  "of",
  "on",
  "or",
  "said",
  "says",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with"
]);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function significantTokens(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );
}

export function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const match = trimmed.match(/^(.{24,220}?[.!?])\s/);
  return (match?.[1] ?? trimmed.slice(0, 220)).trim();
}

export function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
