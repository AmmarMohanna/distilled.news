import { createHash } from "node:crypto";

export const publicLaunchAttestationSchemaVersion = 1;
export const minimumClosedObservationMs = 24 * 60 * 60 * 1000;
export const maximumApprovalLifetimeMs = 72 * 60 * 60 * 1000;
export const publicEdgeWorkflowPath = ".github/workflows/public-edge-cost.yml";
export const productionBackupBucket = "distilled-news-production-backups";

export function assertPublicLaunchAttestation(raw, expected, now = new Date()) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 16_384) {
    throw new Error("PUBLIC_LAUNCH_ATTESTATION is missing or unreasonably large.");
  }
  let attestation;
  try {
    attestation = JSON.parse(raw);
  } catch {
    throw new Error("PUBLIC_LAUNCH_ATTESTATION is not valid JSON.");
  }
  if (!isRecord(attestation) || attestation.schemaVersion !== publicLaunchAttestationSchemaVersion) {
    throw new Error("Unsupported public launch attestation schema.");
  }

  const releaseSha = fullSha(attestation.releaseSha, "release SHA");
  if (releaseSha !== fullSha(expected.releaseSha, "expected release SHA")) {
    throw new Error("Public launch attestation does not match the live release SHA.");
  }
  const productionVersionId = identifier(attestation.productionVersionId, "production version ID");
  if (productionVersionId !== identifier(expected.productionVersionId, "expected production version ID")) {
    throw new Error("Public launch attestation does not match the live Worker version.");
  }
  if (attestation.transitionMarker !== expected.transitionMarker) {
    throw new Error("Public launch attestation does not match the finalized transition marker.");
  }

  const nowMs = validDate(now, "current time").getTime();
  const versionCreatedAt = validDate(expected.versionCreatedAt, "Worker version creation time");
  if (nowMs - versionCreatedAt.getTime() < minimumClosedObservationMs) {
    throw new Error("Production has not remained on the closed Worker version for 24 hours.");
  }
  const issuedAt = validDate(attestation.issuedAt, "attestation issue time");
  const expiresAt = validDate(attestation.expiresAt, "attestation expiry time");
  if (issuedAt.getTime() > nowMs || expiresAt.getTime() <= nowMs) {
    throw new Error("Public launch attestation is not currently valid.");
  }
  if (
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > maximumApprovalLifetimeMs
  ) {
    throw new Error("Public launch attestation lifetime exceeds 72 hours.");
  }

  const closedObservation = record(attestation.closedObservation, "closed production observation");
  const observationStartedAt = validDate(
    closedObservation.startedAt,
    "closed observation start"
  );
  const observationEndedAt = validDate(closedObservation.endedAt, "closed observation end");
  if (observationStartedAt.getTime() < versionCreatedAt.getTime()) {
    throw new Error("Closed production observation started before the live Worker version existed.");
  }
  if (
    observationEndedAt.getTime() - observationStartedAt.getTime() < minimumClosedObservationMs ||
    observationEndedAt.getTime() > issuedAt.getTime()
  ) {
    throw new Error("Closed production observation does not prove a completed 24-hour window.");
  }

  const canaryAttestationSha256 = sha256(attestation.canaryAttestationSha256, "canary attestation");
  const expectedCanaryDigest = createHash("sha256")
    .update(String(expected.canaryAttestation ?? ""), "utf8")
    .digest("hex");
  if (canaryAttestationSha256 !== expectedCanaryDigest) {
    throw new Error("Public launch attestation does not bind the supplied canary attestation.");
  }

  const waf = record(attestation.waf, "WAF evidence");
  const publicEdge = record(attestation.publicEdge, "public-edge evidence");
  const backup = record(attestation.backup, "backup evidence");
  const zoneId = cloudflareId(waf.zoneId, "WAF zone ID");
  if (expected.zoneId && zoneId !== cloudflareId(expected.zoneId, "expected WAF zone ID")) {
    throw new Error("Public launch attestation does not match the configured Cloudflare zone.");
  }

  const backupBucket = String(backup.bucket ?? "");
  if (backupBucket !== productionBackupBucket) {
    throw new Error("Public launch attestation references the wrong backup bucket.");
  }
  const objectKey = String(backup.objectKey ?? "");
  if (
    !objectKey.startsWith(`pre-migration/${releaseSha}/`) ||
    objectKey.includes("..") ||
    !/^[A-Za-z0-9._/-]+\.enc$/.test(objectKey)
  ) {
    throw new Error("Public launch attestation has an invalid release-bound backup object key.");
  }

  return {
    schemaVersion: publicLaunchAttestationSchemaVersion,
    releaseSha,
    productionVersionId,
    transitionMarker: String(attestation.transitionMarker),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    canaryAttestationSha256,
    legalApprovalSha256: sha256(attestation.legalApprovalSha256, "legal approval"),
    policyInboxRoundTripSha256: sha256(
      attestation.policyInboxRoundTripSha256,
      "policy inbox round-trip evidence"
    ),
    operatorGoNoGoSha256: sha256(attestation.operatorGoNoGoSha256, "operator go/no-go"),
    waf: {
      zoneId,
      rulesetId: cloudflareId(waf.rulesetId, "WAF ruleset ID"),
      ruleId: cloudflareId(waf.ruleId, "WAF rule ID"),
      configurationSha256: sha256(waf.configurationSha256, "WAF configuration")
    },
    publicEdge: {
      workflowRunId: positiveInteger(publicEdge.workflowRunId, "public-edge workflow run ID"),
      artifactId: positiveInteger(publicEdge.artifactId, "public-edge artifact ID"),
      artifactDigest: artifactDigest(publicEdge.artifactDigest)
    },
    backup: {
      bucket: backupBucket,
      objectKey,
      encryptedSha256: sha256(backup.encryptedSha256, "encrypted backup"),
      restoreEvidenceSha256: sha256(backup.restoreEvidenceSha256, "backup restore evidence")
    },
    closedObservation: {
      startedAt: observationStartedAt.toISOString(),
      endedAt: observationEndedAt.toISOString(),
      healthEvidenceSha256: sha256(
        closedObservation.healthEvidenceSha256,
        "closed production health evidence"
      ),
      publicationCycleId: identifier(
        closedObservation.publicationCycleId,
        "closed production publication cycle ID"
      )
    }
  };
}

