#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertIsolatedStaging,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  repositoryRoot,
  unsetDatabaseId
} from "../lib/release-config.mjs";

const failures = [];
const warnings = [];
const config = readWorkerConfig();
const production = environmentConfig(config, "production");
const staging = environmentConfig(config, "staging");

requireCheck(config.main === "DO_NOT_DEPLOY_WITHOUT_A_NAMED_ENVIRONMENT", "bare top-level Wrangler deploy is disabled");
requireCheck(production.main === "src/index.ts" && staging.main === "src/index.ts", "named environments have the Worker entrypoint");
requireCheck(production.workers_dev === false, "production workers.dev is disabled");
requireCheck(production.preview_urls === false, "production preview URLs are disabled");
requireCheck(staging.workers_dev === false, "staging workers.dev is disabled");
requireCheck(staging.preview_urls === false, "staging preview URLs are disabled");
requireCheck(production.vars?.REGISTRATION_MODE === "closed", "production registration remains closed before final canary approval");
requireCheck(
  production.triggers?.crons?.join(",") === staging.triggers?.crons?.join(",") &&
    production.triggers?.crons?.includes("* * * * *"),
  "staging and production use the same one-minute scheduler cadence"
);
for (const binding of ["PROCESSING_QUEUE", "SOURCE_QUEUE", "EDITION_QUEUE"]) {
  const productionName = production.queues?.producers?.find((queue) => queue.binding === binding)?.queue;
  const stagingName = staging.queues?.producers?.find((queue) => queue.binding === binding)?.queue;
  const productionConcurrency = production.queues?.consumers?.find((queue) => queue.queue === productionName)?.max_concurrency;
  const stagingConcurrency = staging.queues?.consumers?.find((queue) => queue.queue === stagingName)?.max_concurrency;
  requireCheck(
    productionConcurrency === stagingConcurrency,
    `staging mirrors production ${binding} concurrency`
  );
}
requireCheck(
  config.compatibility_flags?.includes("global_fetch_strictly_public"),
  "global fetches are restricted to public addresses"
);
requireCheck(
  staging.routes?.some((route) =>
    route.custom_domain &&
    route.pattern === new URL(staging.vars?.PUBLIC_WEB_BASE_URL).hostname
  ),
  "staging public URL has a matching isolated custom-domain route"
);

try {
  assertIsolatedStaging(config, { allowUnsetDatabaseId: true });
} catch (error) {
  failures.push(error.message);
}
if (d1Binding(staging).database_id === unsetDatabaseId) {
  warnings.push("Staging D1 ID is intentionally unset; remote staging, canary, and restore commands remain blocked.");
}

for (const path of [
  "LICENSE",
  "NOTICE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  "docs/ARCHITECTURE.md",
  "docs/THREAT-MODEL.md",
  "docs/SOURCE-COSTS.md",
  "docs/DATA-RETENTION.md",
  "docs/BACKUP-RESTORE.md",
  "docs/INCIDENT-RESPONSE.md",
  "docs/SELF-HOSTING.md",
  "docs/PUBLIC-EDGE.md",
  "docs/legal/PRIVACY.md",
  "docs/legal/TERMS.md",
  "docs/legal/ACCEPTABLE-USE.md",
  "docs/legal/TAKEDOWN.md",
  "docs/legal/SUBPROCESSORS.md"
]) {
  requireCheck(existsSync(resolve(repositoryRoot, path)), `${path} exists`);
}

