import type { ModelPort, ModelRequest, ModelResponse } from "../src/model";
import type { Article } from "../src/types";

type Stage = "edit" | "consolidate" | "verify" | "repair";

export function stageOf(request: ModelRequest): Stage {
  if (request.system.startsWith("You are the editor")) return "edit";
  if (request.system.startsWith("You are the senior editor")) return "consolidate";
  if (request.system.startsWith("You are a meticulous")) return "verify";
  return "repair";
}

/** A model that answers each stage from a queue of canned replies (objects are JSON-encoded). */
export function scripted(replies: Partial<Record<Stage, Array<unknown | ((r: ModelRequest) => unknown)>>>) {
  const queues = Object.fromEntries(Object.entries(replies).map(([k, v]) => [k, [...(v ?? [])]]));
  const calls: Array<{ stage: Stage; request: ModelRequest }> = [];
  const port: ModelPort = {
    async complete(request): Promise<ModelResponse> {
      const stage = stageOf(request);
      calls.push({ stage, request });
      const next = queues[stage]?.shift();
      if (next === undefined) throw new Error(`unexpected ${stage} call #${calls.filter((c) => c.stage === stage).length}`);
      const value = typeof next === "function" ? (next as (r: ModelRequest) => unknown)(request) : next;
      return { text: typeof value === "string" ? value : JSON.stringify(value), inputTokens: 1000, outputTokens: 200, costUsd: 0.001 };
    }
  };
  return { port, calls };
}

export const MODELS = { editor: "editor-model", verifier: "verifier-model" };

export function article(id: string, text: string, extra: Partial<Article> = {}): Article {
  return { id, source: "Wire", publishedAt: "2026-10-18T10:00:00Z", text, ...extra };
}

export const WINDOW = { windowStart: "2026-10-18T09:30:00Z", windowEnd: "2026-10-18T10:00:00Z" };
export const FEED = { interest: "AI company news", language: "en" as const, windowMinutes: 30 };

export const FUND =
  "Anthropic is committing a portion of its shares to the Anthropic Public Benefit Fund. Subject to stockholder approval, 5% of Anthropic's shares will be committed today, with an additional 2% added at the board's discretion for every 50% increase in the company's value.";
export const GENESIS =
  "Anthropic is committing $150 million over three years to the Genesis Mission, a federal initiative to accelerate scientific discovery through AI, making Claude available to more than 15 agencies including NASA and the NIH.";