export async function verifyPublicEdgeArtifactReference(
  attestation,
  { token, repository, fetcher = fetch }
) {
  if (!token || !/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("Public-edge evidence verification requires GitHub Actions read access.");
  }
  const [run, artifact] = await Promise.all([
    githubJson(
      `/repos/${repository}/actions/runs/${attestation.publicEdge.workflowRunId}`,
      token,
      fetcher
    ),
    githubJson(
      `/repos/${repository}/actions/artifacts/${attestation.publicEdge.artifactId}`,
      token,
      fetcher
    )
  ]);
  if (
    Number(run.id) !== attestation.publicEdge.workflowRunId ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_sha !== attestation.releaseSha ||
    run.head_branch !== "main" ||
    run.event !== "workflow_dispatch" ||
    !String(run.path ?? "").startsWith(`${publicEdgeWorkflowPath}@`)
  ) {
    throw new Error("Referenced public-edge workflow run is not a successful same-SHA main run.");
  }
  if (
    Number(artifact.id) !== attestation.publicEdge.artifactId ||
    artifact.expired === true ||
    Number(artifact.size_in_bytes ?? 0) <= 0 ||
    artifact.workflow_run?.id !== attestation.publicEdge.workflowRunId ||
    artifact.workflow_run?.head_sha !== attestation.releaseSha ||
    artifact.workflow_run?.head_branch !== "main" ||
    artifact.digest !== attestation.publicEdge.artifactDigest ||
    !String(artifact.name ?? "").startsWith("public-edge-cost-evidence-")
  ) {
    throw new Error("Referenced public-edge artifact identity or digest does not match.");
  }
  return true;
}