const appSource = readFileSync(resolve(repositoryRoot, "apps/worker/src/app.ts"), "utf8");
const repositorySource = readFileSync(
  resolve(repositoryRoot, "apps/worker/src/repository.ts"),
  "utf8"
);
const aiSource = readFileSync(resolve(repositoryRoot, "apps/worker/src/ai.ts"), "utf8");
const sourceCosts = readFileSync(resolve(repositoryRoot, "docs/SOURCE-COSTS.md"), "utf8");
const publicEdgeSource = readFileSync(
  resolve(repositoryRoot, "apps/worker/src/publicEdge.ts"),
  "utf8"
);
const publicEdgeDocs = readFileSync(resolve(repositoryRoot, "docs/PUBLIC-EDGE.md"), "utf8");
const publicEdgeLoadGate = readFileSync(
  resolve(repositoryRoot, "scripts/load/public-edge-cost.mjs"),
  "utf8"
);
const publicEdgeWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/public-edge-cost.yml"),
  "utf8"
);
const mailerSource = readFileSync(resolve(repositoryRoot, "apps/worker/src/mailer.ts"), "utf8");
const registrationReceiptMigration = readFileSync(
  resolve(repositoryRoot, "apps/worker/migrations/0027_registration_email_receipts.sql"),
  "utf8"
);
requireCheck(/content-security-policy/i.test(appSource), "Worker sets a Content-Security-Policy");
for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
  requireCheck(appSource.includes(directive), `CSP includes ${directive}`);
}
requireCheck(!/script-src[^;]*'unsafe-inline'/i.test(appSource), "CSP blocks inline scripts");
requireCheck(!/style-src[^;]*'unsafe-inline'/i.test(appSource), "CSP blocks inline styles");
requireCheck(
  appSource.includes('app.get("/canary-fixture.xml"') &&
    appSource.includes('ENVIRONMENT?.trim().toLowerCase() !== "staging"'),
  "controlled canary fixture is staging-only"
);
requireCheck(
  appSource.includes("c.env.EMAIL_CANARY_RECIPIENT") &&
    appSource.includes("recipientFingerprint") &&
    appSource.includes("saveRegistrationEmailReceipt") &&
    appSource.includes('app.post("/api/internal/registration/email-receipt"') &&
    appSource.includes("consumeRegistrationEmailReceipt") &&
    mailerSource.includes("Registration receipt nonce:") &&
    registrationReceiptMigration.includes("registration_email_receipts") &&
    registrationReceiptMigration.includes("nonce_hash") &&
    !registrationReceiptMigration.includes("nonce TEXT"),
  "registration email preflight sends a one-time nonce and persists only its release-bound hash"
);
requireCheck(
  appSource.includes("runModelReadinessCanary") &&
    appSource.includes("modelTest.succeeded") &&
    appSource.includes("modelTest"),
  "registration preflight runs a fixed-input model readiness canary before evaluating readiness"
);
requireCheck(
  appSource.includes('status: "idle" as const') &&
    appSource.includes("no source has exercised this provider yet") &&
    appSource.includes('? "unverified" as const'),
  "enabled providers with zero exercised sources report idle and keep overall status unverified"
);
for (const namespace of ["status", "capabilities", "explore", "feed", "edition", "search", "sitemap"]) {
  requireCheck(
    appSource.includes(`namespace: "${namespace}"`),
    `public ${namespace} response uses the edge cache coordinator`
  );
}
requireCheck(
  publicEdgeSource.includes("workerCaches.default") &&
    publicEdgeSource.includes("COALESCED") &&
    publicEdgeSource.includes('response.headers.has("set-cookie")') &&
    publicEdgeSource.includes('PRIVATE_REQUEST_HEADERS = ["authorization", "cookie"]') &&
    publicEdgeSource.includes('"x-distilled-snapshot"'),
  "public edge cache is explicit, coalesced, and bypasses private or stale responses"
);
requireCheck(
    publicEdgeLoadGate.includes("workersInvocationsAdaptive") &&
    publicEdgeLoadGate.includes("rowsRead") &&
    publicEdgeLoadGate.includes("d1RowsReadPerRequest") &&
    publicEdgeLoadGate.includes("expectedReleaseSha") &&
    publicEdgeWorkflow.includes("RELEASE_SHA: ${{ github.sha }}") &&
    publicEdgeWorkflow.includes("public-edge-cost-evidence-${{ github.run_id }}") &&
    publicEdgeDocs.includes("a Cache API hit still invokes the Worker"),
  "protected exact-SHA staging load gate retains Worker invocation and D1 rows-read evidence"
);
requireCheck(
  mailerSource.includes("/verify-email#token=") &&
    mailerSource.includes("/reset-password#token=") &&
    !mailerSource.includes("/verify-email?token=") &&
    !mailerSource.includes("/reset-password?token="),
  "verification and password-reset bearer tokens use URL fragments that are not sent in HTTP requests"
);
const emailFailureLogger = appSource.slice(
  appSource.indexOf("function logAuthEmailFailure"),
  appSource.indexOf("function emailDomainFromAddress")
);
requireCheck(
  emailFailureLogger.includes("safeErrorIdentifier(errorProperty(error, \"code\"))") &&
    emailFailureLogger.includes("errorClass: safeErrorIdentifier") &&
    !emailFailureLogger.includes("error.message") &&
    !emailFailureLogger.includes("String(error)"),
  "authentication email failures log allowlisted identifiers without raw provider messages"
);
requireCheck(
  appSource.includes("HOSTED_PENDING_ACCOUNT_LEASE_MS") &&
    appSource.includes("releaseExpiredHostedPendingSlots") &&
    appSource.includes("register_pending_lease") &&
    publicEdgeDocs.includes("WAF rate-limiting rule"),
  "hosted pending signup capacity uses bounded leases and a documented WAF-compatible route control"
);
requireCheck(
  production.vars?.OPENAI_PROJECT_ID === "proj_dH3LjVEWjtfgGzWAzI4BFpgJ" &&
    staging.vars?.OPENAI_PROJECT_ID === "proj_h2LV7AMPwS7sMD6U76qmMNAh" &&
    production.vars.OPENAI_PROJECT_ID !== staging.vars.OPENAI_PROJECT_ID &&
    production.vars?.CLOUDFLARE_AI_GATEWAY_ID === "default" &&
    staging.vars?.CLOUDFLARE_AI_GATEWAY_ID === "distilled-news-staging" &&
    production.vars.CLOUDFLARE_AI_GATEWAY_ID !== staging.vars.CLOUDFLARE_AI_GATEWAY_ID &&
    aiSource.includes('"openai-project"') &&
    aiSource.includes("projectId: env.OPENAI_PROJECT_ID"),
  "hosted OpenAI requests pin distinct reviewed project and AI Gateway identities"
);

