import { clusterMessages } from "./clustering";
import {
  areSameEventDeterministic,
  collapseDuplicateBriefingItems,
  primaryEventKeyForEvidence
} from "./events";
import {
  classifyNoise,
  findDuplicate,
  hasAuthoritySignal,
  hasConcreteFact,
  isImportantToInterest,
  isRelevantToInterest
} from "./filtering";
import { createEvidenceOnlySummary, isLowInformationSummary } from "./summarization";
import { eventTokens, jaccardSimilarity, normalizeEventText, normalizeText, significantTokens, stableHash } from "./text";
import type {
  BriefingEvidence,
  BriefingItem,
  ClusterCandidate,
  NormalizedMessage,
  ProcessingInput,
  ProcessingResult,
  SuppressedMessage
} from "./types";

const UPDATE_MERGE_THRESHOLD = 0.42;

export function processMessages(input: ProcessingInput): ProcessingResult {
  const accepted: NormalizedMessage[] = [];
  const suppressed: SuppressedMessage[] = [];
  const importantMessageIds = new Set(input.importantMessageIds ?? []);

  for (const message of input.messages) {
    const important = importantMessageIds.has(message.id) || isImportantToInterest(message, input.briefing);
    const noise = classifyNoise(message);
    if (noise) {
      suppressed.push(noise);
      continue;
    }

    if (!important && !isRelevantToInterest(message, input.briefing)) {
      suppressed.push({
        messageId: message.id,
        reason: "not_relevant",
        detail: "Message does not match the briefing interest profile."
      });
      continue;
    }

    const duplicate = findDuplicate(message, accepted);
    if (duplicate && !shouldKeepDuplicateAsEvidence(message, duplicate, important)) {
      suppressed.push({
        messageId: message.id,
        reason: "duplicate",
        detail: `Duplicate of ${duplicate.id}.`
      });
      continue;
    }

    accepted.push(message);
  }

  const existingItems = input.existingItems ?? [];
  const newItems: BriefingItem[] = [];

  for (const cluster of clusterMessages(accepted)) {
    if (!clusterIsImportant(cluster, input.briefing, importantMessageIds) && !passesIntensity(cluster, input.briefing.intensity)) {
      for (const message of cluster.messages) {
        suppressed.push({
          messageId: message.id,
          reason: "not_relevant",
          detail: "Message needs stronger support at the current feed intensity."
        });
      }
      continue;
    }

    const evidence = cluster.messages.map(toEvidence);
    const importantCluster = clusterIsImportant(cluster, input.briefing, importantMessageIds);
    const existing = findMergeTarget(cluster, existingItems, newItems, importantCluster);

    if (existing) {
      mergeIntoItem(input.briefing, existing, evidence, cluster.messages);
      continue;
    }

    const item = createBriefingItem(input.briefing, cluster, evidence);
    if (item.summary) {
      newItems.push(item);
    } else {
      for (const message of cluster.messages) {
        suppressed.push({
          messageId: message.id,
          reason: "no_clear_information",
          detail: "Message did not contain a clear standalone factual update."
        });
      }
    }
  }

  return {
    publishedItems: collapseDuplicateBriefingItems([...existingItems, ...newItems], input.briefing),
    suppressed
  };
}

export function isExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function searchBriefingItems(items: BriefingItem[], query: string, now = new Date()): BriefingItem[] {
  const queryTokens = significantTokens(query);
  if (queryTokens.length === 0) return [];

  return items
    .filter((item) => !isExpired(item.expiresAt, now))
    .filter((item) => {
      const haystack = [
        item.summary,
        ...item.evidence.flatMap((evidence) => [
          evidence.sourceTitle,
          evidence.text,
          evidence.links.join(" "),
          evidence.media.map((media) => media.label ?? media.url ?? "").join(" ")
        ])
      ].join(" ");
      const tokens = significantTokens(haystack);
      return queryTokens.every((token) => tokens.includes(token)) || jaccardSimilarity(queryTokens, tokens) > 0.2;
    });
}

function createBriefingItem(briefing: ProcessingInput["briefing"], cluster: ClusterCandidate, evidence: BriefingEvidence[]): BriefingItem {
  const itemAt = latestDate(cluster.messages.map((message) => message.postedAt));
  const expiresAt = addDays(itemAt, briefing.retentionDays);
  const eventKey = primaryEventKeyForEvidence(evidence);
  const summary = createEvidenceOnlySummary(
    {
      id: "summary",
      ownerAccountId: briefing.ownerAccountId,
      ownerUsername: briefing.ownerUsername,
      slug: "summary",
      title: "Summary",
      stars: 0,
      interestProfile: "",
      styleInstruction: undefined,
      publicFeedEnabled: true,
      paused: false,
      language: briefing.language,
      intensity: briefing.intensity,
      dailyBudgetUsd: briefing.dailyBudgetUsd,
      retentionDays: briefing.retentionDays
    },
    evidence
  );

  return {
    id: `item_${stableHash(`${briefing.id}:${eventKey}`)}`,
    clusterId: `cluster_${stableHash(eventKey)}`,
    eventKey,
    summary,
    itemAt,
    updatedAt: itemAt,
    expiresAt,
    mergedUpdateCount: Math.max(0, evidence.length - 1),
    evidence
  };
}

