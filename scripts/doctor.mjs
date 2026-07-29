#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertIsolatedStaging,
  combinedEnvironment,
  d1Binding,
  environmentConfig,
  parseSecretsFile,
  readWorkerConfig,
  repositoryRoot,
  runWrangler,
  unsetDatabaseId,
  usableValue,
  workerConfigPath
} from "./lib/release-config.mjs";

const environment = optionValue("--environment") ?? "staging";
const remote = process.argv.includes("--remote");
const ci = process.argv.includes("--ci");
const deployment = process.argv.includes("--deployment");
const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
const values = combinedEnvironment(environment);
const required = [];
const optional = [];
const reviewedOpenAiProjects = {
  production: "proj_dH3LjVEWjtfgGzWAzI4BFpgJ",
  staging: "proj_h2LV7AMPwS7sMD6U76qmMNAh"
};
const reviewedAiGateways = {
  production: "default",
  staging: "distilled-news-staging"
};

checkRequired("Node.js major version is 24", process.versions.node.split(".")[0] === "24", `found ${process.version}`);
const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
checkRequired("pnpm is pinned to 10.12.1", pnpm.status === 0 && pnpm.stdout.trim() === "10.12.1", pnpm.stdout.trim() || "unavailable");
checkRequired("frozen lockfile exists", existsSync(resolve(repositoryRoot, "pnpm-lock.yaml")));
checkRequired("Wrangler JSONC source exists", existsSync(workerConfigPath));
checkRequired("compatibility date is deliberate and current", config.compatibility_date === "2026-07-29", config.compatibility_date);
checkRequired("nodejs_compat is enabled", config.compatibility_flags?.includes("nodejs_compat"));
checkRequired("production workers.dev is disabled", config.env.production.workers_dev === false);
checkRequired("production preview URLs are disabled", config.env.production.preview_urls === false);
checkRequired("staging workers.dev is disabled", config.env.staging.workers_dev === false);
checkRequired("staging preview URLs are disabled", config.env.staging.preview_urls === false);
checkRequired(
  "environment marker matches selection",
  selected.vars?.ENVIRONMENT === environment ||
    (environment === "production" && selected.vars?.ENVIRONMENT === "self-hosted"),
  selected.vars?.ENVIRONMENT
);
if (selected.vars?.ENVIRONMENT !== "self-hosted") {
  checkRequired(
    "OpenAI project is pinned to the reviewed hosted environment",
    selected.vars?.OPENAI_PROJECT_ID === reviewedOpenAiProjects[environment],
    selected.vars?.OPENAI_PROJECT_ID
  );
  checkRequired(
    "AI Gateway is pinned to the reviewed hosted environment",
    selected.vars?.CLOUDFLARE_AI_GATEWAY_ID === reviewedAiGateways[environment],
    selected.vars?.CLOUDFLARE_AI_GATEWAY_ID
  );
  const sibling = environmentConfig(config, environment === "production" ? "staging" : "production");
  checkRequired(
    "OpenAI project and AI Gateway are isolated from the other hosted environment",
    selected.vars?.OPENAI_PROJECT_ID !== sibling.vars?.OPENAI_PROJECT_ID &&
      selected.vars?.CLOUDFLARE_AI_GATEWAY_ID !== sibling.vars?.CLOUDFLARE_AI_GATEWAY_ID
  );
}
checkRequired("release metadata variable is declared", typeof selected.vars?.RELEASE_SHA === "string");
checkRequired("registration mode is explicit", ["open", "closed"].includes(selected.vars?.REGISTRATION_MODE), selected.vars?.REGISTRATION_MODE);
checkRequired(
  "hosted account cap is a positive integer",
  positiveInteger(selected.vars?.HOSTED_ACCOUNT_CAP),
  selected.vars?.HOSTED_ACCOUNT_CAP
);
checkRequired(
  "pending hosted account cap is bounded",
  positiveInteger(selected.vars?.HOSTED_PENDING_ACCOUNT_CAP) &&
    Number(selected.vars.HOSTED_PENDING_ACCOUNT_CAP) <= Number(selected.vars.HOSTED_ACCOUNT_CAP),
  selected.vars?.HOSTED_PENDING_ACCOUNT_CAP
);
const sourceQueueName = selected.queues?.producers?.find((producer) => producer.binding === "SOURCE_QUEUE")?.queue;
const sourceConsumer = selected.queues?.consumers?.find((queue) => queue.queue === sourceQueueName);
checkRequired(
  "source queue concurrency has launch headroom",
  Number(sourceConsumer?.max_concurrency) >= 15,
  sourceConsumer?.max_concurrency
);
checkRequired("Turnstile expected action is register", selected.vars?.TURNSTILE_EXPECTED_ACTION === "register");
checkRequired("Turnstile host allowlist is explicit", usableValue(selected.vars?.TURNSTILE_EXPECTED_HOSTNAMES));

