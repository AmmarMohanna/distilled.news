/** Generic, adapter-driven acquisition of a bounded source history.  Site adapters own
 * recognition and traversal; this module owns time, budgets, identity and honesty. */
export type SourceAuthenticationMode = "PUBLIC" | "AUTH_OPTIONAL" | "AUTH_REQUIRED";
export type SourceAcquisitionStopReason =
  | "START_BOUNDARY_REACHED" | "SOURCE_EXHAUSTED" | "SOURCE_PAGINATION_EXHAUSTED"
  | "MAX_ITEMS_REACHED" | "MAX_PAGES_REACHED" | "MAX_SCROLLS_REACHED"
  | "EXECUTION_BUDGET_REACHED" | "SOURCE_TIMESTAMP_UNAVAILABLE" | "AUTH_REQUIRED"
  | "SESSION_EXPIRED" | "CHALLENGE_REQUIRED" | "STRUCTURAL_FAILURE";

export interface SourceAcquisitionRequest {
  source: { sourceFamily?: string; canonicalSourceUrl?: string; resourceLocator?: string; accountOrChannel?: string };
  window: { startTime: string; endTime: string };
  filters?: { includeReplies?: boolean; includeReposts?: boolean; contentTypes?: string[] };
  limits: { maxItems: number; maxPages: number; maxScrolls: number; maxPhysicalAttempts: number; maxExecutionMs: number };
  authentication?: SourceAuthenticationMode;
}

export interface AcquiredSourceItem {
  sourceResource: string;
  canonicalItemUrl?: string;
  sourceItemId?: string;
  title?: string;
  text?: string;
  publishedAt?: string;
  author?: string;
  originalSourceReference?: string;
  mediaReferences?: string[];
  linkReferences?: string[];
  acquisitionEvidence: Record<string, unknown>;
}

export interface SourceAcquisitionCoverage {
  newestObservedTimestamp?: string;
  oldestObservedTimestamp?: string;
  rangeCovered: boolean;
  truncated: boolean;
  stopReason: SourceAcquisitionStopReason;
}
export interface SourceAcquisitionResult {
  items: AcquiredSourceItem[];
  requestedWindow: SourceAcquisitionRequest["window"];
  coverage: SourceAcquisitionCoverage;
  continuation?: { pageCount: number; scrollCount: number; noProgressCount: number; uniqueCanonicalIds: number; uniqueCanonicalUrls: number };
  provenance?: { workflowId?: string; workflowVersion?: number; mechanism?: string };
}

/** `lowerBoundaryReached` is adapter evidence, not a guess based on a single item.
 * An adapter may set it only after its source-specific pagination semantics prove it. */
export interface SourceAcquisitionPage {
  items: AcquiredSourceItem[];
  scrolls?: number;
  lowerBoundaryReached?: boolean;
  sourceExhausted?: boolean;
  paginationExhausted?: boolean;
  stopReason?: Extract<SourceAcquisitionStopReason, "AUTH_REQUIRED" | "SESSION_EXPIRED" | "CHALLENGE_REQUIRED" | "STRUCTURAL_FAILURE" | "SOURCE_TIMESTAMP_UNAVAILABLE">;
}
export interface SourceAcquisitionAdapter {
  readonly authentication: SourceAuthenticationMode;
  open(request: SourceAcquisitionRequest): Promise<void>;
  next(request: SourceAcquisitionRequest): Promise<SourceAcquisitionPage>;
  close(): Promise<void>;
}

export interface SourceHighWaterState { key: string; lastSuccessfulBoundary?: string; unresolvedWindow?: SourceAcquisitionRequest["window"]; }
export interface SourceHighWaterStore { get(key: string): Promise<SourceHighWaterState | undefined>; put(state: SourceHighWaterState): Promise<void>; }
export class MemorySourceHighWaterStore implements SourceHighWaterStore {
  private values = new Map<string, SourceHighWaterState>();
  async get(key: string) { const v = this.values.get(key); return v && structuredClone(v); }
  async put(state: SourceHighWaterState) { this.values.set(state.key, structuredClone(state)); }
}

export function itemInRequestedWindow(item: AcquiredSourceItem, window: SourceAcquisitionRequest["window"]): boolean {
  const time = trustedTime(item.publishedAt); const start = trustedTime(window.startTime); const end = trustedTime(window.endTime);
  return time !== undefined && start !== undefined && end !== undefined && time >= start && time < end;
}

export function canonicalItemIdentity(item: AcquiredSourceItem): string | undefined {
  if (item.sourceItemId?.trim()) return `source:${item.sourceItemId.trim()}`;
  if (item.canonicalItemUrl) { try { const url = new URL(item.canonicalItemUrl); url.hash = ""; return `url:${url.href}`; } catch { return undefined; } }
  return undefined;
}