function toEvidence(message: NormalizedMessage): BriefingEvidence {
  return {
    messageId: message.id,
    sourceId: message.source.id,
    sourceTitle: message.source.title,
    sourceType: message.source.type,
    sourceProvider: message.source.provider,
    sourceKind: message.source.kind,
    sourceUrl: message.sourceUrl,
    postedAt: message.postedAt,
    text: message.text,
    links: message.links,
    media: message.media
  };
}

function passesIntensity(cluster: ClusterCandidate, intensity: ProcessingInput["briefing"]["intensity"]): boolean {
  if (intensity === "high" || intensity === "medium") return true;

  const distinctSources = new Set(cluster.messages.map((message) => message.source.id));
  if (distinctSources.size >= 2) return true;

  const [message] = cluster.messages;
  if (!message) return false;

  if (!hasConcreteFact(message.text)) return false;
  if (hasAuthoritySignal(message.text)) return true;

  return message.source.kind === "google_news" || message.source.kind === "rss_feed";
}

function findMergeTarget(
  cluster: ClusterCandidate,
  existingItems: BriefingItem[],
  newItems: BriefingItem[],
  importantCluster: boolean
): BriefingItem | undefined {
  const candidates = [...existingItems, ...newItems];
  const clusterTexts = cluster.messages.map((message) => message.text);
  const clusterTokens = eventTokens(clusterTexts.join(" "));
  const clusterEvidence = cluster.messages.map(toEvidence);

  return candidates.find((item) => {
    if (areSameEventDeterministic(clusterEvidence, item.evidence)) return true;

    const itemTexts = [item.summary, ...item.evidence.map((evidence) => evidence.text)];
    const itemTokens = eventTokens(itemTexts.join(" "));

    if (
      clusterTexts.some((text) =>
        itemTexts.some((candidate) => normalizeText(candidate) === normalizeText(text) || normalizeEventText(candidate) === normalizeEventText(text))
      )
    ) {
      return true;
    }

    const strongestSimilarity = Math.max(
      jaccardSimilarity(clusterTokens, itemTokens),
      strongestTextSimilarity(clusterTexts, itemTexts)
    );
    if (importantCluster) {
      return strongestSimilarity >= 0.72 || strongestTextContainment(clusterTexts, itemTexts) >= 0.75;
    }
    return strongestSimilarity >= UPDATE_MERGE_THRESHOLD;
  });
}

function mergeIntoItem(
  briefing: ProcessingInput["briefing"],
  item: BriefingItem,
  evidence: BriefingEvidence[],
  messages: NormalizedMessage[]
): void {
  const existingMessageIds = new Set(item.evidence.map((entry) => entry.messageId));
  const nextEvidence = evidence.filter((entry) => !existingMessageIds.has(entry.messageId));
  item.evidence.push(...nextEvidence);
  item.mergedUpdateCount = Math.max(0, item.evidence.length - 1);
  item.eventKey = item.eventKey ?? primaryEventKeyForEvidence(item.evidence);
  item.updatedAt = latestDate([...messages.map((message) => message.postedAt), item.updatedAt]);
  const refreshedSummary = createEvidenceOnlySummary(briefing, item.evidence);
  if (refreshedSummary && !isLowInformationSummary(refreshedSummary)) item.summary = refreshedSummary;
}

function strongestTextSimilarity(left: string[], right: string[]): number {
  let strongest = 0;

  for (const leftText of left) {
    const leftTokens = eventTokens(leftText);
    for (const rightText of right) {
      strongest = Math.max(strongest, jaccardSimilarity(leftTokens, eventTokens(rightText)));
    }
  }

  return strongest;
}

function strongestTextContainment(left: string[], right: string[]): number {
  let strongest = 0;
  for (const leftText of left) {
    const leftTokens = eventTokens(leftText);
    for (const rightText of right) {
      strongest = Math.max(strongest, tokenContainment(leftTokens, eventTokens(rightText)));
    }
  }
  return strongest;
}

function tokenContainment(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}

function clusterIsImportant(
  cluster: ClusterCandidate,
  briefing: ProcessingInput["briefing"],
  importantMessageIds: Set<string>
): boolean {
  return cluster.messages.some((message) => importantMessageIds.has(message.id) || isImportantToInterest(message, briefing));
}

function shouldKeepDuplicateAsEvidence(
  message: NormalizedMessage,
  duplicate: NormalizedMessage,
  important: boolean
): boolean {
  if (!important) return false;
  if (message.id === duplicate.id) return false;
  if (message.sourceUrl && duplicate.sourceUrl && message.sourceUrl === duplicate.sourceUrl) return false;
  return message.source.id !== duplicate.source.id || message.links.some((link) => !duplicate.links.includes(link));
}

function latestDate(dates: string[]): string {
  return dates
    .map((value) => new Date(value).toISOString())
    .sort()
    .at(-1)!;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
