import { describe, expect, it } from "vitest";
import { BriefingBudgetError, type BriefingResult, type ModelPort } from "@distilled/briefing";
import type { BriefingConfig, BriefingEdition, NormalizedMessage } from "@distilled/core";
import { buildV3Edition, priorFromEditions, publishV3Window, v3RuntimeFromEnv, withUsageRecording, type V3Runtime } from "./briefing-v3";
import type { Env, Repository } from "./types";

const briefing = {
  id: "feed1", interestProfile: "Robotics news", language: "en", briefingCadence: "hourly", updateIntervalMinutes: 60
} as unknown as BriefingConfig;

function message(id: string, postedAt: string, text = "Northwind recalls 12,000 robots after a battery fault."): NormalizedMessage {
  return {
    id, messageId: id, text, links: [], media: [], postedAt, receivedAt: postedAt, expiresAt: "2027-01-01T00:00:00Z",
    source: { id: "s1", title: "Trade Wire", type: "channel" }, sourceUrl: `https://example.invalid/${id}`
  };
}

/** Repository double that honours window bounds like the real one: start inclusive, end exclusive. */
function fakeRepo(all: NormalizedMessage[], editions: BriefingEdition[] = []) {
  const settings = new Map<string, string>();
  const saved: BriefingEdition[] = [];
  const usage: unknown[] = [];
  const repo = {
    getSetting: async (k: string) => settings.get(k) ?? null,
    setSetting: async (k: string, v: string) => void settings.set(k, v),
    listBriefingEditions: async () => [...editions, ...saved],
    saveBriefingEdition: async (e: BriefingEdition) => void saved.push(e),
    recordLlmUsage: async (u: unknown) => void usage.push(u),
    listRawMessagesForWindow: async (_f: string, start: string, end: string, limit = 500) =>
      all.filter((m) => m.postedAt >= start && m.postedAt < end).sort((a, b) => a.postedAt.localeCompare(b.postedAt)).slice(0, limit),
    getRawMessage: async (id: string) => all.find((m) => m.id === id) ?? null
  } as unknown as Repository;
  const state = () => JSON.parse(settings.get("v3_state:feed1") ?? "null");
  return { repo, settings, saved, usage, state };
}

const item = (sourceIds: string[], headline = "Robot recall") => ({ headline, body: "Northwind recalls 12,000 robots.", relation: "new" as const, importance: 1 as const, sourceIds });
const drop = (sourceIds: string[], carry = true, headline = "Dropped") => ({ headline, reason: "unsupported", carry, sourceIds });
const result = (status: BriefingResult["status"], over: Partial<BriefingResult> = {}): BriefingResult => ({
  status, items: status === "published" ? [item(["m1"])] : [], skipped: [], dropped: [], omitted: [],
  usage: { calls: 2, inputTokens: 10, outputTokens: 5 }, timings: { totalMs: 1, stages: {} }, ...over
});

const v3 = { port: {} as ModelPort, models: { editor: "e", verifier: "v" }, spend: { guard: {} as never, prices: {} } } as V3Runtime;
const now = new Date("2026-10-19T10:00:05Z");
const run = (r: ReturnType<typeof fakeRepo>, generate: (input: { articles: { id: string }[] }) => Promise<BriefingResult>, over: { fallbackStart?: string; windowEnd?: string } = {}) =>
  publishV3Window({ repo: r.repo, v3, briefing, fallbackStart: "2026-10-19T09:00:00Z", windowEnd: "2026-10-19T10:00:00Z", now, generate: generate as never, ...over });

