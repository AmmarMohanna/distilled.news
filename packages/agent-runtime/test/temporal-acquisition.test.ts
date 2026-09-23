import { describe, expect, it } from "vitest";
import { MemorySourceHighWaterStore, TemporalSourceAcquisition, commitSourceHighWater, itemInRequestedWindow, type AcquiredSourceItem, type SourceAcquisitionAdapter, type SourceAcquisitionPage, type SourceAcquisitionRequest } from "../src/temporal-acquisition";

const request = (): SourceAcquisitionRequest => ({ source: { canonicalSourceUrl: "https://example.test/technology" }, window: { startTime: "2026-09-01T00:00:00.000Z", endTime: "2026-09-08T00:00:00.000Z" }, limits: { maxItems: 20, maxPages: 5, maxScrolls: 5, maxPhysicalAttempts: 5, maxExecutionMs: 10_000 }, authentication: "PUBLIC" });
const item = (id: string, publishedAt?: string): AcquiredSourceItem => ({ sourceResource: "https://example.test/technology", sourceItemId: id, canonicalItemUrl: `https://example.test/post/${id}#fragment`, publishedAt, text: id, acquisitionEvidence: { timestampSource: publishedAt ? "time-element" : "none" } });
class Pages implements SourceAcquisitionAdapter {
  readonly authentication = "PUBLIC" as const; calls = 0; closed = 0;
  constructor(private readonly pages: SourceAcquisitionPage[]) {}
  async open() {} async next() { return this.pages[this.calls++] ?? { items: [], paginationExhausted: true }; } async close() { this.closed++; }
}

describe("generic temporal source acquisition", () => {
  it("uses a half-open interval so adjacent windows do not double-count a boundary", () => {
    const boundary = item("boundary", "2026-09-08T00:00:00.000Z");
    expect(itemInRequestedWindow(boundary, request().window)).toBe(false);
    expect(itemInRequestedWindow(boundary, { startTime: "2026-09-08T00:00:00.000Z", endTime: "2026-09-15T00:00:00.000Z" })).toBe(true);
  });
  it("filters outside items and suppresses canonical IDs before normal ingestion", async () => {
    const adapter = new Pages([{ items: [item("old", "2026-08-31T23:59:59.000Z"), item("in", "2026-09-02T00:00:00.000Z"), item("in", "2026-09-02T00:00:00.000Z"), item("end", "2026-09-08T00:00:00.000Z")], lowerBoundaryReached: true }]);
    const result = await new TemporalSourceAcquisition().acquire(request(), adapter);
    expect(result.items.map(value => value.sourceItemId)).toEqual(["in"]); expect(result.coverage.rangeCovered).toBe(true); expect(adapter.closed).toBe(1);
  });
  it("does not let a pinned/out-of-order old item stop traversal without adapter boundary evidence", async () => {
    const adapter = new Pages([{ items: [item("pinned", "2025-01-01T00:00:00.000Z"), item("recent", "2026-09-02T00:00:00.000Z")] }, { items: [item("older", "2026-08-31T00:00:00.000Z")], lowerBoundaryReached: true }]);
    const result = await new TemporalSourceAcquisition().acquire(request(), adapter);
    expect(result.continuation?.pageCount).toBe(2); expect(result.coverage.stopReason).toBe("START_BOUNDARY_REACHED");
  });
  it("reports pagination exhaustion and budget exhaustion as incomplete coverage", async () => {
    const exhausted = await new TemporalSourceAcquisition().acquire(request(), new Pages([{ items: [item("recent", "2026-09-02T00:00:00.000Z")], paginationExhausted: true }]));
    expect(exhausted.coverage).toMatchObject({ rangeCovered: false, truncated: true, stopReason: "SOURCE_PAGINATION_EXHAUSTED" });
    const limited = request(); limited.limits.maxPages = 1;
    const budget = await new TemporalSourceAcquisition().acquire(limited, new Pages([{ items: [item("recent", "2026-09-02T00:00:00.000Z")] }, { items: [item("old", "2026-08-01T00:00:00.000Z")], lowerBoundaryReached: true }]));
    expect(budget.coverage).toMatchObject({ rangeCovered: false, truncated: true, stopReason: "MAX_PAGES_REACHED" });
  });
  it("never invents timestamps and never advances high-water over an unproved gap", async () => {
    const missing = await new TemporalSourceAcquisition().acquire(request(), new Pages([{ items: [item("unknown")], sourceExhausted: true }]));
    expect(missing.coverage).toMatchObject({ oldestObservedTimestamp: undefined, rangeCovered: false, stopReason: "SOURCE_TIMESTAMP_UNAVAILABLE" });
    const store = new MemorySourceHighWaterStore(); await store.put({ key: "source", lastSuccessfulBoundary: "2026-09-01T00:00:00.000Z" });
    await commitSourceHighWater(store, "source", missing);
    expect(await store.get("source")).toMatchObject({ lastSuccessfulBoundary: "2026-09-01T00:00:00.000Z", unresolvedWindow: request().window });
  });
  it("commits high-water only after a covered run", async () => {
    const covered = await new TemporalSourceAcquisition().acquire(request(), new Pages([{ items: [item("in", "2026-09-02T00:00:00.000Z"), item("old", "2026-08-31T00:00:00.000Z")], sourceExhausted: true }]));
    const store = new MemorySourceHighWaterStore(); await commitSourceHighWater(store, "source", covered);
    expect(await store.get("source")).toEqual({ key: "source", lastSuccessfulBoundary: "2026-09-08T00:00:00.000Z" });
  });
});
