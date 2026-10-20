import { describe, expect, it } from "vitest";
import { generateBriefing } from "../src/engine";
import { FEED, FUND, GENESIS, MODELS, WINDOW, article, scripted } from "./helpers";

const base = { feed: FEED, ...WINDOW };
const fund = (extra = {}) => ({
  headline: "Anthropic commits shares to new public benefit fund",
  body: "Subject to stockholder approval, Anthropic will commit 5% of its shares to a new Public Benefit Fund, with a further 2% at the board's discretion for each 50% rise in company value.",
  sources: ["S1"],
  relation: "new",
  updates: null,
  importance: 1,
  ...extra
});

describe("generateBriefing", () => {
  it("publishes with one editor call and one verification call", async () => {
    const { port, calls } = scripted({ edit: [{ items: [fund()] }], verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }] });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceIds).toEqual(["a1"]);
    expect(calls.map((c) => c.stage)).toEqual(["edit", "verify"]);
    expect(result.usage.calls).toBe(2);
    expect(result.usage.costUsd).toBeCloseTo(0.002);
  });

  it("makes no model call when there is nothing to read, and treats an editor skip as a valid empty briefing", async () => {
    const none = scripted({});
    expect((await generateBriefing({ ...base, articles: [article("a", "hi")] }, none.port, MODELS)).status).toBe("empty");
    expect(none.calls).toHaveLength(0);

    const skip = scripted({ edit: [{ items: [] }] });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, skip.port, MODELS);
    expect(result.status).toBe("empty");
    expect(skip.calls).toHaveLength(1);
  });

  it("repairs a flagged item once, re-checks it, and publishes it", async () => {
    const wrong = fund({ body: "Anthropic has committed 5% of its shares to a new Public Benefit Fund." });
    const { port, calls } = scripted({
      edit: [{ items: [wrong] }],
      verify: [{ results: [{ i: 0, verdict: "fix", issues: ["drops 'subject to stockholder approval'"] }] }, { results: [{ i: 0, verdict: "ok", issues: [] }] }],
      repair: [{ items: [{ i: 0, headline: "Anthropic plans public benefit fund", body: "Subject to stockholder approval, Anthropic will commit 5% of its shares to a new fund.", drop: false }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(result.items[0].body).toMatch(/Subject to stockholder approval/);
    expect(calls.map((c) => c.stage)).toEqual(["edit", "verify", "repair", "verify"]);
    expect(calls[2].request.user).toContain("drops 'subject to stockholder approval'");
  });

  it("drops only the item that stays wrong and still publishes the rest", async () => {
    const second = { headline: "Genesis", body: "Anthropic committed $150 million.", sources: ["S2"], relation: "new", updates: null, importance: 2 };
    const { port } = scripted({
      edit: [{ items: [fund(), second] }],
      verify: [
        { results: [{ i: 0, verdict: "ok", issues: [] }, { i: 1, verdict: "fix", issues: ["omits three years"] }] },
        { results: [{ i: 1, verdict: "fix", issues: ["still omits"] }] }
      ],
      repair: [{ items: [{ i: 1, headline: "Genesis", body: "Anthropic committed $150 million.", drop: false }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND), article("a2", GENESIS)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(result.items.map((i) => i.headline)).toEqual([fund().headline]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toContain("still flagged");
  });

  it("reports rejected (not empty) when every drafted item fails, so the caller keeps the articles", async () => {
    const { port } = scripted({ edit: [{ items: [fund()] }], verify: [{ results: [{ i: 0, verdict: "drop", issues: ["unsupported"] }] }] });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("rejected");
    expect(result.dropped).toHaveLength(1);
  });

  it("re-asks the verifier about an item it skipped instead of publishing it unchecked", async () => {
    const { port, calls } = scripted({
      edit: [{ items: [fund()] }],
      verify: [{ results: [] }, { results: [{ i: 0, verdict: "ok", issues: [] }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(calls.filter((c) => c.stage === "verify")).toHaveLength(2);
  });

  it("retries once on malformed JSON and then succeeds", async () => {
    const { port, calls } = scripted({
      edit: ["Sure! here you go", { items: [fund()] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(calls[1].request.user).toContain("could not be used");
  });

  it("throws (nothing persisted) when the model stays unusable", async () => {
    const { port } = scripted({ edit: ["nope", "still nope"] });
    await expect(generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS)).rejects.toThrow(/usable JSON/);
  });

  it("ignores uncited drafts, unknown refs and unknown update ids", async () => {
    const { port } = scripted({
      edit: [{ items: [fund({ sources: ["S9"] }), fund({ updates: "ghost", relation: "update" })] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].updatesId).toBeUndefined();
    expect(result.items[0].relation).toBe("update");
  });

  it("folds near-identical articles together and cites every copy", async () => {
    const copy = FUND.replace("Anthropic is committing", "Anthropic is now committing");
    const { port, calls } = scripted({ edit: [{ items: [fund()] }], verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }] });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND), article("a2", copy, { publishedAt: "2026-10-18T10:01:00Z" })] }, port, MODELS);
    expect(result.items[0].sourceIds.sort()).toEqual(["a1", "a2"]);
    expect(calls[0].request.user).toContain("NEW ARTICLES (1)");
  });

  it("shows the editor what the reader was already told and carries update ids through", async () => {
    const prior = [{ id: "p1", at: "2026-10-17T10:00:00Z", headline: "Fund announced", body: "Anthropic announced a public benefit fund." }];
    const { port, calls } = scripted({
      edit: [{ items: [fund({ relation: "update", updates: "p1", headline: "Fund detail", body: "Subject to stockholder approval, 5% of shares will be committed." })] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)], prior }, port, MODELS);
    expect(calls[0].request.user).toContain("[p1] 2026-10-17");
    expect(result.items[0].updatesId).toBe("p1");
    expect(calls[1].request.user).toContain("earlier item it updates: Fund announced");
  });

  it("gives the verifier a mechanical hint when a number is not in the sources", async () => {
    const { port, calls } = scripted({
      edit: [{ items: [fund({ body: "Anthropic commits 7% of shares to a new fund." })] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }] }]
    });
    await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(calls[1].request.user).toContain("numbers not found in cited sources: 7");
  });

  it("edits oversized windows in parallel chunks and consolidates", async () => {
    const articles = [article("a1", FUND), article("a2", GENESIS, { publishedAt: "2026-10-18T10:02:00Z" })];
    const { port, calls } = scripted({
      edit: [{ items: [fund()] }, { items: [{ headline: "Genesis", body: "Anthropic commits $150 million over three years to the Genesis Mission.", sources: ["S2"], relation: "new", updates: null, importance: 2 }] }],
      consolidate: [{ items: [{ from: [0], headline: fund().headline, body: fund().body, relation: "new", importance: 1 }, { from: [1], headline: "Genesis", body: "Anthropic commits $150 million over three years to the Genesis Mission.", relation: "new", importance: 2 }] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }, { i: 1, verdict: "ok", issues: [] }] }]
    });
    const result = await generateBriefing({ ...base, articles }, port, MODELS, { maxEditorChars: 300 });
    expect(calls.map((c) => c.stage)).toEqual(["edit", "edit", "consolidate", "verify"]);
    expect(result.items.map((i) => i.sourceIds)).toEqual([["a1"], ["a2"]]);
  });

  it("verifies in several batches when cited sources exceed the verifier budget", async () => {
    const articles = [article("a1", FUND), article("a2", GENESIS)];
    const second = { headline: "Genesis", body: "Anthropic commits $150 million.", sources: ["S2"], relation: "new", updates: null, importance: 2 };
    const ok = (r: { user: string }) => ({ results: [...r.user.matchAll(/^#(\d+) \[/gm)].map((m) => ({ i: Number(m[1]), verdict: "ok", issues: [] })) });
    const { port, calls } = scripted({ edit: [{ items: [fund(), second] }], verify: [ok, ok] });
    const result = await generateBriefing({ ...base, articles }, port, MODELS, { maxVerifyChars: 260 });
    expect(calls.filter((c) => c.stage === "verify")).toHaveLength(2);
    expect(result.items).toHaveLength(2);
  });
});

describe("reader attention budget", () => {
  it("tells single-pass editors the budget and chunk editors that a later pass trims", async () => {
    const articles = [article("a1", FUND), article("a2", GENESIS, { publishedAt: "2026-10-18T10:02:00Z" })];
    const ok = (r: { user: string }) => ({ results: [...r.user.matchAll(/^#(\d+) \[/gm)].map((m) => ({ i: Number(m[1]), verdict: "ok", issues: [] })) });

    const single = scripted({ edit: [{ items: [fund()] }], verify: [ok] });
    await generateBriefing({ ...base, feed: { ...FEED, windowMinutes: 1440 }, articles }, single.port, MODELS);
    expect(single.calls[0].request.user).toMatch(/READING BUDGET: about 3 minutes of reading/);

    const chunked = scripted({
      edit: [{ items: [fund()] }, { items: [{ headline: "Genesis", body: "Anthropic commits $150 million.", sources: ["S2"], relation: "new", updates: null, importance: 3 }] }],
      consolidate: [{ items: [{ from: [0], headline: fund().headline, body: fund().body, relation: "new", importance: 1 }] }],
      verify: [ok]
    });
    await generateBriefing({ ...base, articles }, chunked.port, MODELS, { maxEditorChars: 300 });
    expect(chunked.calls[0].request.user).toContain("You are seeing only part of the window");
    const consolidation = chunked.calls.find((c) => c.stage === "consolidate")!;
    expect(consolidation.request.user).toContain("READING BUDGET");
    expect(consolidation.request.system).toContain("cut the least consequential");
  });

  it("scales with the window and stays short for short windows", async () => {
    const { readingBudget } = await import("../src/prompts");
    expect(readingBudget(30)).toMatch(/33 seconds of reading, roughly 110 words/);
    expect(readingBudget(1440)).toMatch(/3 minutes of reading, roughly 580 words/);
  });
});