describe("V3 carry-forward", () => {
  it("publishes, saves the edition with cited evidence, and moves the cursor", async () => {
    const r = fakeRepo([message("m1", "2026-10-19T09:10:00Z")]);
    expect(await run(r, async () => result("published"))).toBe("published");
    expect(r.saved).toHaveLength(1);
    expect(r.saved[0].sections[0].evidence.map((e) => e.messageId)).toEqual(["m1"]);
    expect(r.state().cursor).toBe("2026-10-19T10:00:00Z");
  });

  it("reads from its own cursor, so a window skipped in between is not lost", async () => {
    const r = fakeRepo([message("a", "2026-10-19T09:10:00Z"), message("gap", "2026-10-19T10:30:00Z"), message("b", "2026-10-19T11:30:00Z")]);
    await run(r, async () => result("empty"));
    const seen: string[][] = [];
    // Scheduler jumped straight to the 11:00-12:00 window; the 10:00-11:00 article must still be read.
    await run(r, async (i) => (seen.push(i.articles.map((a) => a.id)), result("empty")), { windowEnd: "2026-10-19T12:00:00Z", fallbackStart: "2026-10-19T11:00:00Z" });
    expect(seen).toEqual([["gap", "b"]]);
  });

  it("leaves everything untouched when generation fails or the budget refuses, so the same articles are re-read", async () => {
    for (const fail of [new Error("provider down"), new BriefingBudgetError("exhausted")]) {
      const r = fakeRepo([message("m1", "2026-10-19T09:10:00Z")]);
      const outcome = await run(r, async () => { throw fail; });
      expect(outcome).toBe(fail instanceof BriefingBudgetError ? "budget" : "error");
      expect(r.saved).toHaveLength(0);
      expect(r.state()).toBeNull();
      const seen: string[][] = [];
      await run(r, async (i) => (seen.push(i.articles.map((a) => a.id)), result("empty")));
      expect(seen).toEqual([["m1"]]);
    }
  });

  it("partial failure: publishes the good item and carries the failed item's articles into the next run", async () => {
    const r = fakeRepo([message("m1", "2026-10-19T09:10:00Z"), message("m2", "2026-10-19T09:20:00Z"), message("m3", "2026-10-19T11:10:00Z")]);
    await run(r, async () => result("published", { items: [item(["m1"])], dropped: [drop(["m2"])] }));
    expect(r.state().pending).toEqual({ m2: 1 });
    expect(r.saved[0].sections.map((s) => s.title)).toEqual(["Robot recall"]);

    const seen: string[][] = [];
    await run(r, async (i) => (seen.push(i.articles.map((a) => a.id)), result("published", { items: [item(["m2", "m3"], "Both")] })), { windowEnd: "2026-10-19T12:00:00Z" });
    expect(seen).toEqual([["m2", "m3"]]); // m2 predates the cursor, so only the pending list could bring it back
    expect(r.state().pending).toEqual({});
  });

  it("gives up on an article after its one retry and records why, instead of retrying forever", async () => {
    const r = fakeRepo([message("m2", "2026-10-19T09:20:00Z")]);
    const failing = async () => result("rejected", { dropped: [drop(["m2"], true, "Unverifiable claim")] });
    expect(await run(r, failing)).toBe("rejected");
    expect(r.state().pending).toEqual({ m2: 1 });
    await run(r, failing, { windowEnd: "2026-10-19T11:00:00Z" });
    expect(r.state().pending).toEqual({});
    expect(r.state().abandoned).toMatchObject([{ headline: "Unverifiable claim", articleIds: ["m2"] }]);
    const seen: string[][] = [];
    await run(r, async (i) => (seen.push(i.articles.map((a) => a.id)), result("empty")), { windowEnd: "2026-10-19T12:00:00Z" });
    expect(seen).toEqual([]); // nothing left to offer: the model is never called
  });

  it("does not retry an item dropped as redundant, nor an article a published item already cites", async () => {
    const r = fakeRepo([message("m1", "2026-10-19T09:10:00Z"), message("m2", "2026-10-19T09:20:00Z"), message("m3", "2026-10-19T09:30:00Z")]);
    await run(r, async () => result("published", { items: [item(["m1", "m3"])], dropped: [drop(["m2"], false, "Repeat"), drop(["m3"], true, "Weak angle on a covered story")] }));
    expect(r.state().pending).toEqual({});
  });

  it("an empty result clears carried articles it just evaluated", async () => {
    const r = fakeRepo([message("m2", "2026-10-19T09:20:00Z")]);
    await run(r, async () => result("rejected", { dropped: [drop(["m2"])] }));
    expect(r.state().pending).toEqual({ m2: 1 });
    await run(r, async () => result("empty"), { windowEnd: "2026-10-19T11:00:00Z" });
    expect(r.state().pending).toEqual({});
  });

  it("splits an over-full window at a timestamp boundary and continues from there next run", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => message(`m${i}`, new Date(Date.parse("2026-10-19T09:00:00Z") + i * 1000).toISOString()));
    const r = fakeRepo([...many, message("late", "2026-10-19T09:59:00Z")]);
    const seen: number[] = [];
    await run(r, async (i) => (seen.push(i.articles.length), result("empty")), { fallbackStart: "2026-10-19T08:59:00Z" });
    expect(seen[0]).toBe(999); // the last timestamp is held back for the next run
    expect(r.state().cursor).toBe(many[999].postedAt);
    await run(r, async (i) => (seen.push(i.articles.length), result("empty")));
    expect(seen[1]).toBe(2); // m999 and late: nothing lost, nothing read twice
  });
});

