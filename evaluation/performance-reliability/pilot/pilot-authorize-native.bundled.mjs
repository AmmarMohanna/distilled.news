// pilot-authorize-native.ts
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

import {qualityD1} from "../../../benchmarks/quality-focus/ledger.mjs";

// apps/worker/src/v1-intelligence/model-spending-evaluation.ts
function validateEvaluationScope(g) {
  const s = g.evaluationScope;
  if (!s) return;
  const w = s.workflow, c = s.maxPerOperationUsd ?? 0.125;
  if (!Number.isFinite(c) || c <= 0 || c > 0.35 || c > 0.125 && !w || w && (!w.id || w.id !== s.manifestHash || !Number.isSafeInteger(w.maxNewOperations) || w.maxNewOperations < 1 || w.maxNewOperations > 24 || !Number.isFinite(w.maxNewSpendingUsd) || w.maxNewSpendingUsd <= 0 || w.maxNewSpendingUsd > 3 || s.maxNewSpendingUsd > w.maxNewSpendingUsd)) throw Error("INVALID_EVALUATION_WORKFLOW");
  if (g.recoveryScope || !s.feedId || !s.manifestHash || !Array.isArray(s.operations) || !s.operations.length || s.operations.length > 24 || new Set(s.operations.map((o) => o.id)).size !== s.operations.length || s.operations.some((o) => !o.id || !o.requestHash || !g.modelIds.includes(o.model)) || s.maxNewOperations !== s.operations.length || s.maxConcurrentOperations !== 1 || !Number.isFinite(s.maxNewSpendingUsd) || s.maxNewSpendingUsd <= 0 || s.maxNewSpendingUsd > 3 || s.maxNewSpendingUsd > g.maxExposureUsd || s.maxLifetimeExposureUsd !== 73) throw Error("INVALID_EVALUATION_SCOPE");
}

// apps/worker/src/v1-intelligence/model-spending-recovery.ts
function validateRecoveryScope(grant2) {
  const s = grant2.recoveryScope;
  if (!s) return;
  if (!s.feedId || !Array.isArray(s.requests) || !s.requests.length || s.requests.some((r2) => !r2.requestId || !r2.evidenceRevisionId) || new Set(s.requests.map((r2) => r2.requestId)).size !== s.requests.length || new Set(s.requests.map((r2) => r2.evidenceRevisionId)).size !== s.requests.length || ![s.maxNewSpendingUsd, s.maxLifetimeExposureUsd].every((v) => Number.isFinite(v) && v > 0) || s.maxNewSpendingUsd > grant2.maxExposureUsd || !Number.isSafeInteger(s.maxNewOperations) || s.maxNewOperations < 1 || s.maxNewOperations > 2 * s.requests.length || s.maxConcurrentOperations !== 1) throw Error("INVALID_RECOVERY_SCOPE");
}

// apps/worker/src/v1-intake/canonical.ts
function canonicalJson(value) {
  function ordered(v) {
    if (Array.isArray(v)) return v.map(ordered);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, value2]) => value2 !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value2]) => [key, ordered(value2)]));
    return v;
  }
  return JSON.stringify(ordered(value));
}