const registrationControl = readFileSync(
  resolve(repositoryRoot, "scripts/release/registration-control.mjs"),
  "utf8"
);
requireCheck(
  registrationControl.includes('default_usage_model !== "standard"') &&
    registrationControl.includes("cf-bounce.") &&
    registrationControl.includes("EMAIL_CANARY_RECIPIENT") &&
    registrationControl.includes("expectedRecipientFingerprint") &&
    registrationControl.includes("assertModelReadinessEvidence") &&
    registrationControl.includes("verifyApifyReadiness"),
  "registration opening verifies Workers Paid, email delivery, model evidence, and live Apify capacity/contracts"
);

const releaseWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/release.yml"),
  "utf8"
);
const registrationWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/registration-control.yml"),
  "utf8"
);
const publicLaunchAttestation = readFileSync(
  resolve(repositoryRoot, "scripts/lib/public-launch-attestation.mjs"),
  "utf8"
);
requireCheck(
  registrationControl.includes("EMAIL_CANARY_RECEIPT_NONCE") &&
    registrationControl.includes("sendEmailReceipt") &&
    registrationControl.includes("consumeRegistrationEmailReceipt") &&
    registrationWorkflow.includes(
      "EMAIL_CANARY_RECEIPT_NONCE: ${{ secrets.EMAIL_CANARY_RECEIPT_NONCE }}"
    ) &&
    !registrationWorkflow.includes("inputs.email_receipt_nonce") &&
    !registrationControl.includes("arbitrary-recipient canary delivered") &&
    !registrationWorkflow.includes("arbitrary-recipient canary delivered"),
  "registration open atomically consumes the prior email receipt instead of accepting a universal phrase"
);
requireCheck(
  registrationControl.includes("assertPublicLaunchAttestation") &&
    registrationControl.includes("verifyFinalizedLegacyTransition") &&
    registrationControl.includes("verifyPublicEdgeArtifactReference") &&
    registrationControl.includes("verifyWafRateLimitReference") &&
    registrationControl.includes("verifyPrivateBackupReference") &&
    registrationWorkflow.includes(
      "PUBLIC_LAUNCH_ATTESTATION: ${{ secrets.PUBLIC_LAUNCH_ATTESTATION }}"
    ) &&
    registrationWorkflow.includes("CLOUDFLARE_ZONE_ID: ${{ secrets.CLOUDFLARE_ZONE_ID }}") &&
    publicLaunchAttestation.includes("minimumClosedObservationMs") &&
    publicLaunchAttestation.includes("maximumApprovalLifetimeMs") &&
    publicLaunchAttestation.includes("publicEdgeWorkflowPath") &&
    publicLaunchAttestation.includes('ruleset.phase !== "http_ratelimit"'),
  "registration requires short-lived same-version launch evidence and re-reads transition, WAF, edge, and backup state"
);
const rollbackScript = readFileSync(
  resolve(repositoryRoot, "scripts/release/rollback.mjs"),
  "utf8"
);
const rollbackCompatibilityScript = readFileSync(
  resolve(repositoryRoot, "scripts/release/verify-rollback-schema-compatibility.mjs"),
  "utf8"
);
const rollbackCompatibilityContract = readFileSync(
  resolve(repositoryRoot, "scripts/release/rollback-schema-contract.test.ts"),
  "utf8"
);
const stagingBootstrapWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/staging-bootstrap.yml"),
  "utf8"
);
const stagingBootstrapScript = readFileSync(
  resolve(repositoryRoot, "scripts/release/bootstrap-staging.mjs"),
  "utf8"
);
const productionTransitionWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/production-legacy-transition.yml"),
  "utf8"
);
const productionFreezeWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/production-legacy-freeze.yml"),
  "utf8"
);
const productionTransitionScript = readFileSync(
  resolve(repositoryRoot, "scripts/release/production-legacy-transition.mjs"),
  "utf8"
);
const backupEncryptionScript = readFileSync(
  resolve(repositoryRoot, "scripts/backup/encrypt-d1.mjs"),
  "utf8"
);
const privateBackupStoreScript = readFileSync(
  resolve(repositoryRoot, "scripts/backup/private-store.mjs"),
  "utf8"
);
const baselineIndex = releaseWorkflow.indexOf("Capture closed rollback baseline before mutation");
const rollbackCompatibilityIndex = releaseWorkflow.indexOf(
  "Verify captured N-1 code against forward migrations"
);
const migrationIndex = releaseWorkflow.indexOf("Apply remote migrations");
requireCheck(
  baselineIndex >= 0 &&
    rollbackCompatibilityIndex > baselineIndex &&
    migrationIndex > baselineIndex &&
    migrationIndex > rollbackCompatibilityIndex &&
    releaseWorkflow.includes("steps.rollback_baseline.outcome == 'success'") &&
    releaseWorkflow.includes("--baseline \"$ROLLBACK_BASELINE_FILE\"") &&
    releaseWorkflow.includes("fetch-depth: 0") &&
    rollbackCompatibilityScript.includes("gitShow(releaseSha, contractPath)") &&
    rollbackCompatibilityScript.includes("ROLLBACK_FORWARD_MIGRATIONS_DIR") &&
    rollbackCompatibilityContract.includes(
      "executes the captured Worker repository contract against the forward-migrated schema"
    ),
  "release executes the exact captured N-1 repository contract before forward migration and handles every later failure"
);
requireCheck(
  releaseWorkflow.includes("group: distilled-news-cloudflare-mutation") &&
    registrationWorkflow.includes("group: distilled-news-cloudflare-mutation") &&
    stagingBootstrapWorkflow.includes("group: distilled-news-cloudflare-mutation") &&
    productionTransitionWorkflow.includes("group: distilled-news-cloudflare-mutation") &&
    productionFreezeWorkflow.includes("group: distilled-news-cloudflare-mutation"),
  "all release, registration, and bootstrap workflows share the exact mutation serialization group"
);
requireCheck(
  [releaseWorkflow, productionTransitionWorkflow].every((workflow) =>
    workflow.includes("BACKUP_ENCRYPTION_KEY: ${{ secrets.BACKUP_ENCRYPTION_KEY }}") &&
    workflow.includes("scripts/backup/encrypt-d1.mjs") &&
    workflow.includes("scripts/backup/private-store.mjs put") &&
    workflow.includes(
      "distilled-news:production:backup-store:distilled-news-production-backups"
    ) &&
    workflow.includes("path: backups/release-artifact/*.json") &&
    !workflow.includes("BACKUP_ENCRYPTION_PASSPHRASE") &&
    !workflow.includes("openssl enc") &&
    !workflow.includes("path: backups/release-artifact/\n")
  ) &&
    releaseWorkflow.indexOf("Store encrypted pre-migration backup in private R2") <
      releaseWorkflow.indexOf("Apply remote migrations") &&
    productionTransitionWorkflow.indexOf("Store encrypted legacy pre-migration backup in private R2") <
      productionTransitionWorkflow.indexOf("Apply backward-compatible production migrations") &&
    backupEncryptionScript.includes('createCipheriv("aes-256-gcm"') &&
    backupEncryptionScript.includes("43-character base64url") &&
    privateBackupStoreScript.includes(
      'productionBackupBucket = "distilled-news-production-backups"'
    ) &&
    privateBackupStoreScript.includes("/domains/managed") &&
    privateBackupStoreScript.includes("/domains/custom") &&
    privateBackupStoreScript.includes("/lifecycle"),
  "production backups use authenticated encryption and a verified private R2 store, never public-repository artifacts"
);
requireCheck(
  [
    releaseWorkflow,
    registrationWorkflow,
    stagingBootstrapWorkflow,
    productionTransitionWorkflow,
    productionFreezeWorkflow,
    publicEdgeWorkflow,
    readFileSync(resolve(repositoryRoot, ".github/workflows/canary-heartbeat.yml"), "utf8")
  ].every((workflow) =>
    workflow.includes("scripts/release/verify-github-protection.mjs") &&
    workflow.includes("actions: read") &&
    workflow.includes("deployments: read")
  ),
  "every Cloudflare mutation or evidence workflow can inspect and fails before credentials unless main and its environment are protected"
);
const githubProtectionVerifier = readFileSync(
  resolve(repositoryRoot, "scripts/release/verify-github-protection.mjs"),
  "utf8"
);
const canaryIdentityVerifier = readFileSync(
  resolve(repositoryRoot, "scripts/release/verify-canary-workflow-identity.mjs"),
  "utf8"
);
requireCheck(
  githubProtectionVerifier.includes("requiredStatusContexts") &&
    githubProtectionVerifier.includes("required_approving_review_count") &&
    githubProtectionVerifier.includes("dismiss_stale_reviews") &&
    githubProtectionVerifier.includes("require_code_owner_reviews") &&
    githubProtectionVerifier.includes("require_last_push_approval") &&
    githubProtectionVerifier.includes("bypass_pull_request_allowances") &&
    githubProtectionVerifier.includes("enforce_admins") &&
    githubProtectionVerifier.includes("required_conversation_resolution") &&
    githubProtectionVerifier.includes("allow_force_pushes") &&
    githubProtectionVerifier.includes("allow_deletions") &&
    githubProtectionVerifier.includes("prevent_self_review") &&
    githubProtectionVerifier.includes("can_admins_bypass"),
  "deployment preflight verifies the full reviewed-PR, no-bypass branch and environment policy"
);
requireCheck(
  canaryHeartbeatWorkflowTrustOrder() &&
    canaryIdentityVerifier.includes("releaseSha !== githubSha") &&
    canaryIdentityVerifier.includes("releaseSha !== workflowSha") &&
    canaryIdentityVerifier.includes("releaseSha !== checkoutSha") &&
    canaryIdentityVerifier.includes('ref !== "refs/heads/main"') &&
    githubProtectionVerifier.includes('environmentName === "staging-canary"'),
  "automated canary executes only the frozen protected-main tree before receiving reviewer-free staging telemetry access"
);
requireCheck(
  stagingBootstrapWorkflow.includes("inputs.confirmation == 'bootstrap staging once'") &&
    stagingBootstrapScript.includes('const environment = "staging"') &&
    stagingBootstrapScript.includes("workerDoesNotExist") &&
    stagingBootstrapScript.includes("stagingBootstrapCompletedMarker") &&
    !stagingBootstrapScript.includes('environment = "production"'),
  "one-time staging bootstrap is hard-pinned to an absent isolated staging Worker"
);
requireCheck(
  productionTransitionWorkflow.includes(
    "transition production from 74a97cf8-1361-41c8-bc7d-6d0b87b55151"
  ) &&
    productionTransitionWorkflow.indexOf("Verify exact frozen legacy production state") <
      productionTransitionWorkflow.indexOf("Export frozen legacy production D1") &&
    productionTransitionWorkflow.indexOf("Export frozen legacy production D1") <
      productionTransitionWorkflow.indexOf("Apply backward-compatible production migrations") &&
    productionTransitionWorkflow.indexOf("Run bounded authenticated retention cleanup") <
      productionTransitionWorkflow.indexOf("Finalize the one-time legacy transition") &&
    productionTransitionWorkflow.indexOf("Verify D1 and R2 retention controls") <
      productionTransitionWorkflow.indexOf("Finalize the one-time legacy transition") &&
    productionTransitionWorkflow.includes(
      "always() && steps.transition_finalize.outcome == 'success'"
    ) &&
    productionTransitionWorkflow.includes("Restore the exact frozen legacy version after transition failure") &&
    productionTransitionScript.includes("legacy_registration_freeze_20260729") === false &&
    productionTransitionScript.includes("legacyRegistrationFreezeTrigger") &&
    productionTransitionScript.includes('mode === "freeze"') &&
    productionTransitionScript.includes("hardenedFinalizePlan") &&
    productionTransitionScript.includes("DROP TRIGGER") &&
    productionTransitionScript.includes("One-time hardening transition rollback"),
  "one-time production transition pins the frozen legacy version, backup order, and explicit legacy rollback"
);
requireCheck(
  productionTransitionWorkflow.includes("PRODUCTION_PAID_COHORT_MANIFEST") &&
    productionTransitionWorkflow.includes("paid_cohort_review_digest") &&
    productionTransitionWorkflow.indexOf("Capture reviewed pre-migration paid-cohort inventory") <
      productionTransitionWorkflow.indexOf("Export frozen legacy production D1") &&
    productionTransitionWorkflow.indexOf("Export frozen legacy production D1") <
      productionTransitionWorkflow.indexOf("Reconcile paid-provider rows without deleting payload references") &&
    productionTransitionWorkflow.indexOf("Reconcile paid-provider rows without deleting payload references") <
      productionTransitionWorkflow.indexOf("Apply backward-compatible production migrations") &&
    productionTransitionWorkflow.indexOf("Apply backward-compatible production migrations") <
      productionTransitionWorkflow.indexOf("Enforce the post-migration four-seat invariant") &&
    productionTransitionWorkflow.indexOf("Enforce the post-migration four-seat invariant") <
      productionTransitionWorkflow.indexOf("Deploy the hardened closed production baseline") &&
    productionTransitionWorkflow.indexOf("Delete reviewed legacy canaries through payload-safe hardened cleanup") <
      productionTransitionWorkflow.indexOf("Finalize the one-time legacy transition") &&
    productionTransitionScript.includes("readProtectedPaidCohortManifest") &&
    productionTransitionScript.includes('state !== "cleaned"') &&
    productionTransitionScript.includes("legacyPaidFeedFreezeTrigger"),
  "legacy transition uses a protected cohort manifest, reconciles before 0026, verifies seats, and cleans payloads before finalization"
);
requireCheck(
  productionFreezeWorkflow.includes(
    "freeze production at 74a97cf8-1361-41c8-bc7d-6d0b87b55151"
  ) &&
    productionFreezeWorkflow.includes("production-legacy-transition.mjs freeze") &&
    productionFreezeWorkflow.includes("Retain freeze evidence") &&
    productionTransitionScript.includes("legacyPaidFeedFreezeInstalled"),
  "protected idempotent freeze reproduces both registration and paid-feed rollback locks"
);
requireCheck(
  [releaseWorkflow, stagingBootstrapWorkflow, productionTransitionWorkflow].every((workflow) =>
    workflow.includes("scripts/release/check-apify.mjs") &&
    workflow.includes("APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}")
  ) &&
    releaseWorkflow.includes("APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}") &&
    registrationWorkflow.includes("APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}"),
  "every code-deploy workflow and registration gate receives live protected Apify readiness"
);
requireCheck(
  registrationControl.indexOf('if (mode === "close")') <
    registrationControl.indexOf("RELEASE_SHA must be the full reviewed production commit SHA") &&
    registrationControl.includes("planEmergencyRegistrationClose") &&
    registrationControl.includes("closeD1RegistrationSwitch") &&
    registrationControl.includes("control-plane close") &&
    registrationControl.includes("emergencyHttpClosure"),
  "emergency registration close discovers live metadata and is independent of main SHA and runtime endpoint"
);
requireCheck(
  rollbackScript.includes("registration_enabled") &&
    rollbackScript.indexOf("disableD1Registration();") <
      rollbackScript.indexOf('"rollback", baseline.versionId') &&
    rollbackScript.includes("d1RegistrationEnabled: false") &&
    rollbackScript.includes("D1 migrations and bound resources remain forward-only"),
  "automatic code rollback closes the D1 registration switch first and leaves resources forward-only"
);