export class TemporalSourceAcquisition {
  async acquire(request: SourceAcquisitionRequest, adapter: SourceAcquisitionAdapter): Promise<SourceAcquisitionResult> {
    assertWindow(request.window);
    const started = Date.now(), seen = new Set<string>(), idSet = new Set<string>(), urlSet = new Set<string>();
    const items: AcquiredSourceItem[] = []; let pages = 0, scrolls = 0, attempts = 0, noProgress = 0;
    let newest: number | undefined, oldest: number | undefined, stopReason: SourceAcquisitionStopReason = "SOURCE_PAGINATION_EXHAUSTED";
    try {
      await adapter.open(request);
      while (true) {
        if (Date.now() - started >= request.limits.maxExecutionMs) { stopReason = "EXECUTION_BUDGET_REACHED"; break; }
        if (pages >= request.limits.maxPages) { stopReason = "MAX_PAGES_REACHED"; break; }
        if (scrolls >= request.limits.maxScrolls) { stopReason = "MAX_SCROLLS_REACHED"; break; }
        if (attempts >= request.limits.maxPhysicalAttempts) { stopReason = "EXECUTION_BUDGET_REACHED"; break; }
        attempts++; const page = await adapter.next(request); pages++; scrolls += page.scrolls ?? 0;
        let progress = false;
        for (const item of page.items) {
          const timestamp = trustedTime(item.publishedAt);
          if (timestamp !== undefined) { newest = newest === undefined ? timestamp : Math.max(newest, timestamp); oldest = oldest === undefined ? timestamp : Math.min(oldest, timestamp); }
          const identity = canonicalItemIdentity(item); if (!identity || seen.has(identity)) continue;
          seen.add(identity); progress = true;
          if (item.sourceItemId?.trim()) idSet.add(item.sourceItemId.trim());
          if (item.canonicalItemUrl) { try { const url = new URL(item.canonicalItemUrl); url.hash = ""; urlSet.add(url.href); } catch { /* invalid URLs are not canonical identities */ } }
          if (itemInRequestedWindow(item, request.window)) items.push(item);
          if (items.length >= request.limits.maxItems) { stopReason = "MAX_ITEMS_REACHED"; break; }
        }
        if (!progress) noProgress++;
        if (stopReason === "MAX_ITEMS_REACHED") break;
        if (page.stopReason) { stopReason = page.stopReason; break; }
        if (page.lowerBoundaryReached) { stopReason = "START_BOUNDARY_REACHED"; break; }
        if (page.sourceExhausted) { stopReason = "SOURCE_EXHAUSTED"; break; }
        if (page.paginationExhausted) { stopReason = "SOURCE_PAGINATION_EXHAUSTED"; break; }
      }
    } finally { await adapter.close(); }
    const hasTimestampEvidence = oldest !== undefined;
    const rangeCovered = hasTimestampEvidence && (stopReason === "START_BOUNDARY_REACHED" || stopReason === "SOURCE_EXHAUSTED");
    if (!hasTimestampEvidence && (stopReason === "START_BOUNDARY_REACHED" || stopReason === "SOURCE_EXHAUSTED" || stopReason === "SOURCE_PAGINATION_EXHAUSTED")) stopReason = "SOURCE_TIMESTAMP_UNAVAILABLE";
    return { items, requestedWindow: request.window, coverage: { newestObservedTimestamp: iso(newest), oldestObservedTimestamp: iso(oldest), rangeCovered, truncated: !rangeCovered, stopReason }, continuation: { pageCount: pages, scrollCount: scrolls, noProgressCount: noProgress, uniqueCanonicalIds: idSet.size, uniqueCanonicalUrls: urlSet.size } };
  }
}

/** Commit only a proved, durable run. An incomplete range is retained for retry. */
export async function commitSourceHighWater(store: SourceHighWaterStore, key: string, result: SourceAcquisitionResult): Promise<SourceHighWaterState> {
  const current = await store.get(key) ?? { key };
  const next: SourceHighWaterState = result.coverage.rangeCovered
    ? { key, lastSuccessfulBoundary: result.requestedWindow.endTime }
    : { ...current, unresolvedWindow: result.requestedWindow };
  await store.put(next); return next;
}

function trustedTime(value?: string) { if (!value) return undefined; const n = Date.parse(value); return Number.isFinite(n) ? n : undefined; }
function iso(value?: number) { return value === undefined ? undefined : new Date(value).toISOString(); }
function assertWindow(window: SourceAcquisitionRequest["window"]) { const start = trustedTime(window.startTime), end = trustedTime(window.endTime); if (start === undefined || end === undefined || start >= end) throw new Error("Source acquisition window must be a valid half-open interval"); }