export async function verifyWafRateLimitReference(
  attestation,
  { token, zoneId, fetcher = fetch }
) {
  if (!token || !zoneId || zoneId !== attestation.waf.zoneId) {
    throw new Error("WAF verification requires the existing zone-scoped Cloudflare credential.");
  }
  const ruleset = await cloudflareJson(
    `/zones/${encodeURIComponent(zoneId)}/rulesets/${encodeURIComponent(attestation.waf.rulesetId)}`,
    token,
    fetcher
  );
  if (
    ruleset.id !== attestation.waf.rulesetId ||
    ruleset.kind !== "zone" ||
    ruleset.phase !== "http_ratelimit"
  ) {
    throw new Error("Referenced WAF ruleset is not the zone rate-limiting entry point.");
  }
  const rule = (ruleset.rules ?? []).find((candidate) => candidate?.id === attestation.waf.ruleId);
  assertRegistrationRateLimitRule(rule);
  const digest = createHash("sha256")
    .update(canonicalJson(wafRuleConfiguration(rule)), "utf8")
    .digest("hex");
  if (digest !== attestation.waf.configurationSha256) {
    throw new Error("Live WAF registration rule differs from the approved configuration.");
  }
  return true;
}

export function assertRegistrationRateLimitRule(rule) {
  if (!isRecord(rule) || rule.enabled === false) {
    throw new Error("Approved WAF registration rule is missing or disabled.");
  }
  const expression = String(rule.expression ?? "");
  if (
    !/http\.request\.method/i.test(expression) ||
    !/\bPOST\b/i.test(expression) ||
    !/http\.request\.uri\.path/i.test(expression) ||
    !/\/api\/auth\/register/i.test(expression)
  ) {
    throw new Error("WAF rule is not narrowly scoped to POST /api/auth/register.");
  }
  if (!["managed_challenge", "challenge", "block"].includes(String(rule.action ?? ""))) {
    throw new Error("WAF registration rule does not apply an abuse-blocking action.");
  }
  const rateLimit = record(rule.ratelimit, "WAF rate limit");
  if (
    !Array.isArray(rateLimit.characteristics) ||
    !rateLimit.characteristics.includes("ip.src") ||
    !Number.isInteger(rateLimit.requests_per_period) ||
    rateLimit.requests_per_period < 1 ||
    rateLimit.requests_per_period > 2 ||
    !Number.isInteger(rateLimit.period) ||
    rateLimit.period < 1 ||
    rateLimit.period > 3_600
  ) {
    throw new Error("WAF registration rate limit is looser than the hosted application ceiling.");
  }
  return true;
}

export function wafRuleConfiguration(rule) {
  return {
    id: rule.id,
    ref: rule.ref ?? null,
    enabled: rule.enabled !== false,
    action: rule.action,
    action_parameters: rule.action_parameters ?? null,
    expression: rule.expression,
    ratelimit: rule.ratelimit,
    logging: rule.logging ?? null
  };
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])])
  );
}

async function githubJson(path, token, fetcher) {
  const response = await fetcher(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "distilled-public-launch-attestation/1",
      "x-github-api-version": "2022-11-28"
    },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GitHub launch evidence read failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function cloudflareJson(path, token, fetcher) {
  const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new Error(`Cloudflare WAF evidence read failed with HTTP ${response.status}.`);
  }
  return payload.result;
}

function artifactDigest(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Public-edge artifact digest must be a GitHub SHA-256 digest.");
  }
  return normalized;
}

function sha256(value, label) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`Public launch attestation has an invalid ${label} SHA-256.`);
  }
  return normalized;
}

function cloudflareId(value, label) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(normalized)) {
    throw new Error(`Public launch attestation has an invalid ${label}.`);
  }
  return normalized;
}

function fullSha(value, label) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`Public launch attestation has an invalid ${label}.`);
  }
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`Public launch attestation has an invalid ${label}.`);
  }
  return normalized;
}

function identifier(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(normalized)) {
    throw new Error(`Public launch attestation has an invalid ${label}.`);
  }
  return normalized;
}

function validDate(value, label) {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Public launch attestation has an invalid ${label}.`);
  }
  return parsed;
}

function record(value, label) {
  if (!isRecord(value)) {
    throw new Error(`Public launch attestation has invalid ${label}.`);
  }
  return value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