for (const key of [
  "PROVIDER_RSS_ENABLED",
  "PROVIDER_TELEGRAM_ENABLED",
  "PROVIDER_GOOGLE_NEWS_ENABLED",
  "PROVIDER_X_ENABLED",
  "PROVIDER_LINKEDIN_ENABLED",
  "PROVIDER_GENERIC_APIFY_ENABLED",
  "PROVIDER_BRAVE_ENABLED"
]) {
  checkRequired(`${key} is an explicit boolean`, ["true", "false"].includes(selected.vars?.[key]), selected.vars?.[key]);
}

for (const [key, expected] of Object.entries({
  APIFY_X_ACTOR_BUILD: "1.1.3",
  APIFY_GOOGLE_NEWS_ACTOR_BUILD: "1.1.1",
  APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD: "1.0.10"
})) {
  const actual = selected.vars?.[key];
  checkRequired(`${key} is pinned`, actual === expected && !/latest|master|main/i.test(actual), actual);
}
const reviewedApifyAccount = environment === "production"
  ? {
      userId: "RXAjmHtQRbA38IAbw",
      tier: "BRONZE",
      maxMonthlyUsageUsd: 29,
      xPriceUsdPer1000: 0.15,
      fallbackPriceUsdPer1000: 1.2
    }
  : {
      userId: "5clcKRgkjN3Q9GnDB",
      tier: "FREE",
      maxMonthlyUsageUsd: 5,
      xPriceUsdPer1000: 15,
      fallbackPriceUsdPer1000: 1.5
    };
checkRequired(
  "Apify /users/me identity is pinned to the reviewed environment account",
  selected.vars?.APIFY_EXPECTED_USER_ID === reviewedApifyAccount.userId
);
checkRequired(
  "Apify plan tier and account limit are pinned",
  selected.vars?.APIFY_EXPECTED_PLAN_TIER === reviewedApifyAccount.tier &&
    Number(selected.vars?.APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD) === reviewedApifyAccount.maxMonthlyUsageUsd
);
checkRequired(
  "Apify environment-specific prices are pinned",
  Number(selected.vars?.APIFY_X_PRICE_USD_PER_1000_RESULTS) === reviewedApifyAccount.xPriceUsdPer1000 &&
    Number(selected.vars?.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS) === 0.5 &&
    Number(selected.vars?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS) ===
      reviewedApifyAccount.fallbackPriceUsdPer1000
);
checkRequired(
  "OpenAI reservation prices are pinned",
  Number(selected.vars?.OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS) === 0.4 &&
    Number(selected.vars?.OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS) === 1.6
);

for (const key of [
  "OPENAI_SUMMARY_MAX_INPUT_TOKENS",
  "OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS",
  "OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS",
  "OPENAI_EDITION_MAX_INPUT_TOKENS",
  "OPENAI_SUMMARY_MAX_OUTPUT_TOKENS",
  "OPENAI_REVIEW_MAX_OUTPUT_TOKENS",
  "OPENAI_EDITION_MAX_OUTPUT_TOKENS"
]) {
  checkRequired(`${key} is a positive integer`, positiveTokenLimit(selected.vars?.[key]), selected.vars?.[key]);
}

