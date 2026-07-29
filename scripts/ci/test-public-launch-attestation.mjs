#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertPublicLaunchAttestation,
  assertRegistrationRateLimitRule,
  canonicalJson,
  verifyPublicEdgeArtifactReference,
  verifyWafRateLimitReference,
  wafRuleConfiguration
} from "../lib/public-launch-attestation.mjs";

const releaseSha = "a".repeat(40);
const productionVersionId = "01234567-89ab-cdef-0123-456789abcdef";
const transitionMarker =
  `${releaseSha}:${productionVersionId}:2026-07-31T12:00:00.000Z`;
const canaryAttestation = "{\"signed\":\"canary\"}";
const zoneId = "b".repeat(32);
const rulesetId = "c".repeat(32);
const ruleId = "d".repeat(32);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const rule = {
  id: ruleId,
  ref: "distilled-registration-rate-limit",
  enabled: true,
  action: "managed_challenge",
  expression:
    '(http.request.method eq "POST" and http.request.uri.path eq "/api/auth/register")',
  ratelimit: {
    characteristics: ["ip.src"],
    period: 3_600,
    requests_per_period: 2,
    mitigation_timeout: 600
  }
};
const raw = JSON.stringify({
  schemaVersion: 1,
  releaseSha,
  productionVersionId,
  transitionMarker,
  issuedAt: "2026-08-01T12:06:00.000Z",
  expiresAt: "2026-08-03T12:06:00.000Z",
  canaryAttestationSha256: hash(canaryAttestation),
  legalApprovalSha256: "1".repeat(64),
  policyInboxRoundTripSha256: "2".repeat(64),
  operatorGoNoGoSha256: "3".repeat(64),
  waf: {
    zoneId,
    rulesetId,
    ruleId,
    configurationSha256: hash(canonicalJson(wafRuleConfiguration(rule)))
  },
  publicEdge: {
    workflowRunId: 123,
    artifactId: 456,
    artifactDigest: `sha256:${"4".repeat(64)}`
  },
  backup: {
    bucket: "distilled-news-production-backups",
    objectKey: `pre-migration/${releaseSha}/123-1/d1-backup.enc`,
    encryptedSha256: "5".repeat(64),
    restoreEvidenceSha256: "6".repeat(64)
  },
  closedObservation: {
    startedAt: "2026-07-31T12:05:00.000Z",
    endedAt: "2026-08-01T12:05:00.000Z",
    healthEvidenceSha256: "7".repeat(64),
    publicationCycleId: "production-cycle-2026-08-01"
  }
});
const expected = {
  releaseSha,
  productionVersionId,
  transitionMarker,
  versionCreatedAt: "2026-07-31T12:00:00.000Z",
  canaryAttestation,
  zoneId
};
const now = new Date("2026-08-01T13:00:00.000Z");
const attestation = assertPublicLaunchAttestation(raw, expected, now);
assert.equal(attestation.releaseSha, releaseSha);
assert.equal(attestation.publicEdge.workflowRunId, 123);
assert.equal(attestation.waf.configurationSha256, hash(canonicalJson(wafRuleConfiguration(rule))));
assert.throws(
  () => assertPublicLaunchAttestation(raw, expected, new Date("2026-08-01T11:59:59.000Z")),
  /24 hours/
);
assert.throws(
  () => assertPublicLaunchAttestation(
    JSON.stringify({ ...JSON.parse(raw), transitionMarker: "wrong-marker" }),
    expected,
    now
  ),
  /transition marker/
);
assert.throws(
  () => assertPublicLaunchAttestation(
    JSON.stringify({
      ...JSON.parse(raw),
      closedObservation: {
        ...JSON.parse(raw).closedObservation,
        startedAt: "2026-07-31T13:00:00.000Z"
      }
    }),
    expected,
    now
  ),
  /24-hour/
);

assert.equal(assertRegistrationRateLimitRule(rule), true);
assert.throws(
  () => assertRegistrationRateLimitRule({
    ...rule,
    ratelimit: { ...rule.ratelimit, requests_per_period: 3 }
  }),
  /looser/
);
assert.throws(
  () => assertRegistrationRateLimitRule({
    ...rule,
    expression: '(http.request.uri.path eq "/api/auth/login")'
  }),
  /narrowly scoped/
);

const publicEdgeFetcher = async (url) => {
  if (String(url).endsWith("/actions/runs/123")) {
    return Response.json({
      id: 123,
      status: "completed",
      conclusion: "success",
      head_sha: releaseSha,
      head_branch: "main",
      event: "workflow_dispatch",
      path: ".github/workflows/public-edge-cost.yml@refs/heads/main"
    });
  }
  if (String(url).endsWith("/actions/artifacts/456")) {
    return Response.json({
      id: 456,
      name: "public-edge-cost-evidence-123-1",
      size_in_bytes: 4096,
      expired: false,
      digest: `sha256:${"4".repeat(64)}`,
      workflow_run: {
        id: 123,
        head_sha: releaseSha,
        head_branch: "main"
      }
    });
  }
  return new Response("not found", { status: 404 });
};
assert.equal(await verifyPublicEdgeArtifactReference(attestation, {
  token: "github-token",
  repository: "owner/repository",
  fetcher: publicEdgeFetcher
}), true);

const wafFetcher = async () => Response.json({
  success: true,
  result: {
    id: rulesetId,
    kind: "zone",
    phase: "http_ratelimit",
    rules: [rule]
  }
});
assert.equal(await verifyWafRateLimitReference(attestation, {
  token: "cloudflare-token",
  zoneId,
  fetcher: wafFetcher
}), true);

console.log("Public launch attestation validation passed.");
