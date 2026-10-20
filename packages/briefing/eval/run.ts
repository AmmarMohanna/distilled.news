/**
 * Runs the V3 engine over a saved scenario and prints the briefing next to its cost and timing.
 *
 *   tsx eval/run.ts --scenario real-continuity --backend anthropic --editor claude-sonnet-5-5 --verifier claude-haiku-5-5
 *   tsx eval/run.ts --scenario real-continuity --backend openrouter --editor openai/gpt-4.1 --verifier openai/gpt-4.1-mini
 *   tsx eval/run.ts --scenario real-continuity --backend relay --relay-dir /some/dir
 *
 * `relay` writes each model request to <dir>/<hash>.req.json and exits with status 3 listing the
 * requests that still need an answer in <hash>.res.txt; rerun after answering to advance. It exists
 * so independent model instances can serve the real prompts when no provider key is available. Its
 * cost and latency figures are not meaningful and are reported as such.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBriefing } from "../src/engine";
import { anthropicModel, openAiCompatibleModel, type ModelPort } from "../src/model";
import type { Article, BriefingResult, PriorItem } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

class Pending extends Error {}

function relay(dir: string): ModelPort & { pending: string[] } {
  mkdirSync(dir, { recursive: true });
  const pending: string[] = [];
  return {
    pending,
    async complete(request) {
      const key = createHash("sha1").update(JSON.stringify([request.model, request.system, request.user])).digest("hex").slice(0, 12);
      const res = join(dir, `${key}.res.txt`);
      if (!existsSync(res)) {
        const req = join(dir, `${key}.req.json`);
        writeFileSync(req, JSON.stringify({ model: request.model, system: request.system, user: request.user }, null, 1));
        pending.push(key);
        throw new Pending(key);
      }
      const text = readFileSync(res, "utf8");
      return { text, inputTokens: Math.ceil((request.system.length + request.user.length) / 3.6), outputTokens: Math.ceil(text.length / 3.6) };
    }
  };
}

function backend(): ModelPort & { pending?: string[] } {
  const kind = args.get("backend") ?? "anthropic";
  if (kind === "relay") return relay(args.get("relay-dir") ?? join(here, ".relay"));
  if (kind === "openrouter") {
    return openAiCompatibleModel({ url: "https://openrouter.ai/api/v1/chat/completions", apiKey: process.env.OPENROUTER_API_KEY ?? "", reportCost: true });
  }
  if (kind === "openai-compatible") {
    return openAiCompatibleModel({ url: args.get("url") ?? "", apiKey: process.env.LLM_API_KEY ?? "" });
  }
  return anthropicModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
}

const scenarios = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8")).scenarios as Array<{
  id: string;
  corpus: string;
  feed: { interest: string; language: "en" | "ar" | "fr"; windowMinutes: number };
  windows: Array<{ start: string; end: string; articles: string[] }>;
}>;
const scenario = scenarios.find((s) => s.id === args.get("scenario"));
if (!scenario) throw new Error(`--scenario one of: ${scenarios.map((s) => s.id).join(", ")}`);
const corpus = JSON.parse(readFileSync(join(here, "corpus", `${scenario.corpus}.json`), "utf8")) as Article[];
const models = { editor: args.get("editor") ?? "claude-sonnet-5-5", verifier: args.get("verifier") ?? "claude-haiku-5-5" };
const port = backend();

const prior: PriorItem[] = [];
const report: Array<{ window: { start: string; end: string }; articles: number; articleIds: string[]; result?: BriefingResult }> = [];
let complete = true;
for (const window of scenario.windows) {
  const ids = window.articles.includes("*") ? corpus.map((a) => a.id) : window.articles;
  const articles = ids.map((id) => corpus.find((a) => a.id === id)!);
  try {
    const result = await generateBriefing(
      { feed: scenario.feed, articles, prior: [...prior], windowStart: window.start, windowEnd: window.end },
      port,
      models,
      { now: () => new Date(window.end), ...(args.get("max-editor-chars") ? { maxEditorChars: Number(args.get("max-editor-chars")) } : {}) }
    );
    report.push({ window: { start: window.start, end: window.end }, articles: articles.length, articleIds: ids, result });
    for (const [i, item] of result.items.entries()) {
      prior.push({ id: `p${prior.length + 1}`, at: window.end, headline: item.headline, body: item.body });
      void i;
    }
  } catch (error) {
    if (error instanceof Pending || (error as { cause?: unknown })?.cause instanceof Pending) {
      complete = false;
      report.push({ window: { start: window.start, end: window.end }, articles: articles.length, articleIds: ids });
      break;
    }
    throw error;
  }
}

if (!complete) {
  const dir = args.get("relay-dir") ?? join(here, ".relay");
  const unanswered = readdirSync(dir).filter((f) => f.endsWith(".req.json") && !existsSync(join(dir, f.replace(".req.json", ".res.txt"))));
  console.log(`PENDING ${unanswered.length}`);
  for (const f of unanswered) console.log(join(dir, f));
  process.exit(3);
}

const lines: string[] = [`# ${scenario.id} (${args.get("backend") ?? "anthropic"}; editor=${models.editor}, verifier=${models.verifier})`];
let calls = 0, cost: number | undefined;
for (const { window, articles, result } of report) {
  if (!result) continue;
  calls += result.usage.calls;
  if (result.usage.costUsd !== undefined) cost = (cost ?? 0) + result.usage.costUsd;
  lines.push(`\n## ${window.start} → ${window.end}: ${result.status}, ${articles} articles in, ${result.items.length} items out (${result.usage.calls} calls, ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens, ${result.usage.costUsd === undefined ? "cost n/a" : `$${result.usage.costUsd.toFixed(4)}`}, ${result.timings.totalMs} ms)`);
  for (const item of result.items) lines.push(`\n### [${item.relation}${item.updatesId ? ` ${item.updatesId}` : ""}, importance ${item.importance}] ${item.headline}\n${item.body}\nsources: ${item.sourceIds.join(", ")}`);
  if (result.dropped.length) lines.push(`\ndropped: ${JSON.stringify(result.dropped)}`);
  const skipped = result.skipped.map((s) => `${s.id} (${s.reason})`).join(", ");
  if (skipped) lines.push(`\nskipped before editing: ${skipped}`);
}
lines.push(`\nTOTAL: ${calls} model calls${cost === undefined ? "" : `, $${cost.toFixed(4)}`}`);
const text = lines.join("\n");
console.log(text);
if (args.get("out")) writeFileSync(args.get("out")!, text + "\n");
if (args.get("json")) {
  writeFileSync(
    args.get("json")!,
    JSON.stringify({ scenario: scenario.id, models, windows: report.map(({ window, articles, articleIds, result }) => ({ window, articles, articleIds, result })) }, null, 1)
  );
}