describe("V3 adapter basics", () => {
  it("tells the engine what earlier editions already said", () => {
    const edition = buildV3Edition({ briefing, messages: [message("m1", "2026-10-19T09:10:00Z")], result: result("published"), windowStart: "2026-10-19T09:00:00Z", windowEnd: "2026-10-19T10:00:00Z", now });
    expect(priorFromEditions([edition])).toEqual([{ id: `${edition.id}:0`, at: "2026-10-19T10:00:00Z", headline: "Robot recall", body: "Northwind recalls 12,000 robots." }]);
  });

  it("records each model call in the usage ledger", async () => {
    const r = fakeRepo([]);
    const port = withUsageRecording({ complete: async () => ({ text: "{}", inputTokens: 100, outputTokens: 20, costUsd: 0.002 }) }, r.repo, "feed1");
    await port.complete({ model: "m", system: "", user: "", maxTokens: 1 });
    expect(r.usage[0]).toMatchObject({ briefingId: "feed1", model: "m", inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.002 });
  });

  it("runs only with the flag, a credential AND an explicit dollar budget, and fails closed otherwise", () => {
    const db = {} as D1Database;
    const base = { BRIEFING_ENGINE: "v3", OPENROUTER_API_KEY: "k", DB: db } as unknown as Env;
    expect(v3RuntimeFromEnv({ ...base, BRIEFING_ENGINE: undefined } as Env)).toBeNull();
    expect(v3RuntimeFromEnv({ ...base, OPENROUTER_API_KEY: undefined } as Env)).toBeNull();
    expect(v3RuntimeFromEnv(base)).toBeNull(); // no budget configured
    expect(v3RuntimeFromEnv({ ...base, BRIEFING_V3_DAILY_BUDGET_USD: "0" } as Env)).toBeNull();
    expect(v3RuntimeFromEnv({ ...base, BRIEFING_V3_DAILY_BUDGET_USD: "abc" } as Env)).toBeNull();
    expect(v3RuntimeFromEnv({ ...base, BRIEFING_V3_DAILY_BUDGET_USD: "2", BRIEFING_PRICES_JSON: "{oops" } as Env)).toBeNull();
    const ok = v3RuntimeFromEnv({ ...base, BRIEFING_V3_DAILY_BUDGET_USD: "2" } as Env)!;
    expect(ok.models).toEqual({ editor: "openai/gpt-4.1", verifier: "openai/gpt-4.1-mini" });
    expect(ok.spend.guard.limits).toEqual({ dailyUsd: 2, runUsd: 0.5 });
  });
});
