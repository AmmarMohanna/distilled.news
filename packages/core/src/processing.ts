import { clusterMessages } from "./clustering";
import { classifyNoise, findDuplicate, isRelevantToInterest } from "./filtering";
import { createEvidenceOnlySummary } from "./summarization";
import { jaccardSimilarity, significantTokens, stableHash } from "./text";
import type {
  BriefingEvidence,
  BriefingItem,
  ClusterCandidate,
  NormalizedMessage,
  ProcessingInput,
  ProcessingResult,
  SuppressedMessage
} from "./types";

const UPDATE_MERGE_THRESHOLD = 0.32;

export function processMessages(input: ProcessingInput): ProcessingResult {
  const accepted: NormalizedMessage[] = [];
  const suppressed: SuppressedMessage[] = [];

  for (const message of input.messages) {
    const noise = classifyNoise(message);
    if (noise) {
      suppressed.push(noise);
      continue;
    }

    if (!isRelevantToInterest(message, input.briefing)) {
      suppressed.push({
        messageId: message.id,
        reason: "not_relevant",
        detail: "Message does not match the briefing interest profile."
      });
      continue;
    }

    const duplicate = findDuplicate(message, accepted);
    if (duplicate) {
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
    const evidence = cluster.messages.map(toEvidence);
    const existing = findMergeTarget(cluster, existingItems, newItems);

    if (existing) {
      mergeIntoItem(existing, evidence, cluster.messages);
      continue;
    }

    const item = createBriefingItem(input.briefing.retentionDays, cluster, evidence);
    if (item.summary) newItems.push(item);
  }

  return {
    publishedItems: [...existingItems, ...newItems].sort((left, right) =>
      right.itemAt.localeCompare(left.itemAt)
    ),
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

function createBriefingItem(
  retentionDays: number,
  cluster: ClusterCandidate,
  evidence: BriefingEvidence[]
): BriefingItem {
  const itemAt = latestDate(cluster.messages.map((message) => message.postedAt));
  const expiresAt = addDays(itemAt, retentionDays);
  const summary = createEvidenceOnlySummary(
    {
      id: "summary",
      slug: "summary",
      title: "Summary",
      interestProfile: "",
      publicFeedEnabled: false,
      retentionDays
    },
    evidence
  );

  return {
    id: `item_${stableHash(`${cluster.id}:${summary}`)}`,
    clusterId: cluster.id,
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
    sourceUrl: message.sourceUrl,
    postedAt: message.postedAt,
    text: message.text,
    links: message.links,
    media: message.media
  };
}

function findMergeTarget(
  cluster: ClusterCandidate,
  existingItems: BriefingItem[],
  newItems: BriefingItem[]
): BriefingItem | undefined {
  const candidates = [...existingItems, ...newItems];
  const clusterTokens = significantTokens(cluster.messages.map((message) => message.text).join(" "));

  return candidates.find((item) => {
    const itemTokens = significantTokens([item.summary, ...item.evidence.map((evidence) => evidence.text)].join(" "));
    return jaccardSimilarity(clusterTokens, itemTokens) >= UPDATE_MERGE_THRESHOLD;
  });
}

function mergeIntoItem(
  item: BriefingItem,
  evidence: BriefingEvidence[],
  messages: NormalizedMessage[]
): void {
  const existingMessageIds = new Set(item.evidence.map((entry) => entry.messageId));
  const nextEvidence = evidence.filter((entry) => !existingMessageIds.has(entry.messageId));
  item.evidence.push(...nextEvidence);
  item.mergedUpdateCount += nextEvidence.length;
  item.updatedAt = latestDate([...messages.map((message) => message.postedAt), item.updatedAt]);
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
