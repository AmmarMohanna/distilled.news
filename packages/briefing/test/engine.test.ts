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
        { results: [{ i: 0, verdict: "fix", issues: ["still omits"] }] }
      ],
      repair: [{ items: [{ i: 0, headline: "Genesis", body: "Anthropic committed $150 million.", drop: false }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND), article("a2", GENESIS)] }, port, MODELS, { maxRepairs: 1 });
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

describe("dropped items say whether their articles are worth another attempt", () => {
  it("marks unsupported items as carryable with their source ids, and redundant ones as not", async () => {
    const second = { headline: "Genesis", body: "Anthropic committed $150 million.", sources: ["S2"], relation: "new", updates: null, importance: 2 };
    const third = { headline: "Fund again", body: "Anthropic fund again.", sources: ["S3"], relation: "new", updates: null, importance: 3 };
    const { port } = scripted({
      edit: [{ items: [fund(), second, third] }],
      verify: [{ results: [{ i: 0, verdict: "ok", issues: [] }, { i: 1, verdict: "drop", issues: ["not supported"] }, { i: 2, verdict: "redundant", issues: ["already told"] }] }]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND), article("a2", GENESIS), article("a3", "Completely different harbour dredging approval news with enough words to stay distinct from the others.")] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(result.dropped).toEqual([
      { headline: "Genesis", reason: "not supported", carry: true, sourceIds: ["a2"] },
      { headline: "Fund again", reason: "already told", carry: false, sourceIds: expect.any(Array) }
    ]);
  });
});

