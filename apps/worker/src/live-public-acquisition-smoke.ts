import { makeId } from "@distilled/agent-runtime/contracts";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import type { Env, WebOperatorLiveSmokeMessage } from "./types";

const INTERNAL_SMOKE_URL = "https://worker.internal/v1/live-smoke/public-acquisition";

interface LiveSmokeRequestRow {
  request_id: string;
  idempotency_key: string;
  candidate_url: string;
  state: string;
}

export type LiveSmokeProcessingResult =
  | { status: "ignored" }
  | { status: "completed"; runId?: string; outcomeState?: string }
  | { status: "failed"; failureClass: string; runId?: string };

export async function dispatchPendingLivePublicAcquisitionSmokes(
  env: Pick<Env, "DB" | "WEB_OPERATOR_QUEUE" | "DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE">,
  now = new Date()
): Promise<number> {
  if (env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return 0;
  const result = await env.DB.prepare(`SELECT request_id FROM web_operator_live_smoke_requests
    WHERE state='pending' ORDER BY created_at,request_id LIMIT 1`).all<{ request_id: string }>();
  let dispatched = 0;
  for (const row of result.results) {
    await env.WEB_OPERATOR_QUEUE.send({
      type: "live_public_acquisition_smoke",
      requestId: row.request_id
    } satisfies WebOperatorLiveSmokeMessage);
    const updated = await env.DB.prepare(`UPDATE web_operator_live_smoke_requests
      SET state='queued',queued_at=? WHERE request_id=? AND state='pending'`)
      .bind(now.toISOString(), row.request_id).run();
    if (Number(updated.meta.changes) === 1) dispatched += 1;
  }
  return dispatched;
}

export async function processLivePublicAcquisitionSmoke(
  env: Pick<Env, "DB" | "WEB_OPERATOR_RUNTIME_TOKEN" | "DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE">,
  message: WebOperatorLiveSmokeMessage,
  invoke: (request: Request) => Promise<Response>,
  now = new Date()
): Promise<LiveSmokeProcessingResult> {
  const startedAt = now.toISOString();
  const claimed = await env.DB.prepare(`UPDATE web_operator_live_smoke_requests
    SET state='running',started_at=?,attempt_count=attempt_count+1
    WHERE request_id=? AND state IN ('pending','queued')`)
    .bind(startedAt, message.requestId).run();
  if (Number(claimed.meta.changes) !== 1) return { status: "ignored" };

  const row = await env.DB.prepare(`SELECT request_id,idempotency_key,candidate_url,state
    FROM web_operator_live_smoke_requests WHERE request_id=?`).bind(message.requestId).first<LiveSmokeRequestRow>();
  if (!row) return { status: "ignored" };

  if (env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") {
    return failRequest(env, row, "smoke_disabled", now);
  }
  const runtimeToken = env.WEB_OPERATOR_RUNTIME_TOKEN?.trim();
  if (!runtimeToken) return failRequest(env, row, "runtime_token_unavailable", now);

  try {
    const response = await invoke(new Request(INTERNAL_SMOKE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtimeToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        candidateUrl: row.candidate_url,
        idempotencyKey: row.idempotency_key
      })
    }));
    if (!response.ok) {
      const details = await response.clone().json<Record<string, unknown>>().catch(() => undefined);
      const suffix = safeFailureToken(details?.failureClass ?? details?.error);
      return failRequest(env, row, `http_${response.status}${suffix ? `_${suffix}` : ""}`, now);
    }
    const report = await response.json<Record<string, unknown>>();
    const runId = nestedString(report, "run", "runId");
    const outcomeState = typeof report.status === "string" ? report.status : undefined;
    await env.DB.prepare(`UPDATE web_operator_live_smoke_requests
      SET state='completed',run_id=?,outcome_state=?,failure_class=NULL,completed_at=?
      WHERE request_id=? AND state='running'`)
      .bind(runId ?? null, outcomeState ?? null, new Date().toISOString(), row.request_id).run();
    return { status: "completed", runId, outcomeState };
  } catch {
    return failRequest(env, row, "internal_execution_failure", now);
  }
}

async function failRequest(
  env: Pick<Env, "DB">,
  row: LiveSmokeRequestRow,
  failureClass: string,
  now: Date
): Promise<Extract<LiveSmokeProcessingResult, { status: "failed" }>> {
  const completedAt = new Date(Math.max(Date.now(), now.getTime())).toISOString();
  const store = new D1AgentRuntimeStore(env.DB);
  const run = await store.getRunByIdempotencyKey(
    "live-smoke",
    makeId("live_public_resource", new URL(row.candidate_url).origin),
    row.idempotency_key
  );
  if (run && !["completed", "failed", "cancelled"].includes(run.state)) {
    await store.failRunDelivery(run.runId, `Bounded live smoke terminated: ${failureClass}`, completedAt);
  }
  await env.DB.prepare(`UPDATE web_operator_live_smoke_requests
    SET state='failed',run_id=COALESCE(?,run_id),failure_class=?,completed_at=?
    WHERE request_id=? AND state='running'`)
    .bind(run?.runId ?? null, failureClass, completedAt, row.request_id).run();
  return { status: "failed", failureClass, runId: run?.runId };
}

function nestedString(value: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = value[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return undefined;
  const candidate = (nested as Record<string, unknown>)[nestedKey];
  return typeof candidate === "string" ? candidate : undefined;
}

function safeFailureToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return normalized || undefined;
}
