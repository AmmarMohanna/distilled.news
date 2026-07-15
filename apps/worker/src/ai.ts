import {
  buildEditionSynthesisPrompt,
  buildSummaryPrompt,
  sanitizeSummary,
  type EditionSynthesisAdapter,
  type EditionSynthesisInput,
  type EditionSynthesisResult,
  type EventEquivalenceInput,
  type EventReviewAdapter,
  type ImportanceReviewInput,
  type SummaryAdapter,
  type SummaryInput
} from "@distilled/core";
import { estimateOpenAiCostUsd } from "./costs";
import type { Env, Repository } from "./types";

const AI_GATEWAY_REQUEST_TIMEOUT_MS = 4_000;
const EDITION_PRIMARY_TIMEOUT_MS = 10_000;
const EDITION_FALLBACK_TIMEOUT_MS = 20_000;
const DEFAULT_GLOBAL_LLM_DAILY_BUDGET_USD = 1;

type LlmUsagePurpose = "summary" | "importance_review" | "event_review" | "edition_summary";
type LlmUsageRecorder = (input: {
  briefingId: string;
  model: string;
  purpose: LlmUsagePurpose;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}) => Promise<void>;

export class OpenAIGatewaySummaryAdapter implements SummaryAdapter, EditionSynthesisAdapter {
  constructor(
    private readonly options: {
      accountId: string;
      gatewayId: string;
      apiKey: string;
      gatewayAuthToken?: string;
      model: string;
      editionModel?: string;
      editionFallbackModel?: string;
      usageRecorder?: LlmUsageRecorder;
      usageBudgetGuard?: () => Promise<boolean>;
      env?: Partial<Env>;
      fetcher?: typeof fetch;
    }
  ) {}

  async summarize(input: SummaryInput): Promise<string> {
    await assertWithinLlmBudget(this.options.usageBudgetGuard);
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetchWithTimeout(fetcher,
      `https://gateway.ai.cloudflare.com/v1/${this.options.accountId}/${this.options.gatewayId}/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.gatewayAuthToken
            ? { "cf-aig-authorization": `Bearer ${this.options.gatewayAuthToken}` }
            : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "You produce short Distilled.news briefing summaries. You never answer questions or add facts outside evidence. If the evidence lacks a clear standalone factual update, return exactly NO_POST."
            },
            { role: "user", content: buildSummaryPrompt(input) }
          ]
        })
      },
      AI_GATEWAY_REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(`AI Gateway summary request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenAIUsagePayload;
    };
    await recordUsage(this.options.usageRecorder, this.options.env, {
      briefingId: input.briefing.id,
      model: this.options.model,
      purpose: "summary",
      usage: payload.usage
    });
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI Gateway returned an empty summary");
    return sanitizeSummary(content, input.briefing.language);
  }

  async synthesize(input: EditionSynthesisInput): Promise<EditionSynthesisResult> {
    const primaryModel = this.options.editionModel ?? this.options.model;
    try {
      return await this.requestEditionSynthesis(input, primaryModel, EDITION_PRIMARY_TIMEOUT_MS);
    } catch (primaryError) {
      const fallbackModel = this.options.editionFallbackModel;
      if (!fallbackModel || fallbackModel === primaryModel) throw primaryError;
      return this.requestEditionSynthesis(input, fallbackModel, EDITION_FALLBACK_TIMEOUT_MS);
    }
  }

  private async requestEditionSynthesis(
    input: EditionSynthesisInput,
    model: string,
    timeoutMs: number
  ): Promise<EditionSynthesisResult> {
    await assertWithinLlmBudget(this.options.usageBudgetGuard);
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetchWithTimeout(fetcher,
      `https://gateway.ai.cloudflare.com/v1/${this.options.accountId}/${this.options.gatewayId}/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.gatewayAuthToken
            ? { "cf-aig-authorization": `Bearer ${this.options.gatewayAuthToken}` }
            : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_completion_tokens: 1_600,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are the evidence-bound edition editor for Distilled.news. Return only strict JSON in the requested language and shape. Never add facts, analysis, markdown, or citation markers."
            },
            { role: "user", content: buildEditionSynthesisPrompt(input) }
          ]
        })
      },
      timeoutMs
    );

    if (!response.ok) throw new Error(`AI Gateway edition synthesis request failed: ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenAIUsagePayload;
    };
    await recordUsage(this.options.usageRecorder, this.options.env, {
      briefingId: input.briefing.id,
      model,
      purpose: "edition_summary",
      usage: payload.usage
    });
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI Gateway returned an empty edition synthesis");
    return JSON.parse(content) as EditionSynthesisResult;
  }
}

export class OpenAIGatewayEventReviewAdapter implements EventReviewAdapter {
  constructor(
    private readonly options: {
      accountId: string;
      gatewayId: string;
      apiKey: string;
      gatewayAuthToken?: string;
      model: string;
      usageRecorder?: LlmUsageRecorder;
      usageBudgetGuard?: () => Promise<boolean>;
      env?: Partial<Env>;
      fetcher?: typeof fetch;
    }
  ) {}

  async areSameEvent(input: EventEquivalenceInput): Promise<boolean> {
    const result = await this.reviewJson([
      "Decide whether the two evidence groups describe the same concrete news event.",
      "Use only the evidence text, links, source names, and timestamps below.",
      "Return strict JSON only: {\"same_event\":true} or {\"same_event\":false}.",
      `Interest profile: ${input.briefing.interestProfile}`,
      "Left evidence:",
      formatEvidence(input.left),
      "Right evidence:",
      formatEvidence(input.right)
    ].join("\n"), input.briefing.id, "event_review");
    return result.same_event === true;
  }

