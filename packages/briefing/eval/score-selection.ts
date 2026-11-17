/**
 * Scores what a V3 run published against blind importance labels.
 *   tsx eval/score-selection.ts <run.json from run.ts --json> <labels.json> [window index]
 * Reports, per window: recall of MUST and SHOULD articles, how many COULD/SKIP articles were
 * published, the words published, and every MUST/SHOULD article that was NOT published with the
 * reason the system gave. The labels are model judgments, so treat the output as a smoke alarm for
 * dropped important news and for noise, not as a final verdict on editorial quality.
 */
import { readFileSync } from "node:fs";

const run = JSON.parse(readFileSync(process.argv[2], "utf8"));
const labels = JSON.parse(readFileSync(process.argv[3], "utf8"));
const only = process.argv[4] === undefined ? undefined : Number(process.argv[4]);

type Tier = "MUST" | "SHOULD" | "COULD" | "SKIP";
const rank: Record<Tier, number> = { MUST: 3, SHOULD: 2, COULD: 1, SKIP: 0 };
const names = Object.keys(labels.judges);
// Consensus: the tier at least two of three judges reach or exceed (the median tier).
function consensus(id: string): { tier: Tier; split: boolean } {
  const tiers = names.map((n) => labels.judges[n][id].tier as Tier).sort((a, b) => rank[b] - rank[a]);
  return { tier: tiers[Math.floor(tiers.length / 2)], split: new Set(tiers).size > 1 };
}

run.windows.forEach((w: any, index: number) => {
  if (only !== undefined && only !== index) return;
  const result = w.result;
  if (!result) return;
  const published = new Set<string>(result.items.flatMap((i: any) => i.sourceIds));
  const reasons = new Map<string, string>();
  for (const o of result.omitted ?? []) for (const id of o.sourceIds) reasons.set(id, `${o.stage}: ${o.reason}`);
  for (const d of result.dropped ?? []) for (const id of d.sourceIds) reasons.set(id, `verification (${d.carry ? "unsupported" : "redundant"}): ${d.reason}`);
  const ids = Object.keys(labels.judges[names[0]]).filter((id) => w.articleIds ? w.articleIds.includes(id) : true);
  const by: Record<Tier, string[]> = { MUST: [], SHOULD: [], COULD: [], SKIP: [] };
  for (const id of ids) by[consensus(id).tier].push(id);
  const hit = (tier: Tier) => by[tier].filter((id) => published.has(id)).length;
  const words = result.items.reduce((n: number, i: any) => n + i.body.split(/\s+/).length, 0);
  console.log(`window ${index} (${w.window.start.slice(0, 10)} → ${w.window.end.slice(0, 10)}): ${result.items.length} items, ${words} words, status ${result.status}`);
  console.log(`  MUST    ${hit("MUST")}/${by.MUST.length} published`);
  console.log(`  SHOULD  ${hit("SHOULD")}/${by.SHOULD.length} published`);
  console.log(`  COULD   ${hit("COULD")}/${by.COULD.length} published   SKIP ${hit("SKIP")}/${by.SKIP.length} published`);
  for (const tier of ["MUST", "SHOULD"] as Tier[]) {
    for (const id of by[tier].filter((x) => !published.has(x))) {
      console.log(`  NOT PUBLISHED [${tier}${consensus(id).split ? ", judges split" : ""}] ${id} — ${reasons.get(id) ?? "no reason recorded (never cited, no omission entry)"}`);
    }
  }
});
