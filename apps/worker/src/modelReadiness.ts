import {
  applyEditionSynthesis,
  editionSynthesisRejectionReason,
  personalNewsBriefing,
  type EditionSynthesisInput
} from "@distilled/core";
import { createSummaryAdapterFromEnv } from "./ai";
import type { Env, OperationalEvent, Repository } from "./types";

const MODEL_READINESS_SUBSYSTEM = "model_readiness_canary";
const MODEL_READINESS_ACCOUNT_ID = "account_model_readiness_canary";
const MODEL_READINESS_CACHE_MS = 5 * 60 * 1000;

export interface ModelReadinessCanaryResult {
  attempted: boolean;
  cached: boolean;
  succeeded: boolean;
  validatedAt: string | null;
  inputFingerprint: string;
  outputFingerprint: string | null;
  model: string;
  reason?: string;
}

export async function runModelReadinessCanary(input: {
  env: Env;
  repo: Repository;
  now: Date;
  fetcher?: typeof fetch;
}): Promise<ModelReadinessCanaryResult> {
  const model = input.env.OPENAI_EDITION_MODEL ?? input.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const releaseSha = publicReleaseSha(input.env);
  const canaryInput = fixedCanaryInput(
    `briefing_model_readiness_${(releaseSha ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}_${input.now.getTime()}`
  );
  const inputFingerprint = await sha256Hex(JSON.stringify({
    language: canaryInput.briefing.language,
    interestProfile: canaryInput.briefing.interestProfile,
    styleInstruction: canaryInput.briefing.styleInstruction,
    cadence: canaryInput.cadence,
    sections: canaryInput.sections
  }));

  const cached = releaseSha
    ? await latestCachedSuccess(input.repo, input.now, releaseSha, inputFingerprint, model)
    : null;
  if (cached) {
    return {
      attempted: false,
      cached: true,
      succeeded: true,
      validatedAt: cached.event.occurredAt,
      inputFingerprint,
      outputFingerprint: cached.outputFingerprint,
      model
    };
  }

  const adapter = modelCanaryAdapter(input.env, input.repo, input.fetcher);
  if (!adapter) {
    const reason = "configuration_missing";
    await recordResult(input.repo, {
      status: "failed",
      releaseSha,
      bodyId: canaryInput.briefing.id,
      model,
      inputFingerprint,
      reason
    }, input.now);
    return failedResult(inputFingerprint, model, reason);
  }

  try {
    const draft = await adapter.synthesize(canaryInput);
    const validated = applyEditionSynthesis(canaryInput, draft);
    if (!validated) {
      const reason = `invalid_synthesis:${editionSynthesisRejectionReason(draft, canaryInput) ?? "unknown"}`;
      await recordResult(input.repo, {
        status: "failed",
        releaseSha,
        bodyId: canaryInput.briefing.id,
        model,
        inputFingerprint,
        reason
      }, input.now);
      return failedResult(inputFingerprint, model, reason);
    }
    const outputFingerprint = await sha256Hex(JSON.stringify(validated));
    await recordResult(input.repo, {
      status: "succeeded",
      releaseSha,
      bodyId: canaryInput.briefing.id,
      model,
      inputFingerprint,
      outputFingerprint
    }, input.now);
    return {
      attempted: true,
      cached: false,
      succeeded: true,
      validatedAt: input.now.toISOString(),
      inputFingerprint,
      outputFingerprint,
      model
    };
  } catch (error) {
    const reason = classifyFailure(error);
    await recordResult(input.repo, {
      status: "failed",
      releaseSha,
      bodyId: canaryInput.briefing.id,
      model,
      inputFingerprint,
      reason
    }, input.now);
    return failedResult(inputFingerprint, model, reason);
  }
}

function fixedCanaryInput(briefingId: string): EditionSynthesisInput {
  return {
    briefing: {
      ...personalNewsBriefing,
      id: briefingId,
      ownerAccountId: MODEL_READINESS_ACCOUNT_ID,
      ownerUsername: "model-readiness-canary",
      slug: "model-readiness",
      title: "Model delivery readiness",
      language: "en",
      interestProfile: "Confirm only the fixed Blue Line service restoration statement."
    },
    cadence: "hourly",
    sections: [{
      title: "Blue Line service",
      summary: "The Blue Line resumed service at 09:00 after scheduled maintenance.",
      evidence: []
    }]
  };
}

function modelCanaryAdapter(env: Env, repo: Repository, fetcher?: typeof fetch) {
  const mode = env.EDITION_SYNTHESIS_MODE?.trim().toLowerCase();
  if (mode === "deterministic" || mode === "disabled" || mode === "off") return null;
  return createSummaryAdapterFromEnv(env, repo, {
    fetcher,
    // Readiness proves the configured primary edition model, not a fallback.
    editionFallbackModel: null,
    editionMaxOutputTokens: 400
  });
}

async function latestCachedSuccess(
  repo: Repository,
  now: Date,
  releaseSha: string,
  inputFingerprint: string,
  model: string
): Promise<{ event: OperationalEvent; outputFingerprint: string } | null> {
  const events = await repo.listOperationalEvents({
    since: new Date(now.getTime() - MODEL_READINESS_CACHE_MS).toISOString(),
    category: "model",
    limit: 50
  });
  for (const event of events) {
    if (event.subsystem !== MODEL_READINESS_SUBSYSTEM || event.releaseSha !== releaseSha) continue;
    if (event.status !== "succeeded" || !event.detail) return null;
    try {
      const detail = JSON.parse(event.detail) as {
        model?: unknown;
        inputFingerprint?: unknown;
        outputFingerprint?: unknown;
      };
      if (detail.model === model &&
        detail.inputFingerprint === inputFingerprint &&
        typeof detail.outputFingerprint === "string") {
        return { event, outputFingerprint: detail.outputFingerprint };
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

async function recordResult(
  repo: Repository,
  input: {
    status: "succeeded" | "failed";
    releaseSha?: string;
    bodyId: string;
    model: string;
    inputFingerprint: string;
    outputFingerprint?: string;
    reason?: string;
  },
  now: Date
): Promise<void> {
  await repo.recordOperationalEvent({
    category: "model",
    subsystem: MODEL_READINESS_SUBSYSTEM,
    status: input.status,
    bodyType: "model_readiness_canary",
    bodyId: input.bodyId,
    releaseSha: input.releaseSha,
    detail: JSON.stringify({
      model: input.model,
      inputFingerprint: input.inputFingerprint,
      outputFingerprint: input.outputFingerprint,
      reason: input.reason
    })
  }, now);
}

function failedResult(inputFingerprint: string, model: string, reason: string): ModelReadinessCanaryResult {
  return {
    attempted: true,
    cached: false,
    succeeded: false,
    validatedAt: null,
    inputFingerprint,
    outputFingerprint: null,
    model,
    reason
  };
}

function classifyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("budget") || message.includes("already reserved")) return "budget_denied";
  if ((error instanceof Error && error.name === "AbortError") || message.includes("timeout")) return "timeout";
  const status = message.match(/request failed: (\d{3})/)?.[1];
  if (status) return `provider_http_${status}`;
  if (error instanceof SyntaxError || message.includes("empty")) return "invalid_response";
  return "provider_error";
}

function publicReleaseSha(env: Partial<Env>): string | undefined {
  return env.RELEASE_SHA?.trim() || env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