const publicLaunchMigration = readFileSync(
  resolve(repositoryRoot, "apps/worker/migrations/0025_public_launch_controls.sql"),
  "utf8"
);
const acceptableUseAcceptanceMigration = readFileSync(
  resolve(repositoryRoot, "apps/worker/migrations/0029_acceptable_use_acceptance.sql"),
  "utf8"
);
const hostedLegalVersions = JSON.parse(readFileSync(
  resolve(repositoryRoot, "packages/core/src/legal-versions.json"),
  "utf8"
));
const webLegalSource = readFileSync(resolve(repositoryRoot, "apps/web/src/legal.ts"), "utf8");
requireCheck(
  ["terms_accepted_at", "terms_version", "privacy_version"].every((column) =>
    publicLaunchMigration.includes(`accounts ADD COLUMN ${column}`)
  ) &&
    acceptableUseAcceptanceMigration.includes(
      "accounts ADD COLUMN acceptable_use_version"
    ) &&
    ["terms", "privacy", "acceptableUse"].every((key) =>
      /^\d{4}-\d{2}-\d{2}$/.test(hostedLegalVersions[key] ?? "")
    ) &&
    appSource.includes("HOSTED_LEGAL_VERSIONS") &&
    appSource.includes('app.post("/api/me/legal-acceptance"') &&
    appSource.includes("hostedLegalMutationGate()") &&
    appSource.includes("acceptableUseVersion") &&
    appSource.includes("const legalAcceptance = hostedLegalAcceptanceState(voter, c.env)") &&
    ["PRIVACY.md?raw", "TERMS.md?raw", "ACCEPTABLE-USE.md?raw"].every((policy) =>
      webLegalSource.includes(policy)
    ),
  "hosted legal re-consent is independently versioned, mutation-gated, migration-backed, and rendered from canonical policy Markdown"
);
const retiredUsernameMigration = readFileSync(
  resolve(repositoryRoot, "apps/worker/migrations/0030_retired_username_hashes.sql"),
  "utf8"
);
const usernameRetirementNotices = [
  "docs/legal/PRIVACY.md",
  "docs/DATA-RETENTION.md"
].map((path) =>
  readFileSync(resolve(repositoryRoot, path), "utf8").replace(/\s+/g, " ").toLowerCase()
);
requireCheck(
  retiredUsernameMigration.includes(
    "CREATE TABLE IF NOT EXISTS retired_username_hashes"
  ) &&
    retiredUsernameMigration.includes("username_hash TEXT PRIMARY KEY") &&
    retiredUsernameMigration.includes("retired_at TEXT NOT NULL") &&
    repositorySource.includes("usernameRetirementHash") &&
    repositorySource.includes("retired_username_hashes") &&
    repositorySource.includes("isUsernameRetired") &&
    appSource.includes("assertUsernameAvailable") &&
    appSource.includes("isUsernameRetired") &&
    usernameRetirementNotices.every((notice) =>
      [
        "current and historical public username",
        "sha-256",
        "no account identifier or email linkage remains",
        "solely",
        "pseudonymous, not anonymous",
        "verified or public",
        "never-verified"
      ].every((marker) => notice.includes(marker))
    ),
  "retired username hashes permanently block historical public URL takeover"
);
const paidProviderSeatMigration = readFileSync(
  resolve(repositoryRoot, "apps/worker/migrations/0026_paid_provider_beta_seats.sql"),
  "utf8"
);
const sourceRuntime = readFileSync(resolve(repositoryRoot, "apps/worker/src/sources.ts"), "utf8");
const canarySeed = readFileSync(resolve(repositoryRoot, "scripts/canary/seed.mjs"), "utf8");
requireCheck(
  paidProviderSeatMigration.includes("CREATE TABLE IF NOT EXISTS paid_provider_seats") &&
    paidProviderSeatMigration.includes("hosted_paid_provider_account_cap") &&
    paidProviderSeatMigration.includes("paid provider beta capacity reached") &&
    paidProviderSeatMigration.includes("paid_provider_seat_release_after_source_delete") &&
    appSource.includes("HOSTED_MAX_PAID_PROVIDER_ACCOUNTS = 4") &&
    appSource.includes("paidProviderBeta") &&
    appSource.includes("maxPaidProviderAccounts: HOSTED_MAX_PAID_PROVIDER_ACCOUNTS") &&
    sourceRuntime.includes("HOSTED_COLLECTION_MONTHLY_BUDGET_USD = 5") &&
    sourceCosts.includes("four distinct account") &&
    sourceCosts.includes("`$0.25/day` and `$5/month`") &&
    canarySeed.includes("canary_paid_provider_seats) !== 2"),
  "hosted paid-provider beta has an atomic four-account seat cap, explicit status, and a $5 account collection cap"
);