describe("omissions are auditable and lead stories are protected", () => {
  const a1 = article("a1", FUND);
  const a2 = article("a2", GENESIS, { publishedAt: "2026-10-18T10:02:00Z" });
  const a3 = article("a3", "Harbour dredging approval for the northern channel was granted on Monday, officials said, raising cargo capacity later next year.", { publishedAt: "2026-10-18T10:03:00Z" });
  const draft = (headline: string, ref: string, importance: number) => ({ headline, body: `${headline} body.`, sources: [ref], relation: "new", updates: null, importance });
  const okAll = (r: { user: string }) => ({ results: [...r.user.matchAll(/^#(\d+) \[/gm)].map((m) => ({ i: Number(m[1]), verdict: "ok", issues: [] })) });

  it("records the editor's left_out reasons with the articles behind them", async () => {
    const { port } = scripted({
      edit: [{ items: [fund()], left_out: [{ sources: ["S2"], why: "routine programme news" }, { sources: ["S99"], why: "bogus" }] }],
      verify: [okAll]
    });
    const result = await generateBriefing({ ...base, articles: [a1, a2] }, port, MODELS);
    expect(result.omitted).toEqual([{ stage: "editor", reason: "routine programme news", sourceIds: ["a2"] }]);
  });

  it("restores a lead story the consolidation pass tried to cut, and records real cuts and silent drops", async () => {
    const { port } = scripted({
      // maxEditorChars below makes each article its own chunk: three editor calls, then consolidation.
      edit: [{ items: [draft("Lead", "S1", 1)] }, { items: [draft("Routine", "S2", 3)] }, { items: [draft("Quiet drop", "S3", 2)] }],
      consolidate: [{ items: [], cut: [{ from: [0], why: "trying to cut the lead" }, { from: [1], why: "routine" }] }],
      verify: [okAll]
    });
    const result = await generateBriefing({ ...base, articles: [a1, a2, a3] }, port, MODELS, { maxEditorChars: 300 });
    expect(result.items.map((i) => i.headline)).toEqual(["Lead"]);
    expect(result.omitted).toEqual([
      { stage: "consolidation", reason: "routine", headline: "Routine", sourceIds: ["a2"] },
      { stage: "consolidation", reason: "dropped by consolidation without a reason", headline: "Quiet drop", sourceIds: ["a3"] }
    ]);
  });

  it("records drafts beyond the safety limit instead of silently losing them", async () => {
    const { port } = scripted({
      edit: [{ items: [draft("One", "S1", 1), draft("Two", "S2", 2)] }],
      verify: [okAll]
    });
    const result = await generateBriefing({ ...base, articles: [a1, a2] }, port, MODELS, { maxItems: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.omitted).toMatchObject([{ stage: "safety_cap", headline: "Two", sourceIds: ["a2"] }]);
  });
});

describe("repair policy", () => {
  it("gives a flagged item a second repair, so one bad rewrite does not lose a lead story", async () => {
    const { port, calls } = scripted({
      edit: [{ items: [fund({ body: "Anthropic has committed 5% of shares." })] }],
      verify: [
        { results: [{ i: 0, verdict: "fix", issues: ["drops approval condition"] }] },
        { results: [{ i: 0, verdict: "fix", issues: ["repair added an unsupported claim"] }] },
        { results: [{ i: 0, verdict: "ok", issues: [] }] }
      ],
      repair: [
        { items: [{ i: 0, headline: "Fund", body: "Subject to stockholder approval, 5% of shares, plus a claim the source never made.", drop: false }] },
        { items: [{ i: 0, headline: "Fund", body: "Subject to stockholder approval, 5% of shares will be committed.", drop: false }] }
      ]
    });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("published");
    expect(result.items[0].body).toBe("Subject to stockholder approval, 5% of shares will be committed.");
    expect(calls.map((c) => c.stage)).toEqual(["edit", "verify", "repair", "verify", "repair", "verify"]);
    expect(calls[4].request.user).toContain("repair added an unsupported claim"); // second repair sees the latest problem
  });

  it("still gives up after the repair limit, so cost per window stays bounded", async () => {
    const stuck = { results: [{ i: 0, verdict: "fix", issues: ["still wrong"] }] };
    const rewrite = { items: [{ i: 0, headline: "Fund", body: "Still wrong.", drop: false }] };
    const { port, calls } = scripted({ edit: [{ items: [fund()] }], verify: [stuck, stuck, stuck], repair: [rewrite, rewrite] });
    const result = await generateBriefing({ ...base, articles: [article("a1", FUND)] }, port, MODELS);
    expect(result.status).toBe("rejected");
    expect(calls.filter((c) => c.stage === "repair")).toHaveLength(2);
    expect(result.dropped[0]).toMatchObject({ carry: true, sourceIds: ["a1"] });
  });

  it("tells the editor headlines must carry the body's hedges, and tells the repairer to delete rather than add", async () => {
    const { EDITOR_SYSTEM, REPAIR_SYSTEM } = await import("../src/prompts");
    expect(EDITOR_SYSTEM).toContain("The headline is held to the same standard as the body");
    expect(REPAIR_SYSTEM).toContain("SMALLEST edit");
    expect(REPAIR_SYSTEM).toContain("Do NOT add sentences or facts");
  });
});

// Regression: staging returned repair indices 0/1 for the original flagged items 1/2.
it("keeps subset repair numbering local without moving text between source owners", async () => {
  const drafts = [
    { ...fund(), headline: "Replit", body: "Replit keeps Anthropic available.", sources: ["S1"] },
    { ...fund(), headline: "Anthropic", body: "Anthropic plans a public benefit fund.", sources: ["S2"] },
    { ...fund(), headline: "Laplace", body: "Laplace develops physical AI tests.", sources: ["S3"] }
  ];
  const { port, calls } = scripted({
    edit: [{ items: drafts }],
    verify: [
      { results: [{ i: 0, verdict: "ok", issues: [] }, { i: 1, verdict: "fix", issues: ["date"] }, { i: 2, verdict: "fix", issues: ["founding year"] }] },
      { results: [{ i: 0, verdict: "ok", issues: [] }, { i: 1, verdict: "ok", issues: [] }] }
    ],
    repair: [{ items: [{ i: 0, headline: "Anthropic", body: "Anthropic plans a public benefit fund.", drop: false }, { i: 1, headline: "Laplace", body: "Laplace develops physical AI tests.", drop: false }] }]
  });
  const result = await generateBriefing({ ...base, articles: [article("a1", "Replit keeps Anthropic available. This is the original company report."), article("a2", FUND), article("a3", "Laplace develops physical AI tests for robots and autonomous vehicles.")] }, port, MODELS, { prepare: { nearDuplicate: 1.01 } });
  expect(result.items.map(i => [i.headline, i.sourceIds])).toEqual([["Replit", ["a1"]], ["Anthropic", ["a2"]], ["Laplace", ["a3"]]]);
  expect(result.dropped).toEqual([]);
  expect(calls.find(c => c.stage === "repair")!.request.user).toContain("#0 [new] cites S2");
  expect(calls.find(c => c.stage === "repair")!.request.user).toContain("#1 [new] cites S3");
});
