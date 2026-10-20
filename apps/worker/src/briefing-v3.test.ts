import { describe, expect, it } from "vitest";
import type { BriefingResult, ModelPort } from "@distilled/briefing";
import type { BriefingConfig, BriefingEdition, NormalizedMessage } from "@distilled/core";
import { buildV3Edition, priorFromEditions, publishV3Window, v3RuntimeFromEnv, withUsageRecording } from "./briefing-v3";
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

function fakeRepo(editions: BriefingEdition[] = []) {
  const settings = new Map<string, string>();
  const saved: BriefingEdition[] = [];
  const usage: unknown[] = [];
  const repo = {
    getSetting: async (k: string) => settings.get(k) ?? null,
    setSetting: async (k: string, v: string) => void settings.set(k, v),
    listBriefingEditions: async () => editions,
    saveBriefingEdition: async (e: BriefingEdition) => void saved.push(e),
    recordLlmUsage: async (u: unknown) => void usage.push(u)
  } as unknown as Repository;
  return { repo, settings, saved, usage };
}

const result = (status: BriefingResult["status"], sourceIds: string[] = ["m1"]): BriefingResult => ({
  status,
  items: status === "published" ? [{ headline: "Robot recall", body: "Northwind recalls 12,000 robots.", relation: "new", importance: 1, sourceIds }] : [],
  skipped: [], dropped: [], usage: { calls: 2, inputTokens: 10, outputTokens: 5 }, timings: { totalMs: 1, stages: {} }
});

const window = { windowStart: "2026-10-19T09:00:00Z", windowEnd: "2026-10-19T10:00:00Z" };
const v3 = { port: {} as ModelPort, models: { editor: "e", verifier: "v" } };
const now = new Date("2026-10-19T10:00:05Z");

describe("V3 worker adapter", () => {
  it("saves a published edition whose sections carry the cited messages as evidence, and advances the watermark", async () => {
    const { repo, saved, settings } = fakeRepo();
    const outcome = await publishV3Window({ repo, v3, briefing, ...window, now, messages: [message("m1", "2026-10-19T09:10:00Z")], generate: async () => result("published") });
    expect(outcome).toBe("published");
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("published");
    expect(saved[0].sections[0]).toMatchObject({ title: "Robot recall", summary: "Northwind recalls 12,000 robots." });
    expect(saved[0].sections[0].evidence.map((e) => e.messageId)).toEqual(["m1"]);
    expect(settings.get("v3_evaluated_until:feed1")).toBe(window.windowEnd);
  });

  it("treats an empty briefing as evaluated but saves nothing", async () => {
    const { repo, saved, settings } = fakeRepo();
    expect(await publishV3Window({ repo, v3, briefing, ...window, now, messages: [message("m1", "2026-10-19T09:10:00Z")], generate: async () => result("empty") })).toBe("empty");
    expect(saved).toHaveLength(0);
    expect(settings.get("v3_evaluated_until:feed1")).toBe(window.windowEnd);
  });

  it("keeps articles pending after a rejected or failed run, and does not re-read evaluated articles after an empty one", async () => {
    for (const generate of [async () => result("rejected"), async () => { throw new Error("provider down"); }]) {
      const { repo, saved, settings } = fakeRepo();
      const outcome = await publishV3Window({ repo, v3, briefing, ...window, now, messages: [message("m1", "2026-10-19T09:10:00Z")], generate });
      expect(["rejected", "error"]).toContain(outcome);
      expect(saved).toHaveLength(0);
      expect(settings.has("v3_evaluated_until:feed1")).toBe(false);
    }
    const { repo, settings } = fakeRepo();
    settings.set("v3_evaluated_until:feed1", "2026-10-19T09:30:00Z");
    let seen: string[] = [];
    await publishV3Window({
      repo, v3, briefing, ...window, now,
      messages: [message("old", "2026-10-19T09:10:00Z"), message("new", "2026-10-19T09:40:00Z")],
      generate: async (input) => { seen = input.articles.map((a) => a.id); return result("empty"); }
    });
    expect(seen).toEqual(["new"]);
  });

  it("tells the engine what earlier editions already said", () => {
    const edition = buildV3Edition({ briefing, messages: [message("m1", "2026-10-19T09:10:00Z")], result: result("published"), ...window, now });
    const prior = priorFromEditions([edition]);
    expect(prior).toEqual([{ id: `${edition.id}:0`, at: window.windowEnd, headline: "Robot recall", body: "Northwind recalls 12,000 robots." }]);
  });

  it("records each model call in the usage ledger", async () => {
    const { repo, usage } = fakeRepo();
    const port = withUsageRecording({ complete: async () => ({ text: "{}", inputTokens: 100, outputTokens: 20, costUsd: 0.002 }) }, repo, "feed1");
    await port.complete({ model: "m", system: "", user: "", maxTokens: 1 });
    expect(usage[0]).toMatchObject({ briefingId: "feed1", model: "m", inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.002 });
  });

  it("is off unless BRIEFING_ENGINE=v3 and a credential exists", () => {
    expect(v3RuntimeFromEnv({ OPENROUTER_API_KEY: "k" } as Env)).toBeNull();
    expect(v3RuntimeFromEnv({ BRIEFING_ENGINE: "v3" } as Env)).toBeNull();
    expect(v3RuntimeFromEnv({ BRIEFING_ENGINE: "v3", OPENROUTER_API_KEY: "k" } as Env)?.models).toEqual({ editor: "openai/gpt-4.1", verifier: "openai/gpt-4.1-mini" });
  });
});