for (const key of [
  "HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD",
  "HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD",
  "GLOBAL_COLLECTION_DAILY_BUDGET_USD",
  "GLOBAL_COLLECTION_MONTHLY_BUDGET_USD",
  "GLOBAL_LLM_DAILY_BUDGET_USD",
  "GLOBAL_LLM_MONTHLY_BUDGET_USD",
  "TOTAL_MONTHLY_BUDGET_USD"
]) {
  checkRequired(`${key} is a finite nonnegative cap`, nonnegativeNumber(selected.vars?.[key]), selected.vars?.[key]);
}
if (environment === "production") {
  checkRequired(
    "production collection ceilings match the reviewed provider account headroom",
    Number(selected.vars.GLOBAL_COLLECTION_DAILY_BUDGET_USD) === 5 &&
      Number(selected.vars.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD) === 25
  );
  checkRequired(
    "production model ceilings match the reviewed launch policy",
    Number(selected.vars.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD) === 0.1 &&
      Number(selected.vars.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD) === 2 &&
      Number(selected.vars.GLOBAL_LLM_DAILY_BUDGET_USD) === 5 &&
      Number(selected.vars.GLOBAL_LLM_MONTHLY_BUDGET_USD) === 150
  );
  checkRequired(
    "production model token bounds preserve the existing request limits",
    Number(selected.vars.OPENAI_SUMMARY_MAX_INPUT_TOKENS) === 1_000_000 &&
      Number(selected.vars.OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS) === 1_000_000 &&
      Number(selected.vars.OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS) === 1_000_000 &&
      Number(selected.vars.OPENAI_EDITION_MAX_INPUT_TOKENS) === 1_000_000 &&
      Number(selected.vars.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS) === 300 &&
      Number(selected.vars.OPENAI_REVIEW_MAX_OUTPUT_TOKENS) === 80 &&
      Number(selected.vars.OPENAI_EDITION_MAX_OUTPUT_TOKENS) === 1_600
  );
  checkRequired(
    "production total monthly ceiling exactly covers configured provider ceilings",
    Number(selected.vars.TOTAL_MONTHLY_BUDGET_USD) === 175 &&
      Number(selected.vars.TOTAL_MONTHLY_BUDGET_USD) ===
      Number(selected.vars.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD) +
      Number(selected.vars.GLOBAL_LLM_MONTHLY_BUDGET_USD)
  );
}
if (environment === "staging") {
  checkRequired(
    "staging collection ceiling stays below the isolated $5 Apify account limit",
    Number(selected.vars.GLOBAL_COLLECTION_DAILY_BUDGET_USD) === 0.5 &&
      Number(selected.vars.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD) === 4
  );
  checkRequired(
    "staging model ceilings cover the bounded 50-account canary",
    Number(selected.vars.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD) === 0.75 &&
      Number(selected.vars.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD) === 3 &&
      Number(selected.vars.GLOBAL_LLM_DAILY_BUDGET_USD) === 38 &&
      Number(selected.vars.GLOBAL_LLM_MONTHLY_BUDGET_USD) === 150
  );
  checkRequired(
    "staging model calls use the reviewed canary token bounds",
    Number(selected.vars.OPENAI_SUMMARY_MAX_INPUT_TOKENS) === 2_304 &&
      Number(selected.vars.OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS) === 2_048 &&
      Number(selected.vars.OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS) === 3_072 &&
      Number(selected.vars.OPENAI_EDITION_MAX_INPUT_TOKENS) === 19_500 &&
      Number(selected.vars.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS) === 160 &&
      Number(selected.vars.OPENAI_REVIEW_MAX_OUTPUT_TOKENS) === 80 &&
      Number(selected.vars.OPENAI_EDITION_MAX_OUTPUT_TOKENS) === 400
  );
  checkRequired(
    "staging total monthly ceiling exactly covers configured provider ceilings",
    Number(selected.vars.TOTAL_MONTHLY_BUDGET_USD) === 154 &&
      Number(selected.vars.TOTAL_MONTHLY_BUDGET_USD) ===
      Number(selected.vars.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD) +
      Number(selected.vars.GLOBAL_LLM_MONTHLY_BUDGET_USD)
  );
}

const database = d1Binding(selected);
checkRequired("selected D1 binding has an explicit ID", usableValue(database.database_id) && database.database_id !== unsetDatabaseId, database.database_name);
checkRequired("Email binding is declared", selected.send_email?.some((binding) => binding.name === "EMAIL"));
checkRequired("EMAIL_FROM is configured", usableValue(selected.vars?.EMAIL_FROM), selected.vars?.EMAIL_FROM);

if (environment === "staging") {
  try {
    assertIsolatedStaging(config);
    checkRequired("staging resources are isolated from production", true);
  } catch (error) {
    checkRequired("staging resources are isolated from production", false, error.message.split("\n").slice(1).join("; "));
  }
}

if (!ci) {
  for (const key of ["ADMIN_SESSION_SECRET", "ADMIN_SETUP_TOKEN", "INTERNAL_MAINTENANCE_SECRET"]) {
    checkRequired(`${key} is available`, usableValue(values.get(key)));
  }

  if (selected.vars?.REGISTRATION_MODE === "open") {
    checkRequired("TURNSTILE_SECRET_KEY is available for open registration", usableValue(values.get("TURNSTILE_SECRET_KEY")));
    checkRequired("EMAIL_FROM is configured for open registration", usableValue(selected.vars?.EMAIL_FROM));
  }

  checkOptional("OpenAI summaries", usableValue(values.get("OPENAI_API_KEY")));
  checkOptional("Cloudflare AI Gateway authentication", usableValue(values.get("CLOUDFLARE_AI_GATEWAY_TOKEN")));
  checkOptional("Apify-backed providers", usableValue(values.get("APIFY_API_TOKEN")));
  checkOptional(
    "Brave fallback with storage rights",
    usableValue(values.get("BRAVE_SEARCH_API_KEY")) &&
      selected.vars?.BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED === "true"
  );
}