// apps/worker/src/v1-intelligence/model-spending.ts
var ModelSpendingWait = class extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
};
var instant = (value) => new Date(value).toISOString();
var legacyMissing = `SELECT COUNT(*) AS n FROM v1_feed_documents d WHERE d.kind IN ('semantic_intents','salience_intents','model_intents') AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r WHERE r.id=d.kind||':'||d.id)`;
async function authorizeModelSpending(db2, grant2) {
  if (!grant2.id || !grant2.accountId || !grant2.modelIds.length || grant2.modelIds.some((m) => !m) || !Number.isFinite(grant2.maxExposureUsd) || grant2.maxExposureUsd <= 0 || !Number.isSafeInteger(grant2.maxConcurrentOperations) || grant2.maxConcurrentOperations < 1 || !Number.isFinite(Date.parse(grant2.validFrom)) || !Number.isFinite(Date.parse(grant2.validUntil)) || Date.parse(grant2.validFrom) >= Date.parse(grant2.validUntil)) throw Error("INVALID_ACCOUNT_AUTHORIZATION");
  if (grant2.maxOperations !== void 0 && (!Number.isSafeInteger(grant2.maxOperations) || grant2.maxOperations < 1) || grant2.feedIds !== void 0 && (!Array.isArray(grant2.feedIds) || !grant2.feedIds.length || grant2.feedIds.some((id) => typeof id !== "string" || !id) || new Set(grant2.feedIds).size !== grant2.feedIds.length)) throw Error("INVALID_ACCOUNT_AUTHORIZATION_SCOPE");
  validateRecoveryScope(grant2);
  validateEvaluationScope(grant2);
  if (grant2.evaluationScope && !await db2.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first()) throw Error("EVALUATION_SCOPE_MIGRATION_REQUIRED");
  if (grant2.recoveryScope && !await db2.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_recovery_scope'").first()) throw Error("RECOVERY_SCOPE_MIGRATION_REQUIRED");
  const prior2 = await db2.prepare("SELECT json FROM v1_model_spending_authorizations WHERE id=?").bind(grant2.id).first();
  if (prior2) {
    if (canonicalJson(JSON.parse(prior2.json)) !== canonicalJson(grant2)) throw Error("ACCOUNT_AUTHORITY_IDENTITY_CONFLICT");
    return;
  }
  const unreconciled = await db2.prepare(legacyMissing).first();
  if (unreconciled?.n) throw new ModelSpendingWait("LEGACY_LIABILITIES_UNRECONCILED");
  const overlap = await db2.prepare("SELECT id FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<? AND valid_until>?").bind(grant2.accountId, instant(grant2.validUntil), instant(grant2.validFrom)).first();
  if (overlap) throw Error("ACCOUNT_AUTHORIZATION_OVERLAP");
  const guard = crypto.randomUUID();
  await db2.batch([db2.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN (${legacyMissing})=0 AND NOT EXISTS(SELECT 1 FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<? AND valid_until>?) THEN 1 ELSE 0 END`).bind(guard, grant2.accountId, instant(grant2.validUntil), instant(grant2.validFrom)), db2.prepare("INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)").bind(grant2.id, grant2.accountId, instant(grant2.validFrom), instant(grant2.validUntil), JSON.stringify(grant2)), db2.prepare("DELETE FROM v1_model_spending_guards WHERE id=?").bind(guard)]);
}

// pilot-authorize-native.ts
var dir = ".local-reports/real-campaigns/pilotnov01";
var r = JSON.parse(readFileSync(dir + "/pilotnov02-users.private.json", "utf8"));
if (r.users.length !== 2 || r.users.some((u) => u.state !== "READY")) throw Error("REAL_USERS_NOT_VERIFIED");
var token = process.env.CAMPAIGN_CLOUDFLARE_TOKEN;
var db = qualityD1(token);
var grant = { id: "pilotnov02-user-approved", accountId: "pilotnov02-provider", modelIds: ["openai/gpt-4.1", "openai/gpt-4.1-mini"], validFrom: (/* @__PURE__ */ new Date()).toISOString(), validUntil: "2026-11-02T02:35:00.000Z", maxExposureUsd: 12, maxConcurrentOperations: 3, maxOperations: 40, feedIds: r.users.flatMap((u) => ["assessment:" + u.id, ...[0, 1].map((i) => "qa_pilotnov02_u" + u.slot + "_f" + i)]) };
var prior = await db.prepare("SELECT json FROM v1_model_spending_authorizations WHERE id=?").bind(grant.id).first();
if (prior) throw Error("GRANT_ALREADY_EXISTS_REUSE_NOT_REAUTHORIZE");
var tracking = await db.prepare("SELECT COUNT(*) n FROM settings WHERE key LIKE 'model-spending:tracking-only:%'").first();
if (tracking.n) throw Error("TRACKING_ONLY_NOT_ALLOWED");
await authorizeModelSpending(db, grant);
writeFileSync(dir + "/pilotnov02-native-grant.private.json", JSON.stringify(grant, null, 2));
appendFileSync(dir + "/progress.jsonl", JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), action: "APPEND_AUTHORIZED_PILOT_GRANT", accountId: grant.accountId, maxExposureUsd: 12, maxOperations: 40, userTaskCeilingUsd: 50, reason: "existing provider key has 18.50 remaining; retain shared headroom", historicalRecordsChanged: false }) + "\n");
console.log(JSON.stringify({ grantCreated: true, nativeCeiling: 12, userTaskCeiling: 50, operationCeiling: 40, expiresAt: grant.validUntil, feedScopes: grant.feedIds.length }));
