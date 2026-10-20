import {
  anthropicModel,
  generateBriefing,
  openAiCompatibleModel,
  type Article,
  type BriefingResult,
  type ModelPort,
  type PriorItem
} from "@distilled/briefing";
import { editionId, editionTitle, type BriefingConfig, type BriefingEdition, type BriefingEvidence, type NormalizedMessage } from "@distilled/core";
import type { Env, Repository } from "./types";

export interface V3Runtime {
  port: ModelPort;
  models: { editor: string; verifier: string };
}

/** Returns null when V3 is not switched on or no model credential is configured, so the legacy path runs. */
export function v3RuntimeFromEnv(env: Env): V3Runtime | null {
  if (env.BRIEFING_ENGINE !== "v3") return null;
  let port: ModelPort;
  let models: V3Runtime["models"];
  if (env.OPENROUTER_API_KEY) {
    port = openAiCompatibleModel({ url: "https://openrouter.ai/api/v1/chat/completions", apiKey: env.OPENROUTER_API_KEY, reportCost: true });
    models = { editor: env.BRIEFING_EDITOR_MODEL ?? "openai/gpt-4.1", verifier: env.BRIEFING_VERIFIER_MODEL ?? "openai/gpt-4.1-mini" };
  } else if (env.ANTHROPIC_API_KEY) {
    port = anthropicModel({ apiKey: env.ANTHROPIC_API_KEY });
    models = { editor: env.BRIEFING_EDITOR_MODEL ?? "claude-sonnet-5-5", verifier: env.BRIEFING_VERIFIER_MODEL ?? "claude-haiku-5-5" };
  } else {
    return null;
  }
  return { port, models };
}

/** Feeds each call's tokens and cost into the existing per-feed usage ledger. */
export function withUsageRecording(port: ModelPort, repo: Repository, briefingId: string): ModelPort {
  return {
    async complete(request) {
      const started = Date.now();
      const response = await port.complete(request);
      try {
        await repo.recordLlmUsage({
          briefingId,
          model: request.model,
          purpose: "summary",
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          estimatedCostUsd: response.costUsd ?? 0,
          reportedCostUsd: response.costUsd,
          latencyMs: Date.now() - started,
          phase: "v3_briefing",
          outcome: "SUCCESS"
        });
      } catch (error) {
        console.warn("Could not record V3 model usage", error);
      }
      return response;
    }
  };
}

export function messageToArticle(message: NormalizedMessage): Article {
  return {
    id: message.id,
    source: message.source.title,
    title: message.news?.headline,
    url: message.sourceUrl,
    publishedAt: message.postedAt,
    text: message.text
  };
}

function toEvidence(message: NormalizedMessage): BriefingEvidence {
  return {
    documentId: message.news?.acquiredItemId,
    contentHash: message.news?.contentHash,
    headline: message.news?.headline,
    messageId: message.id,
    sourceId: message.source.id,
    sourceTitle: message.source.title,
    sourceType: message.source.type,
    sourceProvider: message.source.provider,
    sourceKind: message.source.kind,
    sourceUrl: message.sourceUrl,
    postedAt: message.postedAt,
    text: message.text,
    links: message.links,
    media: message.media
  };
}

/** What the reader was already told: every section of recent editions, newest last. */
export function priorFromEditions(editions: BriefingEdition[]): PriorItem[] {
  return editions
    .filter((edition) => edition.status === "published")
    .flatMap((edition) =>
      edition.sections
        .filter((section) => section.evidence.length > 0)
        .map((section, index) => ({ id: `${edition.id}:${index}`, at: edition.publishedAt, headline: section.title, body: section.summary }))
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function buildV3Edition(input: {
  briefing: BriefingConfig;
  messages: NormalizedMessage[];
  result: BriefingResult;
  windowStart: string;
  windowEnd: string;
  now: Date;
}): BriefingEdition {
  const { briefing, result } = input;
  const byId = new Map(input.messages.map((message) => [message.id, message]));
  const sections = result.items.map((item) => ({
    title: item.headline,
    summary: item.body,
    evidence: item.sourceIds.flatMap((id) => (byId.has(id) ? [toEvidence(byId.get(id)!)] : []))
  }));
  const timestamp = input.now.toISOString();
  return {
    id: editionId(briefing.id, briefing.briefingCadence, input.windowStart, input.windowEnd),
    briefingId: briefing.id,
    cadence: briefing.briefingCadence,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    title: editionTitle(briefing.briefingCadence, briefing.language),
    // Deterministic digest of the verified headlines; no extra generated text to verify.
    summary: result.items.map((item) => item.headline).join(" · ").slice(0, 600),
    sections,
    status: "published",
    publishedAt: input.windowEnd,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const watermarkKey = (briefingId: string) => `v3_evaluated_until:${briefingId}`;

export type V3Outcome = "published" | "empty" | "rejected" | "error";

/**
 * One scheduled window through V3. Articles stay available until a window is either published
 * or judged empty: a rejected or failed run saves nothing and leaves the watermark alone, so the
 * next window re-reads the same articles together with the new ones.
 */
export async function publishV3Window(input: {
  repo: Repository;
  v3: V3Runtime;
  briefing: BriefingConfig;
  windowStart: string;
  windowEnd: string;
  messages: NormalizedMessage[];
  now: Date;
  generate?: typeof generateBriefing;
}): Promise<V3Outcome> {
  const { repo, briefing } = input;
  const watermark = await repo.getSetting(watermarkKey(briefing.id));
  const articles = input.messages.filter((message) => !watermark || message.postedAt >= watermark).map(messageToArticle);
  const windowMinutes = Math.max(1, Math.round((Date.parse(input.windowEnd) - Date.parse(input.windowStart)) / 60_000));
  const prior = priorFromEditions(await repo.listBriefingEditions(briefing.id, true, input.now, 30));
  let result: BriefingResult;
  try {
    result = await (input.generate ?? generateBriefing)(
      {
        feed: {
          interest: briefing.interestProfile,
          language: briefing.language,
          windowMinutes: briefing.updateIntervalMinutes ?? windowMinutes,
          style: briefing.styleInstruction
        },
        articles,
        prior,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd
      },
      withUsageRecording(input.v3.port, repo, briefing.id),
      input.v3.models,
      { now: () => input.now }
    );
  } catch (error) {
    console.error("V3 briefing generation failed; articles stay pending", briefing.id, error);
    return "error";
  }
  if (result.status === "published") {
    await repo.saveBriefingEdition(buildV3Edition({ ...input, result }), input.now);
  }
  console.info("v3_briefing", JSON.stringify({ briefingId: briefing.id, status: result.status, items: result.items.length, dropped: result.dropped.length, usage: result.usage, timings: result.timings }));
  if (result.status !== "rejected") await repo.setSetting(watermarkKey(briefing.id), input.windowEnd, input.now);
  return result.status;
}
