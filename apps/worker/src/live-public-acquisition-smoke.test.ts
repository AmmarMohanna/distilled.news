import { readFile } from "node:fs/promises";
import { makeId } from "@distilled/agent-runtime/contracts";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import {
  dispatchPendingLivePublicAcquisitionSmokes,
  processLivePublicAcquisitionSmoke
} from "./live-public-acquisition-smoke";
import type { Env, WebOperatorLiveSmokeMessage } from "./types";

describe("live public acquisition operator trigger", () => {
  let mf: Miniflare | undefined;

  afterEach(async () => {
    await mf?.dispose();
    mf = undefined;
  });

  it("is disabled by default and dispatches each durable request at most once when enabled", async () => {
    const db = await setup();
    await insertRequest(db, "request-a", "smoke-a-key", "2026-09-15T00:00:00.000Z");
    const messages: WebOperatorLiveSmokeMessage[] = [];
    const queue = { send: async (message: WebOperatorLiveSmokeMessage) => { messages.push(message); } };

    expect(await dispatchPendingLivePublicAcquisitionSmokes({
      DB: db,
      WEB_OPERATOR_QUEUE: queue as unknown as Env["WEB_OPERATOR_QUEUE"],
      DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: undefined
    }, new Date("2026-09-15T00:00:01.000Z"))).toBe(0);
    expect(messages).toEqual([]);

    const enabled = {
      DB: db,
      WEB_OPERATOR_QUEUE: queue as unknown as Env["WEB_OPERATOR_QUEUE"],
      DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true"
    };
    expect(await dispatchPendingLivePublicAcquisitionSmokes(enabled, new Date("2026-09-15T00:00:02.000Z"))).toBe(1);
    expect(await dispatchPendingLivePublicAcquisitionSmokes(enabled, new Date("2026-09-15T00:00:03.000Z"))).toBe(0);
    expect(messages).toEqual([{ type: "live_public_acquisition_smoke", requestId: "request-a" }]);
  });

  it("maps a fresh explicit identity to one acquisition and fences duplicate queue delivery", async () => {
    const db = await setup();
    await applyMigration(db, "0011_agent_runtime.sql");
    await db.prepare(`INSERT INTO agent_runs
      (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
      VALUES ('agent_run_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','live-smoke','old-resource','old-smoke-key','old-candidate','https://example.test/old','example.test','old','old','known_candidate','queued',1,'old-policy','old-contract','2026-09-14T00:00:00Z','2026-09-14T00:00:00Z')`).run();
    await insertRequest(db, "request-new", "fresh-smoke-key", "2026-09-15T00:00:00.000Z");
    const invokedBodies: unknown[] = [];
    const invokedAuthorization: Array<string | null> = [];
    const invoke = vi.fn(async (request: Request) => {
      invokedBodies.push(await request.clone().json());
      invokedAuthorization.push(request.headers.get("authorization"));
      return Response.json({
        status: "acquired_by_agent",
        run: { runId: "agent_run_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", state: "completed" },
        acquiredContent: { acceptanceId: "accepted" },
        completionVerifier: { outcome: "accepted" }
      });
    });
    const env = {
      DB: db,
      WEB_OPERATOR_RUNTIME_TOKEN: "worker-held-secret",
      DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true"
    };
    const message = { type: "live_public_acquisition_smoke", requestId: "request-new" } as const;

    expect(await processLivePublicAcquisitionSmoke(env, message, invoke, new Date("2026-09-15T00:00:01.000Z")))
      .toMatchObject({ status: "completed", runId: "agent_run_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    expect(await processLivePublicAcquisitionSmoke(env, message, invoke, new Date("2026-09-15T00:00:02.000Z")))
      .toEqual({ status: "ignored" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invokedBodies[0]).toEqual({
      candidateUrl: "https://matklad.github.io/2024/12/24/minimal-version-selection-revisited.html",
      idempotencyKey: "fresh-smoke-key"
    });
    expect(JSON.stringify(invokedBodies[0])).not.toContain("worker-held-secret");
    expect(invokedAuthorization).toEqual(["Bearer worker-held-secret"]);
    const row = await db.prepare(`SELECT state,attempt_count,run_id,outcome_state,failure_class
      FROM web_operator_live_smoke_requests WHERE request_id='request-new'`).first();
    expect(row).toEqual({
      state: "completed",
      attempt_count: 1,
      run_id: "agent_run_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      outcome_state: "acquired_by_agent",
      failure_class: null
    });
  });

  it("keeps repeated operator admission with the same explicit identity idempotent", async () => {
    const db = await setup();
    await insertRequest(db, "request-same", "same-smoke-key", "2026-09-15T00:00:00.000Z");
    await insertRequest(db, "request-same", "same-smoke-key", "2026-09-15T00:00:01.000Z");
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM web_operator_live_smoke_requests
      WHERE idempotency_key='same-smoke-key'`).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("adds operator smoke admission to an existing runtime schema without changing prior runs", async () => {
    await mf?.dispose();
    mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    const db = await mf.getD1Database("DB");
    for (const migration of [
      "0011_agent_runtime.sql",
      "0012_agent_runtime_security_and_provenance.sql",
      "0016_model_attempt_timeout_provenance.sql"
    ]) await applyMigration(db, migration);
    await db.prepare(`INSERT INTO agent_runs
      (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
      VALUES ('agent_run_cccccccccccccccccccccccccccccccc','tenant','resource','existing-key','candidate','https://example.test/article','example.test','attempt','Acquire','known_candidate','completed',1,'policy','contract','2026-09-14T00:00:00Z','2026-09-14T00:00:00Z')`).run();
    await applyMigration(db, "0017_web_operator_live_smoke_requests.sql");
    expect(await db.prepare("SELECT state FROM agent_runs WHERE idempotency_key='existing-key'").first()).toEqual({ state: "completed" });
    await insertRequest(db, "request-upgrade", "upgrade-smoke-key", "2026-09-15T00:00:00.000Z");
    expect(await db.prepare("SELECT state FROM web_operator_live_smoke_requests WHERE request_id='request-upgrade'").first())
      .toEqual({ state: "pending" });
  });

  it("records a bounded failure without retrying the live acquisition", async () => {
    const db = await setupRuntime();
    await insertRequest(db, "request-failed", "failed-smoke-key", "2026-09-15T00:00:00.000Z");
    const resourceId = makeId("live_public_resource", "https://matklad.github.io");
    await db.prepare(`INSERT INTO agent_runs
      (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
      VALUES ('agent_run_dddddddddddddddddddddddddddddddd','live-smoke',?,'failed-smoke-key','candidate','https://matklad.github.io/2024/12/24/minimal-version-selection-revisited.html','matklad.github.io','live-public-smoke','Acquire','known_candidate','queued',1,'policy','contract','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z')`)
      .bind(resourceId).run();
    await db.prepare(`INSERT INTO agent_outbox
      (id,run_id,kind,state,created_at,delivered_at,attempts,next_attempt_at)
      VALUES ('outbox-failed','agent_run_dddddddddddddddddddddddddddddddd','agent_run_wake','delivered','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z',1,'2026-09-15T00:00:00Z')`).run();
    const invoke = vi.fn(async () => Response.json({ error: "model_gateway_failure", failureClass: "deadline_exceeded" }, { status: 503 }));
    const result = await processLivePublicAcquisitionSmoke({
      DB: db,
      WEB_OPERATOR_RUNTIME_TOKEN: "worker-held-secret",
      DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true"
    }, { type: "live_public_acquisition_smoke", requestId: "request-failed" }, invoke, new Date("2026-09-15T00:00:01.000Z"));
    expect(result).toEqual({
      status: "failed",
      failureClass: "http_503_deadline_exceeded",
      runId: "agent_run_dddddddddddddddddddddddddddddddd"
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await db.prepare("SELECT state,generation FROM agent_runs WHERE run_id='agent_run_dddddddddddddddddddddddddddddddd'").first())
      .toEqual({ state: "failed", generation: 2 });
    expect(await db.prepare("SELECT state,attempts FROM agent_outbox WHERE run_id='agent_run_dddddddddddddddddddddddddddddddd'").first())
      .toEqual({ state: "failed", attempts: 1 });
    expect(await db.prepare("SELECT state,run_id,failure_class FROM web_operator_live_smoke_requests WHERE request_id='request-failed'").first())
      .toEqual({
        state: "failed",
        run_id: "agent_run_dddddddddddddddddddddddddddddddd",
        failure_class: "http_503_deadline_exceeded"
      });
    expect(await processLivePublicAcquisitionSmoke({
      DB: db,
      WEB_OPERATOR_RUNTIME_TOKEN: "worker-held-secret",
      DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true"
    }, { type: "live_public_acquisition_smoke", requestId: "request-failed" }, invoke)).toEqual({ status: "ignored" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  async function setup(): Promise<D1Database> {
    mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    const db = await mf.getD1Database("DB");
    await applyMigration(db, "0017_web_operator_live_smoke_requests.sql");
    return db;
  }

  async function setupRuntime(): Promise<D1Database> {
    await mf?.dispose();
    mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    const db = await mf.getD1Database("DB");
    for (const migration of [
      "0011_agent_runtime.sql",
      "0012_agent_runtime_security_and_provenance.sql",
      "0016_model_attempt_timeout_provenance.sql",
      "0017_web_operator_live_smoke_requests.sql"
    ]) await applyMigration(db, migration);
    return db;
  }
});

describe("live smoke HTTP security boundary", () => {
  const app = createApp();
  const workerEnv = {
    WEB_OPERATOR_RUNTIME_TOKEN: "worker-held-secret",
    DISTILLED_LIVE_PUBLIC_CANDIDATE_URL: "https://matklad.github.io/2024/12/24/minimal-version-selection-revisited.html",
    DISTILLED_BROWSER_BACKEND: "local",
    DISTILLED_LLM_MODE: "api",
    DISTILLED_LLM_API_GATEWAY: "openrouter",
    DISTILLED_MODEL_CALL_TIMEOUT_MS: "45000",
    DISTILLED_RUN_SETTLEMENT_RESERVE_MS: "5000",
    OPENROUTER_API_KEY: "test-openrouter-key"
  } as unknown as Env;

  it("keeps the smoke route disabled by default without disclosing the runtime secret", async () => {
    const response = await app.request("/v1/live-smoke/public-acquisition", {
      method: "POST",
      headers: { authorization: "Bearer worker-held-secret", "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "fresh-smoke-key" })
    }, workerEnv);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("rejects unauthenticated smoke and runtime requests without returning the secret", async () => {
    const enabled = { ...workerEnv, DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true" } as Env;
    const smoke = await app.request("/v1/live-smoke/public-acquisition", { method: "POST" }, enabled);
    const runtime = await app.request("/v1/agent-runs/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "web_operator_run", runId: "agent_run_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
    }, enabled);
    expect(smoke.status).toBe(401);
    expect(runtime.status).toBe(401);
    expect(JSON.stringify(await smoke.json())).not.toContain("worker-held-secret");
    expect(JSON.stringify(await runtime.json())).not.toContain("worker-held-secret");
  });

  it("requires an explicit smoke identity before production assembly is invoked", async () => {
    const response = await app.request("/v1/live-smoke/public-acquisition", {
      method: "POST",
      headers: { authorization: "Bearer worker-held-secret", "content-type": "application/json" },
      body: JSON.stringify({})
    }, { ...workerEnv, DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true" } as Env);
    expect(response.status).toBe(400);
  });
});

async function insertRequest(db: D1Database, requestId: string, idempotencyKey: string, createdAt: string) {
  await db.prepare(`INSERT OR IGNORE INTO web_operator_live_smoke_requests
    (request_id,idempotency_key,candidate_url,state,created_at) VALUES (?,?,?,'pending',?)`)
    .bind(requestId, idempotencyKey, "https://matklad.github.io/2024/12/24/minimal-version-selection-revisited.html", createdAt).run();
}

async function applyMigration(db: D1Database, migration: string) {
  const sql = (await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}
