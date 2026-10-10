export function referenceDigestSummary(summary: string): string {
  const words = summary.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= 34) return summary;
  return `${words.slice(0, 34).join(" ").replace(/[,.،;:]+$/u, "")}...`;
}

export function surfaceBriefSummary(summary: string): string {
  const sentences = summarySentences(summary);
  if (sentences.length <= 2) return normalizeSummary(summary);
  return normalizeSummary(sentences.slice(0, 2).join(" "));
}

export function summarySentences(summary: string): string[] {
  const normalized = normalizeSummary(summary);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!؟?]+(?:[.!؟?]+|$)/gu) ?? [normalized];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

export function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/gu, " ");
}

export function highestReferenceNumber(text: string): number {
  let highest = 0;
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

export function referenceTextParts(text: string): Array<{ kind: "text"; value: string } | { kind: "reference"; value: number }> {
  const parts: Array<{ kind: "text"; value: string } | { kind: "reference"; value: number }> = [];
  const pattern = /\[(\d{1,3})\]/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) parts.push({ kind: "text", value: text.slice(cursor, match.index) });
    parts.push({ kind: "reference", value: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor) });
  return parts;
}

