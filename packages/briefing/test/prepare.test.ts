import { describe, expect, it } from "vitest";
import { chunkArticles, prepareArticles, selectPrior, trimArticleText } from "../src/prepare";
import { article } from "./helpers";

const para = (topic: string) => `${topic} announced a new initiative on Monday involving partners, funding and a timeline that runs through next year, officials said.`;

describe("prepareArticles", () => {
  it("preserves substantive middle passages in a long article by default", () => {
    const text="Opening context. ".repeat(300)+"Material correction: the approval remains conditional. "+"More original evidence. ".repeat(300);
    const {prepared}=prepareArticles([article("long-evidence",text)]);
    expect(prepared[0].text).toContain("Material correction: the approval remains conditional.");
    expect(prepared[0].text).not.toContain("[...]");
  });
  it("drops tiny items, folds exact and URL duplicates, and keeps every id citable", () => {
    const a = article("a", para("Acme"), { url: "https://www.example.com/story?utm_source=x" });
    const b = article("b", para("Acme"), { publishedAt: "2026-10-18T10:05:00Z", url: "https://example.com/story/" });
    const c = article("c", "ok");
    const { prepared, skipped } = prepareArticles([b, a, c]);
    expect(prepared).toHaveLength(1);
    expect(new Set([prepared[0].id, ...prepared[0].alsoIds])).toEqual(new Set(["a", "b"]));
    expect(skipped.map((s) => s.reason).sort()).toEqual(["duplicate_of_other_article", "empty_or_too_short"]);
  });

  it("keeps a longer copy as primary text but still cites the shorter one", () => {
    const short = para("Acme");
    const long = `${short} Additional reporting adds that the programme will be reviewed after twelve months by an independent panel appointed by the board.`;
    const { prepared } = prepareArticles([article("short", short), article("long", long, { publishedAt: "2026-10-18T10:01:00Z" })]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].id).toBe("long");
    expect(prepared[0].alsoIds).toEqual(["short"]);
  });

  it("keeps different events about the same company separate and orders related articles together", () => {
    const { prepared } = prepareArticles([
      article("x1", "Quantum chip maker Zeta unveiled a 1000 qubit processor and said the processor will ship to research labs next spring."),
      article("y1", "The harbour authority approved dredging of the northern channel and said cargo capacity would rise once work finishes.", { publishedAt: "2026-10-18T10:01:00Z" }),
      article("x2", "Zeta said its 1000 qubit processor uses a new error correction scheme and will ship to research labs in spring.", { publishedAt: "2026-10-18T10:02:00Z" })
    ]);
    expect(prepared.map((p) => p.id)).toEqual(["x1", "x2", "y1"]);
    expect(prepared[0].similarRefs).toEqual([prepared[1].ref]);
  });

  it("trims long articles keeping head and tail", () => {
    const text = `${"a ".repeat(3000)}THE-END`;
    const out = trimArticleText(text, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out).toContain("THE-END");
    expect(out).toContain("[...]");
  });
});

describe("chunkArticles", () => {
  it("splits by size and never returns an empty chunk", () => {
    const topics = ["glacier mapping satellite launch", "municipal bond rating downgrade", "vaccine trial enrolment results", "football transfer window fee"];
    const { prepared } = prepareArticles(topics.map((t, i) => article(`t${i}`, `${t} ${para(t)} ${"filler words continue here ".repeat(30)}${t.split(" ").reverse().join(" ")}`)));
    const chunks = chunkArticles(prepared, 700);
    expect(chunks.flat()).toHaveLength(4);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("selectPrior", () => {
  const mk = (n: number, topic: string, day: number) => ({ id: `p${n}`, at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, headline: `${topic} story ${n}`, body: `${topic} development number ${n} details about ${topic}.` });

  it("returns everything when small, drops very old items, and bounds large histories by relevance plus recency", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const { prepared } = prepareArticles([article("a", "Zeta quantum processor shipping to research labs, said Zeta quantum officials today in a statement.")]);
    expect(selectPrior([mk(1, "Harbour", 19)], prepared, now)).toHaveLength(1);
    expect(selectPrior([mk(1, "Harbour", 19), { ...mk(2, "Old", 1), at: "2026-08-01T00:00:00Z" }], prepared, now).map((p) => p.id)).toEqual(["p1"]);

    const many = [...Array.from({ length: 40 }, (_, i) => mk(i, "Harbour", 15 + (i % 4))), { ...mk(99, "Zeta quantum", 12), headline: "Zeta quantum processor" }];
    const chosen = selectPrior(many, prepared, now, { maxItems: 8 });
    // Relevant item plus the most recent few; unrelated older history is left out to bound tokens.
    expect(chosen.length).toBeLessThanOrEqual(8);
    expect(chosen.some((p) => p.id === "p99")).toBe(true);
    const newest = [...many].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4).map((p) => p.id);
    for (const id of newest) expect(chosen.map((p) => p.id)).toContain(id);
  });
});
