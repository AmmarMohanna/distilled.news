import { cadenceLabel } from "./cadence";
import { processMessages } from "./processing";
import type {
  BriefingConfig,
  BriefingEdition,
  BriefingEditionSection,
  BriefingItem,
  NormalizedMessage
} from "./types";

export interface BuildBriefingEditionInput {
  briefing: BriefingConfig;
  messages: NormalizedMessage[];
  windowStart: string;
  windowEnd: string;
  now: Date;
}

export function buildBriefingEdition(input: BuildBriefingEditionInput): BriefingEdition {
  const result = processMessages({
    briefing: input.briefing,
    messages: input.messages,
    existingItems: [],
    now: input.now
  });
  const items = result.publishedItems.filter((item) => item.summary);
  const sections = items.length > 0 ? items.map(itemToSection) : [emptySection(input.briefing.briefingCadence)];
  const status = items.length > 0 ? "published" : "empty";
  const title = `${capitalize(cadenceLabel(input.briefing.briefingCadence))} briefing`;
  const summary = items.length > 0
    ? `${items.length} meaningful update${items.length === 1 ? "" : "s"} in this ${cadenceLabel(input.briefing.briefingCadence)} window.`
    : `No meaningful verified update in this ${cadenceLabel(input.briefing.briefingCadence)} window.`;
  const timestamp = input.now.toISOString();

  return {
    id: editionId(input.briefing.id, input.briefing.briefingCadence, input.windowStart, input.windowEnd),
    briefingId: input.briefing.id,
    cadence: input.briefing.briefingCadence,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    title,
    summary,
    sections,
    status,
    publishedAt: input.windowEnd,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function searchBriefingEditions(editions: BriefingEdition[], query: string): BriefingEdition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return editions.filter((edition) => editionHaystack(edition).includes(normalized));
}

function itemToSection(item: BriefingItem): BriefingEditionSection {
  return {
    title: sectionTitle(item),
    summary: item.summary,
    evidence: item.evidence
  };
}

function emptySection(cadence: BriefingConfig["briefingCadence"]): BriefingEditionSection {
  return {
    title: "No meaningful update",
    summary: `No meaningful verified update in this ${cadenceLabel(cadence)} window.`,
    evidence: []
  };
}

function sectionTitle(item: BriefingItem): string {
  const evidenceText = item.evidence.map((entry) => `${entry.sourceTitle} ${entry.text}`).join(" ").toLowerCase();
  if (/\b(bank|currency|economy|market|inflation|lira|dollar|fuel|مصرف|دولار|ليرة)\b/.test(evidenceText)) return "Economy";
  if (/\b(power|electricity|water|internet|road|airport|port|كهرباء|مياه|مطار|مرفأ)\b/.test(evidenceText)) return "Infrastructure";
  if (/\b(strike|missile|army|border|killed|injured|security|غارة|قصف|الجيش|حدود|قتيل|جريح)\b/.test(evidenceText)) return "Security";
  return "Update";
}

function editionHaystack(edition: BriefingEdition): string {
  return [
    edition.title,
    edition.summary,
    ...edition.sections.flatMap((section) => [
      section.title,
      section.summary,
      ...section.evidence.flatMap((evidence) => [
        evidence.sourceTitle,
        evidence.text,
        evidence.links.join(" "),
        evidence.media.map((media) => media.label ?? media.url ?? "").join(" ")
      ])
    ])
  ].join(" ").toLowerCase();
}

function editionId(briefingId: string, cadence: string, windowStart: string, windowEnd: string): string {
  return `edition_${stableHash(`${briefingId}:${cadence}:${windowStart}:${windowEnd}`)}`;
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