  async isImportant(input: ImportanceReviewInput): Promise<boolean> {
    const result = await this.reviewJson([
      "Decide whether this message is an important concrete update for the briefing interest profile.",
      "Important means official decisions, security incidents, casualties, major infrastructure disruption, economic/currency moves, border/regional escalation, or another concrete high-impact change.",
      "Do not mark generic commentary, vague reactions, teasers, or unrelated world news as important.",
      "Use only the supplied message and interest profile.",
      "Return strict JSON only: {\"important\":true} or {\"important\":false}.",
      `Interest profile: ${input.briefing.interestProfile}`,
      `Source: ${input.message.source.title}`,
      `Time: ${input.message.postedAt}`,
      `Text: ${input.message.text}`,
      `Links: ${input.message.links.join(" ")}`
    ].join("\n"), input.briefing.id, "importance_review");
    return result.important === true;
  }

  private async reviewJson(
    prompt: string,
    briefingId: string,
    purpose: LlmUsagePurpose
  ): Promise<{ same_event?: boolean; important?: boolean }> {
    await assertWithinLlmBudget(this.options.usageBudgetGuard);
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetchWithTimeout(fetcher,
      `https://gateway.ai.cloudflare.com/v1/${this.options.accountId}/${this.options.gatewayId}/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.gatewayAuthToken
            ? { "cf-aig-authorization": `Bearer ${this.options.gatewayAuthToken}` }
            : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an evidence-bound Distilled.news classifier. Return only strict JSON. Do not add facts, explanations, markdown, or prose."
            },
            { role: "user", content: prompt }
          ]
        })
      },
      AI_GATEWAY_REQUEST_TIMEOUT_MS
    );

    if (!response.ok) throw new Error(`AI Gateway review request failed: ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenAIUsagePayload;
    };
    await recordUsage(this.options.usageRecorder, this.options.env, {
      briefingId,
      model: this.options.model,
      purpose,
      usage: payload.usage
    });
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI Gateway returned an empty review");
    return JSON.parse(content) as { same_event?: boolean; important?: boolean };
  }
}

export function createSummaryAdapterFromEnv(env: Env, repo?: Repository): OpenAIGatewaySummaryAdapter | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_GATEWAY_ID || !env.OPENAI_API_KEY) return null;
  return new OpenAIGatewaySummaryAdapter({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
    apiKey: env.OPENAI_API_KEY,
    gatewayAuthToken: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
    editionModel: env.OPENAI_EDITION_MODEL,
    editionFallbackModel: env.OPENAI_EDITION_FALLBACK_MODEL,
    usageRecorder: repo ? (input) => repo.recordLlmUsage(input) : undefined,
    usageBudgetGuard: repo ? createLlmBudgetGuard(repo, env) : undefined,
    env
  });
}

export function createEventReviewAdapterFromEnv(env: Env, repo?: Repository): OpenAIGatewayEventReviewAdapter | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_GATEWAY_ID || !env.OPENAI_API_KEY) return null;
  return new OpenAIGatewayEventReviewAdapter({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
    apiKey: env.OPENAI_API_KEY,
    gatewayAuthToken: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
    usageRecorder: repo ? (input) => repo.recordLlmUsage(input) : undefined,
    usageBudgetGuard: repo ? createLlmBudgetGuard(repo, env) : undefined,
    env
  });
}

function createLlmBudgetGuard(repo: Repository, env: Partial<Env>): () => Promise<boolean> {
  return async () => {
    const budget = positiveNumber(env.GLOBAL_LLM_DAILY_BUDGET_USD, DEFAULT_GLOBAL_LLM_DAILY_BUDGET_USD);
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    return (await repo.sumLlmUsageCost({ since })) < budget;
  };
}

async function assertWithinLlmBudget(guard: (() => Promise<boolean>) | undefined): Promise<void> {
  if (guard && !(await guard())) throw new Error("Global LLM daily budget reached; using deterministic fallback");
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function recordUsage(
  recorder: LlmUsageRecorder | undefined,
  env: Partial<Env> | undefined,
  input: {
    briefingId: string;
    model: string;
    purpose: LlmUsagePurpose;
    usage?: OpenAIUsagePayload;
  }
): Promise<void> {
  if (!recorder || !input.usage) return;
  const inputTokens = input.usage.prompt_tokens ?? input.usage.input_tokens ?? 0;
  const outputTokens = input.usage.completion_tokens ?? input.usage.output_tokens ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) return;
  try {
    await recorder({
      briefingId: input.briefingId,
      model: input.model,
      purpose: input.purpose,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateOpenAiCostUsd({ inputTokens, outputTokens, env })
    });
  } catch {
    // Usage recording should never block feed processing.
  }
}

interface OpenAIUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatEvidence(evidence: EventEquivalenceInput["left"]): string {
  return evidence
    .slice(0, 8)
    .map((entry, index) =>
      `${index + 1}. ${entry.sourceTitle} at ${entry.postedAt}: ${entry.text} ${[entry.sourceUrl, ...entry.links].filter(Boolean).join(" ")}`
    )
    .join("\n");
}
