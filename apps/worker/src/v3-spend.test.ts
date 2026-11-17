import {migrationStatements} from './test-migrations';
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BriefingBudgetError, BriefingModelError, type ModelPort } from "@distilled/briefing";
import { V3SpendGuard, estimateCallUsd, guardedModelPort } from "./v3-spend";

let mf: Miniflare;
let db: D1Database;
const prices = { m: { input: 2, output: 8 } };
const req = { model: "m", system: "s".repeat(300), user: "u".repeat(2700), maxTokens: 1000 }; // 1000 in-tokens (est) + 1000 out
const EST = estimateCallUsd(req, prices); // (1000*2 + 1000*8)/1e6 = 0.01
let t = 1_000_000_000_000;
const clock = () => t;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const sql = readFileSync(new URL("../migrations/0067_v3_model_spend.sql", import.meta.url), "utf8");
  const statements = migrationStatements(sql);
  await db.batch(statements.map((x) => db.prepare(x)));
});
afterAll(async () => mf.dispose());
beforeEach(async () => {
  await db.exec("DELETE FROM v3_model_spend");
  t = 1_000_000_000_000;
});

const guard = (daily: number, run: number) => new V3SpendGuard(db, { dailyUsd: daily, runUsd: run }, clock);
const reserve = (g: V3SpendGuard, runId = "r1") => g.reserve({ runId, feedId: "f", model: "m", estimateUsd: EST });

describe("V3SpendGuard", () => {
  it("estimates pessimistically and refuses unpriced models before any call", () => {
    expect(EST).toBeCloseTo(0.01);
    expect(() => estimateCallUsd({ ...req, model: "unknown" }, prices)).toThrow(BriefingBudgetError);
  });

  it("admits up to the daily cap and refuses beyond it", async () => {
    const g = guard(0.035, 1);
    const ids = [await reserve(g), await reserve(g), await reserve(g), await reserve(g)];
    expect(ids.map(Boolean)).toEqual([true, true, true, false]);
  });

  it("enforces the per-run ceiling separately from the daily cap", async () => {
    const g = guard(10, 0.025);
    expect([await reserve(g, "a"), await reserve(g, "a"), await reserve(g, "a")].map(Boolean)).toEqual([true, true, false]);
    expect(Boolean(await reserve(g, "b"))).toBe(true);
  });

  it("never lets concurrent callers exceed the cap (atomic admission)", async () => {
    const g = guard(0.05, 10);
    const results = await Promise.all(Array.from({ length: 12 }, () => reserve(g)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await g.spentLast24h()).toBeCloseTo(0.05);
  });

  it("settles to the actual cost, which frees unused reservation and counts overruns", async () => {
    const g = guard(0.02, 10);
    const id = (await reserve(g))!;
    await g.settle(id, 0.002);
    expect(await g.spentLast24h()).toBeCloseTo(0.002);
    const over = (await reserve(g))!;
    await g.settle(over, 0.015); // actual above its estimate still counts in full
    expect(await g.spentLast24h()).toBeCloseTo(0.017);
    expect(await reserve(g)).toBeNull(); // 0.017 + 0.01 > 0.02
  });

  it("keeps an uncertain call's worst-case hold counted, releases only definite refusals, and ages holds out after 24h", async () => {
    const g = guard(0.02, 10);
    const lost = (await reserve(g))!;
    await g.markUncertain(lost);
    const refused = (await reserve(g))!;
    await g.release(refused, "refused: 429");
    expect(await g.spentLast24h()).toBeCloseTo(0.01); // lost call still counted; refused one is not
    await g.release(lost, "attempted"); // must be a no-op: an uncertain hold can never be released
    expect(await g.spentLast24h()).toBeCloseTo(0.01);
    t += 25 * 3_600_000;
    expect(await g.spentLast24h()).toBe(0);
  });
});

describe("guardedModelPort", () => {
  const ok = { text: "{}", inputTokens: 1000, outputTokens: 100, costUsd: 0.003 };
  const run = (inner: ModelPort, g: V3SpendGuard, extra = {}) =>
    guardedModelPort(inner, { guard: g, feedId: "f", runId: "r", prices, sleep: async () => {}, ...extra });

  it("reserves before the call and settles to the provider-reported cost", async () => {
    const g = guard(1, 1);
    let heldDuring = 0;
    const inner: ModelPort = { complete: async () => ((heldDuring = await g.spentLast24h()), ok) };
    await run(inner, g).complete(req);
    expect(heldDuring).toBeCloseTo(EST);
    expect(await g.spentLast24h()).toBeCloseTo(0.003);
  });

  it("refuses without calling the provider when the budget is exhausted or the model is unpriced", async () => {
    let called = 0;
    const inner: ModelPort = { complete: async () => (called++, ok) };
    await expect(run(inner, guard(0.005, 1)).complete(req)).rejects.toBeInstanceOf(BriefingBudgetError);
    await expect(run(inner, guard(1, 1)).complete({ ...req, model: "mystery" })).rejects.toBeInstanceOf(BriefingBudgetError);
    expect(called).toBe(0);
    expect(await guard(1, 1).spentLast24h()).toBe(0);
  });

  it("retries a definite refusal under a fresh reservation without double counting it", async () => {
    const g = guard(1, 1);
    const replies: Array<Error | typeof ok> = [new BriefingModelError("HTTP 429", true, false), ok];
    const port = run({ complete: async () => { const r = replies.shift()!; if (r instanceof Error) throw r; return r; } }, g);
    await port.complete(req);
    expect(await g.spentLast24h()).toBeCloseTo(0.003); // the refused attempt was released
  });

  it("does not retry an unknown outcome and keeps its worst-case hold counted", async () => {
    const g = guard(1, 1);
    let calls = 0;
    const port = run({ complete: async () => { calls++; throw new BriefingModelError("timeout", false, true); } }, g);
    await expect(port.complete(req)).rejects.toThrow(/timeout/);
    expect(calls).toBe(1);
    expect(await g.spentLast24h()).toBeCloseTo(EST);
  });

  it("treats a non-provider crash as unknown too, and stops at the per-run call limit", async () => {
    const g = guard(1, 1);
    const port = run({ complete: async () => { throw new Error("socket hang up"); } }, g, { maxCalls: 1 });
    await expect(port.complete(req)).rejects.toThrow(/socket/);
    expect(await g.spentLast24h()).toBeCloseTo(EST);
    await expect(port.complete(req)).rejects.toBeInstanceOf(BriefingBudgetError);
  });
});
