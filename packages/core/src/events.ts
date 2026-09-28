import { createEvidenceOnlySummary, isLowInformationSummary } from "./summarization";
import { eventTokens, jaccardSimilarity, normalizeEventText, stableHash } from "./text";
import type { BriefingConfig, BriefingEvidence, BriefingItem } from "./types";
import {normalizedDocumentUrl,evidenceFingerprint} from "./developments";

const SAME_EVENT_TOKEN_THRESHOLD = 0.72;
const SAME_EVENT_CONTAINMENT_THRESHOLD = 0.86;

export function eventKeysForEvidence(evidence: BriefingEvidence): string[] {
  const keys = new Set<string>();
  keys.add(`raw:${evidence.messageId}`);

  for (const link of evidence.documentId?[evidence.sourceUrl]:[evidence.sourceUrl, ...evidence.links]) {
    const canonical = canonicalUrl(link);
    if (canonical && canonical.split("?")[0].includes("/")) keys.add(`url:${canonical}`);
  }

  const normalized = normalizeEventText(evidence.text);
  if (normalized) keys.add(`text:${stableHash(normalized)}`);

  const tokens = eventTokens(evidence.text);
  if (tokens.length >= 5) keys.add(`tokens:${stableHash(tokens.slice().sort().join(" "))}`);

  return Array.from(keys).sort();
}

export function eventKeysForItem(item: BriefingItem): string[] {
  const keys = new Set<string>();
  if (item.eventKey) keys.add(item.eventKey);
  for (const evidence of item.evidence) {
    for (const key of eventKeysForEvidence(evidence)) keys.add(key);
  }
  if (keys.size === 0) keys.add(`item:${item.id}`);
  return Array.from(keys).sort();
}

export function primaryEventKeyForEvidence(evidence: BriefingEvidence[]): string {
  const keys = evidence.flatMap(eventKeysForEvidence);
  return keys.find((key) => key.startsWith("url:")) ?? keys.find((key) => key.startsWith("text:")) ?? keys[0] ?? `event:${stableHash(JSON.stringify(evidence))}`;
}

export function areSameEventDeterministic(left: BriefingEvidence[], right: BriefingEvidence[]): boolean {
  const leftKeys = new Set(left.flatMap(eventKeysForEvidence));
  const rightKeys = new Set(right.flatMap(eventKeysForEvidence));
  for (const key of leftKeys) {
    if (rightKeys.has(key) && !key.startsWith("tokens:")) return true;
  }
  const leftTime=Math.max(...left.map(entry=>Date.parse(entry.postedAt))),rightTime=Math.max(...right.map(entry=>Date.parse(entry.postedAt)));
  if(Number.isFinite(leftTime)&&Number.isFinite(rightTime)&&Math.abs(leftTime-rightTime)>72*3600000)return false;

  for (const leftEvidence of left) {
    const leftText = normalizeEventText(leftEvidence.text);
    const leftTokens = eventTokens(leftEvidence.text);
    if (!leftText || leftTokens.length === 0) continue;

    for (const rightEvidence of right) {
      const rightText = normalizeEventText(rightEvidence.text);
      const rightTokens = eventTokens(rightEvidence.text);
      if (!rightText || rightTokens.length === 0) continue;
      if (leftText === rightText) return true;
      if (leftText.includes(rightText) || rightText.includes(leftText)) return true;
      if (jaccardSimilarity(leftTokens, rightTokens) >= SAME_EVENT_TOKEN_THRESHOLD) return true;
      if (tokenContainment(leftTokens, rightTokens) >= SAME_EVENT_CONTAINMENT_THRESHOLD) return true;
    }
  }

  return false;
}

export function collapseDuplicateBriefingItems(
  items: BriefingItem[],
  briefing?: BriefingConfig
): BriefingItem[] {
  const survivors: BriefingItem[] = [];
  for (const item of items) {
    const match = survivors.find((candidate) => areSameEventDeterministic(candidate.evidence, item.evidence));
    if (match) {
      mergeBriefingItem(match, item, briefing);
    } else {
      survivors.push(cloneItem(item));
    }
  }

  return survivors.sort((left, right) => right.itemAt.localeCompare(left.itemAt));
}

export function mergeBriefingItem(
  survivor: BriefingItem,
  duplicate: BriefingItem,
  briefing?: BriefingConfig
): BriefingItem {
  const existingMessageIds = new Set(survivor.evidence.map((entry) => entry.messageId));
  for (const evidence of duplicate.evidence) {
    if (existingMessageIds.has(evidence.messageId)) continue;
    survivor.evidence.push(evidence);
    existingMessageIds.add(evidence.messageId);
  }

  survivor.updatedAt = latestDate([survivor.updatedAt, duplicate.updatedAt, ...survivor.evidence.map((entry) => entry.postedAt)]);
  survivor.itemAt = latestDate([survivor.itemAt, duplicate.itemAt, ...survivor.evidence.map((entry) => entry.postedAt)]);
  survivor.expiresAt = latestDate([survivor.expiresAt, duplicate.expiresAt]);
  survivor.mergedUpdateCount = Math.max(0, survivor.evidence.length - 1);
  survivor.eventKey = survivor.eventKey ?? duplicate.eventKey ?? primaryEventKeyForEvidence(survivor.evidence);

  if (briefing) {
    const refreshedSummary = createEvidenceOnlySummary(briefing, survivor.evidence);
    if (refreshedSummary && !isLowInformationSummary(refreshedSummary)) survivor.summary = refreshedSummary;
  } else if (duplicate.updatedAt.localeCompare(survivor.updatedAt) >= 0 && duplicate.summary) {
    survivor.summary = duplicate.summary;
  }

  if(survivor.development||duplicate.development){
    const states=[survivor.development,duplicate.development].filter((state):state is NonNullable<BriefingItem['development']>=>Boolean(state));
    const newest=states.slice().sort((a,b)=>b.version-a.version)[0];
    const claims=Array.from(new Map(states.flatMap(state=>state.claims).map(claim=>[claim.id,claim])).values());
    survivor.development={...newest,claims:claims.slice(-24),
      evidenceFingerprint:evidenceFingerprint(survivor.evidence),
      changes:Array.from(new Map(states.flatMap(state=>state.changes).map(change=>[change.id,change])).values()).slice(-32),
      membership:Array.from(new Map(states.flatMap(state=>state.membership).map(member=>[member.messageId,member])).values())};
    survivor.summary=survivor.development.claims.slice(-4).map(claim=>claim.text).join(' ');
  }
  return survivor;
}

export function canonicalUrl(value: string | undefined): string | undefined {
  const normalized=normalizedDocumentUrl(value);
  if(!normalized)return undefined;
  const url=new URL(normalized);
  return `${url.hostname.replace(/^twitter\.com$/,"x.com")}${url.pathname==='/'?'':url.pathname}${url.search}`;
}

function tokenContainment(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}

function latestDate(dates: string[]): string {
  return dates
    .map((value) => new Date(value).toISOString())
    .sort()
    .at(-1)!;
}

function cloneItem(item: BriefingItem): BriefingItem {
  return {
    ...item,
    evidence: item.evidence.map((evidence) => ({
      ...evidence,
      links: [...evidence.links],
      media: evidence.media.map((media) => ({ ...media }))
    }))
  };
}