if (deployment) {
  const configuredSecrets = deploymentSecretNames();
  const requiredSecrets = new Set([
    "ADMIN_SESSION_SECRET",
    "ADMIN_SETUP_TOKEN",
    "INTERNAL_MAINTENANCE_SECRET",
    "OPENAI_API_KEY"
  ]);
  if (["production", "staging"].includes(selected.vars?.ENVIRONMENT)) {
    requiredSecrets.add("TURNSTILE_SECRET_KEY");
    checkRequired("TURNSTILE_SITE_KEY is configured for hosted auth", usableValue(selected.vars?.TURNSTILE_SITE_KEY));
  }
  if (selected.vars?.ENVIRONMENT === "production") {
    requiredSecrets.add("EMAIL_CANARY_RECIPIENT");
  }
  if (["PROVIDER_GOOGLE_NEWS_ENABLED", "PROVIDER_X_ENABLED", "PROVIDER_LINKEDIN_ENABLED", "PROVIDER_GENERIC_APIFY_ENABLED"]
    .some((key) => selected.vars?.[key] === "true")) {
    requiredSecrets.add("APIFY_API_TOKEN");
  }
  if (selected.vars?.PROVIDER_BRAVE_ENABLED === "true") {
    requiredSecrets.add("BRAVE_SEARCH_API_KEY");
    checkRequired(
      "Brave storage rights are confirmed before deployment",
      selected.vars?.BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED === "true"
    );
  }
  for (const key of requiredSecrets) {
    checkRequired(`${key} is configured for deployment`, configuredSecrets.has(key));
  }
}

if (remote) {
  checkRemote("Cloudflare authentication", ["whoami"]);
  checkRemote("D1 database", ["d1", "info", database.database_name, "--env", environment]);
  const bucket = selected.r2_buckets?.find((candidate) => candidate.binding === "RAW_ARCHIVE")?.bucket_name;
  checkRemote("R2 raw archive", ["r2", "bucket", "info", bucket, "--env", environment]);
  for (const queue of selected.queues?.producers ?? []) {
    checkRemote(`Queue ${queue.queue}`, ["queues", "info", queue.queue, "--env", environment]);
  }
}

console.log(
  `Distilled.news doctor (${environment}${remote ? ", remote" : ""}` +
  `${deployment ? ", deployment" : ""}${ci ? ", CI" : ""})`
);
printGroup("Required", required);
if (optional.length > 0) printGroup("Optional", optional);

const failures = required.filter((item) => !item.ok);
if (failures.length > 0) {
  console.error(`\nReadiness failed: ${failures.length} required check(s) need attention.`);
  process.exitCode = 1;
} else {
  console.log("\nReadiness passed. Doctor made no changes.");
}

function checkRequired(label, ok, detail = "") {
  required.push({ label, ok: Boolean(ok), detail: detail ? String(detail) : "" });
}

function checkOptional(label, ok, detail = "") {
  optional.push({ label, ok: Boolean(ok), detail: detail ? String(detail) : "" });
}

function checkRemote(label, arguments_) {
  const result = runWrangler(arguments_, { capture: true, allowFailure: true });
  checkRequired(label, result.status === 0, result.status === 0 ? "" : "remote read failed");
}

function printGroup(label, checks) {
  console.log(`\n${label}:`);
  for (const check of checks) {
    const marker = check.ok ? "PASS" : label === "Optional" ? "SKIP" : "FAIL";
    console.log(`- [${marker}] ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
  }
}

function nonnegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000;
}

function positiveTokenLimit(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1_000_000;
}

function optionValue(name) {
  const direct = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function deploymentSecretNames() {
  const names = new Set();
  const secretsFile = process.env.WRANGLER_SECRETS_FILE;
  if (secretsFile) {
    const resolved = resolve(repositoryRoot, secretsFile);
    checkRequired("deployment secrets file exists", existsSync(resolved), resolved);
    for (const [key, value] of parseSecretsFile(resolved)) {
      if (usableValue(value)) names.add(key);
    }
  }

  const versions = runWrangler(["versions", "list", "--env", environment, "--json"], {
    capture: true,
    allowFailure: true
  });
  if (versions.status !== 0) return names;
  const payload = JSON.parse(versions.stdout);
  const latest = Array.isArray(payload) ? payload.at(-1) : null;
  if (!latest?.id) return names;
  const view = runWrangler(["versions", "view", latest.id, "--env", environment, "--json"], {
    capture: true,
    allowFailure: true
  });
  if (view.status !== 0) return names;
  const details = JSON.parse(view.stdout);
  for (const binding of details.resources?.bindings ?? []) {
    if (binding.type === "secret_text" && typeof binding.name === "string") names.add(binding.name);
  }
  return names;
}
