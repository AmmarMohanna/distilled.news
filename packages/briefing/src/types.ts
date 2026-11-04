export interface Article {
  /** Optional upstream revision metadata; timestamps are not inferred event times. */
  revision?: {evidenceId:string;version:number;acceptedAt:string;observedAt?:string;contentHash?:string;sourceObservationId?:string;acquiredContentId?:string};
  /** Stable id from the caller; used for citations and idempotent bookkeeping. */
  id: string;
  source: string;
  title?: string;
  url?: string;
  publishedAt: string;
  text: string;
}

export interface FeedSpec {
  /** What the reader follows, in the reader's own words. */
  interest: string;
  language: "en" | "ar" | "fr";
  /** Length of the briefing window; shapes how selective the editor is. */
  windowMinutes: number;
  style?: string;
}

/** Something the reader has already been told. */
export interface PriorItem {
  id: string;
  at: string;
  headline: string;
  body: string;
}

export type ItemRelation = "new" | "update" | "correction";

export interface BriefingItem {
  headline: string;
  body: string;
  relation: ItemRelation;
  /** 1 = lead story, 2 = notable, 3 = worth a line. */
  importance: 1 | 2 | 3;
  /** Article ids backing the item, duplicates merged in. */
  sourceIds: string[];
  /** Id of the prior item this updates or corrects, if any. */
  updatesId?: string;
}

export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of known call costs; undefined when no call reported a cost. */
  costUsd?: number;
}

export interface BriefingInput {
  feed: FeedSpec;
  articles: Article[];
  prior?: PriorItem[];
  windowStart: string;
  windowEnd: string;
}

export interface DroppedItem {
  headline: string;
  reason: string;
  /** Articles that backed the dropped item; callers may carry them to the next window. */
  sourceIds: string[];
  /** False when the item was dropped as redundant: retrying its articles would only repeat old news. */
  carry: boolean;
}

/** Something the editor read but did not publish, with the reason it gave, so omissions can be audited. */
export interface OmittedStory {
  stage: "editor" | "consolidation" | "safety_cap";
  reason: string;
  headline?: string;
  /** Article ids behind the omitted story. */
  sourceIds: string[];
}

/** A prepared source absent from both editor items and explicit exclusions.
 * This says nothing about importance, relevance, truth or whether it should be published. */
export interface UnaccountedSource {
  ref: string;
  sourceIds: string[];
}

export interface BriefingResult {
  /** Experimental audit, not an independent semantic-truth certificate. */
  evidenceAgent?: {architecture:'evidence-first-v1'|'evidence-first-v2';recordFailures?:Array<{developmentId:string|null;reason:string;sourceIds:string[]}>;priorAliases?:Array<{ref:string;canonicalId:string}>;semanticTruthEstablished:false;developments:unknown[];proofs:unknown[];reviews:unknown[];diagnostics:string[];toolUsage:{reads:number;returnedChars:number};acceptedDevelopmentIds:string[]};
  /**
   * published: at least one verified item.
   * empty: the editor judged nothing worth the reader's time (a valid outcome).
   * rejected: items were drafted but none survived verification; the caller
   *   should keep the articles available for the next window.
   */
  status: "published" | "empty" | "rejected";
  items: BriefingItem[];
  skipped: Array<{ id: string; reason: string }>;
  dropped: DroppedItem[];
  /** Stories left out by editorial choice (not by failed verification). */
  omitted: OmittedStory[];
  /** Absent on historical results. Legacy diagnostic only; the candidate carries unaccounted evidence without forcing inclusion or blocking unrelated verified items. */
  unaccounted?: UnaccountedSource[];
  usage: Usage;
  timings: { totalMs: number; stages: Record<string, number> };
}

export interface BriefingModels {
  editor: string;
  verifier: string;
}

/**
 * `uncertain` means the provider may have processed (and billed) the request: a timeout, a dropped
 * connection, or a 5xx other than 503. Callers must never blindly retry an uncertain failure and
 * must keep counting its worst-case cost. A 429/503 or other HTTP rejection is certain.
 */
export class BriefingModelError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly uncertain = false) {
    super(message);
    this.name = "BriefingModelError";
  }
}

/** Thrown before any provider call when spending is not admitted. Nothing was sent or billed. */
export class BriefingBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefingBudgetError";
  }
}