const canaryAudit = readFileSync(resolve(repositoryRoot, "scripts/canary/audit.mjs"), "utf8");
const canaryAttest = readFileSync(resolve(repositoryRoot, "scripts/canary/attest.mjs"), "utf8");
const canaryVerify = readFileSync(
  resolve(repositoryRoot, "scripts/canary/verify-attestation.mjs"),
  "utf8"
);
const canaryHeartbeatWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/canary-heartbeat.yml"),
  "utf8"
);
const canaryStateBundle = readFileSync(
  resolve(repositoryRoot, "scripts/canary/state-bundle.mjs"),
  "utf8"
);
const canaryRunSelector = readFileSync(
  resolve(repositoryRoot, "scripts/canary/select-evidence-run.mjs"),
  "utf8"
);
const canaryCrypto = readFileSync(
  resolve(repositoryRoot, "scripts/canary/attestation-crypto.mjs"),
  "utf8"
);
requireCheck(
  canaryAudit.includes("MINIMUM_24H_OBSERVATIONS = 49") &&
    canaryAudit.includes("MAX_OBSERVATION_GAP_MINUTES = 45") &&
    canaryAttest.includes("observationCount ?? 0) < 49") &&
    canaryAttest.includes("maxGapMinutes ?? Number.POSITIVE_INFINITY) > 45") &&
    canaryVerify.includes("payload.observationCount) < 49") &&
    canaryVerify.includes("payload.maxGapMinutes) > 45"),
  "canary audit, attestation, and verifier share the 49-observation/45-minute policy"
);
requireCheck(
  canaryHeartbeatWorkflow.includes("actions/workflows/canary-heartbeat.yml/runs") &&
    canaryHeartbeatWorkflow.includes("-f status=completed") &&
    canaryHeartbeatWorkflow.includes("expected_digest") &&
    canaryHeartbeatWorkflow.includes("sha256sum") &&
    canaryHeartbeatWorkflow.includes('test "${archive_members[0]}" = "canary-state.json"') &&
    canaryHeartbeatWorkflow.includes("state-bundle.mjs restore") &&
    canaryHeartbeatWorkflow.includes("state-bundle.mjs pack") &&
    !canaryHeartbeatWorkflow.includes("tar -x") &&
    !canaryHeartbeatWorkflow.includes("unzip -q"),
  "heartbeat restores only digest-verified, signed data from its prior exact-workflow run"
);
requireCheck(
  canaryHeartbeatWorkflow.includes(
    "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_CANARY_READ_TOKEN }}"
  ) &&
    !canaryHeartbeatWorkflow.includes(
      "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"
    ) &&
    !canaryHeartbeatWorkflow.includes("APIFY_API_TOKEN") &&
    !canaryHeartbeatWorkflow.includes("OPENAI_API_KEY"),
  "automated canary receives a distinct read-only Cloudflare credential and no deploy or provider API secrets"
);
requireCheck(
  canaryStateBundle.includes("timingSafeEqual") &&
    canaryStateBundle.includes("ALLOWED_FILE") &&
    canaryStateBundle.includes("refusing to overwrite") &&
    canaryRunSelector.includes('run.status === "completed"') &&
    !canaryRunSelector.includes("run.conclusion"),
  "canary state is HMAC authenticated and critical failed heartbeats remain evidence"
);
requireCheck(
  canaryAttest.includes("CANARY_ATTESTATION_PRIVATE_KEY") &&
    canaryAttest.includes('algorithm: "Ed25519"') &&
    canaryVerify.includes("CANARY_ATTESTATION_PUBLIC_KEY") &&
    canaryVerify.includes('envelope.algorithm !== "Ed25519"') &&
    canaryCrypto.includes('asymmetricKeyType !== "ed25519"') &&
    canaryHeartbeatWorkflow.includes("CANARY_STATE_HMAC_KEY") &&
    canaryHeartbeatWorkflow.includes("CANARY_ATTESTATION_PRIVATE_KEY") &&
    releaseWorkflow.includes("CANARY_ATTESTATION_PUBLIC_KEY") &&
    !canaryHeartbeatWorkflow.includes("CANARY_ATTESTATION_PUBLIC_KEY") &&
    !releaseWorkflow.includes("CANARY_ATTESTATION_PRIVATE_KEY"),
  "production verifies an asymmetric canary signature without receiving staging signing secrets"
);
requireCheck(
  [releaseWorkflow, registrationWorkflow, productionTransitionWorkflow].every((workflow) =>
    workflow.includes("CANARY_ATTESTATION_PUBLIC_KEY") &&
    !workflow.includes("CANARY_EVIDENCE_HMAC_KEY") &&
    !workflow.includes("CANARY_ATTESTATION_PRIVATE_KEY")
  ),
  "every production mutation workflow verifies canary evidence with only the public key"
);

