export interface Article {
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
}

export interface BriefingResult {
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
  usage: Usage;
  timings: { totalMs: number; stages: Record<string, number> };
}

export interface BriefingModels {
  editor: string;
  verifier: string;
}

export class BriefingModelError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "BriefingModelError";
  }
}