function canaryHeartbeatWorkflowTrustOrder() {
  const workflow = readFileSync(
    resolve(repositoryRoot, ".github/workflows/canary-heartbeat.yml"),
    "utf8"
  );
  const checkoutIndex = workflow.indexOf("actions/checkout@");
  const identityIndex = workflow.indexOf("scripts/release/verify-canary-workflow-identity.mjs");
  const dependencySetupIndex = workflow.indexOf("pnpm/action-setup@");
  return (
    checkoutIndex >= 0 &&
    identityIndex > checkoutIndex &&
    dependencySetupIndex > identityIndex &&
    !workflow.slice(checkoutIndex, identityIndex).includes("ref:") &&
    workflow.includes("github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main'") &&
    workflow.includes("GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}")
  );
}

requireCheck(
  production.vars?.GLOBAL_COLLECTION_DAILY_BUDGET_USD === "5" &&
    production.vars?.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD === "25" &&
    production.vars?.APIFY_EXPECTED_USER_ID === "RXAjmHtQRbA38IAbw" &&
    production.vars?.APIFY_EXPECTED_PLAN_TIER === "BRONZE" &&
    production.vars?.APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD === "29" &&
    production.vars?.APIFY_X_PRICE_USD_PER_1000_RESULTS === "0.15" &&
    production.vars?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS === "1.20" &&
    production.vars?.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD === "0.10" &&
    production.vars?.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD === "2" &&
    production.vars?.GLOBAL_LLM_DAILY_BUDGET_USD === "5" &&
    production.vars?.GLOBAL_LLM_MONTHLY_BUDGET_USD === "150" &&
    production.vars?.TOTAL_MONTHLY_BUDGET_USD === "175" &&
    sourceCosts.includes("`$5/day` and `$25/month` for collection") &&
    sourceCosts.includes("`$175/month` total"),
  "production cost documentation matches conservative reviewed Wrangler caps"
);
requireCheck(
  staging.vars?.GLOBAL_COLLECTION_DAILY_BUDGET_USD === "0.50" &&
    staging.vars?.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD === "4" &&
    staging.vars?.APIFY_EXPECTED_USER_ID === "5clcKRgkjN3Q9GnDB" &&
    staging.vars?.APIFY_EXPECTED_PLAN_TIER === "FREE" &&
    staging.vars?.APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD === "5" &&
    staging.vars?.APIFY_X_PRICE_USD_PER_1000_RESULTS === "15.00" &&
    staging.vars?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS === "1.50" &&
    staging.vars?.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD === "0.75" &&
    staging.vars?.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD === "3.00" &&
    staging.vars?.GLOBAL_LLM_DAILY_BUDGET_USD === "38" &&
    staging.vars?.GLOBAL_LLM_MONTHLY_BUDGET_USD === "150" &&
    staging.vars?.TOTAL_MONTHLY_BUDGET_USD === "154" &&
    sourceCosts.includes("`$0.50/day` and `$4/month` for collection") &&
    sourceCosts.includes("`$38/day` and `$150/month` for model use") &&
    sourceCosts.includes("`$154/month` total") &&
    sourceCosts.includes("`$29.810200/day`"),
  "staging canary cost documentation matches the isolated Free Apify account and reviewed Wrangler caps"
);
requireCheck(
  sourceCosts.includes("before 250,000 rows") &&
    sourceCosts.includes("UTC day exceeds 10,000 new rows") &&
    sourceCosts.includes("1,000,000 rows is") &&
    sourceCosts.includes("idempotency tombstones"),
  "spend-ledger growth thresholds and aggregation roadmap are documented"
);

console.log("Static launch readiness");
for (const warning of warnings) console.log(`- [WARN] ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- [FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("- [PASS] required static configuration and governance checks passed");
}

function requireCheck(ok, label) {
  if (!ok) failures.push(label);
}
