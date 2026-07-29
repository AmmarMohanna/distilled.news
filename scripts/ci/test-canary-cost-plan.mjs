#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CANARY_COLLECTION_PLAN,
  CANARY_GOOGLE_NEWS_PLAN,
  CANARY_LLM_PLAN,
  CANARY_X_PLAN,
  assertCanaryCollectionCostPlan,
  assertCanaryLlmCostPlan,
  canaryGoogleNewsMaximumDailyReservationUsd,
  canaryXMaximumDailyReservationUsd
} from "../canary/cost-plan.mjs";
import {
  environmentConfig,
  readWorkerConfig,
  repositoryRoot
} from "../lib/release-config.mjs";

const config = readWorkerConfig();
const production = environmentConfig(config, "production");
const staging = environmentConfig(config, "staging");
const collection = assertCanaryCollectionCostPlan({
  xPricePerThousandUsd: staging.vars?.APIFY_X_PRICE_USD_PER_1000_RESULTS,
  googleNewsPricePerThousandUsd:
    staging.vars?.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS,
  googleNewsFallbackPricePerThousandUsd:
    staging.vars?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS
});
const llm = assertCanaryLlmCostPlan(staging.vars);

assert.equal(CANARY_X_PLAN.feedIndex, 2);
assert.equal(CANARY_GOOGLE_NEWS_PLAN.feedIndex, 4);
assert.equal(CANARY_X_PLAN.maxItems, 1);
assert.equal(CANARY_GOOGLE_NEWS_PLAN.maxItems, 1);
assert.equal(CANARY_X_PLAN.refreshHours, 6);
assert.equal(CANARY_GOOGLE_NEWS_PLAN.refreshHours, 6);
assert.equal(collection.xMaximumDailyUsd, 0.08);
assert.equal(collection.googleNewsMaximumDailyUsd, 0.16);
assert.equal(collection.maximumDailyUsd, 0.24);
assert.equal(
  canaryXMaximumDailyReservationUsd(
    staging.vars?.APIFY_X_PRICE_USD_PER_1000_RESULTS
  ),
  0.08
);
assert.equal(
  canaryGoogleNewsMaximumDailyReservationUsd(
    staging.vars?.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS,
    staging.vars?.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS
  ),
  0.16
);
assert.equal(
  canaryXMaximumDailyReservationUsd(0.000001),
  0.08,
  "X must reserve the minimum run charge even when result pricing is tiny"
);
assert.equal(
  canaryGoogleNewsMaximumDailyReservationUsd(0.000001, 0.000001),
  0.16,
  "Google News must reserve primary and fallback minimum run charges"
);
assert.throws(
  () => assertCanaryCollectionCostPlan({
    xPricePerThousandUsd: 100_000,
    googleNewsPricePerThousandUsd: 0.5,
    googleNewsFallbackPricePerThousandUsd: 1.5
  }),
  /X.*above the account ceiling/
);
assert.throws(
  () => assertCanaryCollectionCostPlan({
    xPricePerThousandUsd: 15,
    googleNewsPricePerThousandUsd: 100_000,
    googleNewsFallbackPricePerThousandUsd: 1.5
  }),
  /Google News.*above the account ceiling/
);
assert.throws(
  () => assertCanaryCollectionCostPlan({
    xPricePerThousandUsd: 15,
    googleNewsPricePerThousandUsd: 0.5,
    googleNewsFallbackPricePerThousandUsd: 100_000
  }),
  /Google News.*above the account ceiling/
);

assert.equal(CANARY_LLM_PLAN.dailyFixtureRotationHours, 4);
assert.equal(CANARY_LLM_PLAN.maximumLocalizationSummaryCallsPerEdition, 10);
assert.equal(CANARY_LLM_PLAN.controlledLocalizationSummaryCallsPerEdition, 0);
assert.equal(llm.messagesPerAccount, 36);
assert.equal(llm.editionsPerAccount, 25);
assert.deepEqual(llm.purposeCosts, {
  summary: 0.001178,
  importanceReview: 0.000947,
  eventReview: 0.001357,
  editionSummary: 0.00844
});
assert.equal(llm.messageReservationUsd, 0.004839);
assert.equal(llm.perAccountMaximumDailyUsd, 0.596204);
assert.equal(llm.cohortMaximumDailyUsd, 29.8102);
assert.ok(llm.accountHeadroomRatio >= 0.25);
assert.ok(llm.globalHeadroomRatio >= 0.25);
assert.equal(Number(staging.vars?.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD), 0.75);
assert.equal(Number(staging.vars?.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD), 3);
assert.equal(Number(staging.vars?.GLOBAL_LLM_DAILY_BUDGET_USD), 38);
assert.equal(Number(staging.vars?.GLOBAL_LLM_MONTHLY_BUDGET_USD), 150);
assert.equal(Number(staging.vars?.TOTAL_MONTHLY_BUDGET_USD), 154);
assert.equal(CANARY_LLM_PLAN.minimumMonthlyRunwayDays, 4);
assert.ok(llm.requiredAccountMonthlyRunwayUsd < CANARY_LLM_PLAN.accountMonthlyCeilingUsd);
assert.ok(llm.requiredGlobalMonthlyRunwayUsd < CANARY_LLM_PLAN.globalMonthlyCeilingUsd);
assert.equal(Number(staging.vars?.OPENAI_SUMMARY_MAX_INPUT_TOKENS), 2_304);
assert.equal(Number(staging.vars?.OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS), 2_048);
assert.equal(Number(staging.vars?.OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS), 3_072);
assert.equal(Number(staging.vars?.OPENAI_EDITION_MAX_INPUT_TOKENS), 19_500);
assert.throws(
  () => assertCanaryLlmCostPlan({
    ...staging.vars,
    OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS: "0.80"
  }),
  /headroom/
);
assert.throws(
  () => assertCanaryLlmCostPlan({
    ...staging.vars,
    OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS: "3.20"
  }),
  /headroom/
);

assert.equal(Number(production.vars?.HOSTED_LLM_ACCOUNT_DAILY_BUDGET_USD), 0.1);
assert.equal(Number(production.vars?.HOSTED_LLM_ACCOUNT_MONTHLY_BUDGET_USD), 2);
assert.equal(Number(production.vars?.GLOBAL_LLM_DAILY_BUDGET_USD), 5);
assert.equal(Number(production.vars?.GLOBAL_LLM_MONTHLY_BUDGET_USD), 150);
assert.equal(Number(production.vars?.OPENAI_SUMMARY_MAX_INPUT_TOKENS), 1_000_000);
assert.equal(Number(production.vars?.OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS), 1_000_000);
assert.equal(Number(production.vars?.OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS), 1_000_000);
assert.equal(Number(production.vars?.OPENAI_EDITION_MAX_INPUT_TOKENS), 1_000_000);
assert.equal(Number(production.vars?.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS), 300);
assert.equal(Number(production.vars?.OPENAI_REVIEW_MAX_OUTPUT_TOKENS), 80);
assert.equal(Number(production.vars?.OPENAI_EDITION_MAX_OUTPUT_TOKENS), 1_600);

const sourceRuntime = readFileSync(
  `${repositoryRoot}/apps/worker/src/sources.ts`,
  "utf8"
);
assert.match(sourceRuntime, /APIFY_MINIMUM_RUN_CHARGE_USD = 0\.02/);
assert.match(
  sourceRuntime,
  /Math\.max\(APIFY_MINIMUM_RUN_CHARGE_USD, input\.estimatedCostUsd \?\? 0\)/
);

const aiRuntime = readFileSync(
  `${repositoryRoot}/apps/worker/src/ai.ts`,
  "utf8"
);
assert.match(aiRuntime, /llmPurposeInputTokenLimit\(env, input\.purpose\)/);
assert.match(aiRuntime, /OPENAI_SUMMARY_MAX_OUTPUT_TOKENS/);
assert.match(aiRuntime, /OPENAI_REVIEW_MAX_OUTPUT_TOKENS/);
assert.match(aiRuntime, /OPENAI_EDITION_MAX_OUTPUT_TOKENS/);

const processorRuntime = readFileSync(
  `${repositoryRoot}/apps/worker/src/processor.ts`,
  "utf8"
);
assert.match(processorRuntime, /const maxReviews = 2/);
assert.match(processorRuntime, /let summarizedCurrentMessage = false/);
assert.match(processorRuntime, /briefing\.id\.startsWith\("launch_canary_briefing_"\)/);
assert.match(processorRuntime, /rawMessage\.source\.id\.startsWith\("launch_canary_fixture_"\)/);

const editionRuntime = readFileSync(
  `${repositoryRoot}/packages/core/src/editions.ts`,
  "utf8"
);
assert.match(editionRuntime, /hourly: 10/);
assert.match(editionRuntime, /\.slice\(0, referenceLimit\)/);

const seedRuntime = readFileSync(
  `${repositoryRoot}/scripts/canary/seed.mjs`,
  "utf8"
);
assert.match(seedRuntime, /CANARY_GOOGLE_NEWS_PLAN\.maxItems/);
assert.match(seedRuntime, /CANARY_LLM_PLAN\.dailyFixtureRotationHours/);
assert.match(seedRuntime, /interestProfile.*distilledcanarycheckpoint|q\("distilledcanarycheckpoint"\)/);
assert.match(seedRuntime, /launch_canary_account_\$\{accountSuffix\}\|/);
assert.doesNotMatch(seedRuntime, /daily_budget_usd/);

const appRuntime = readFileSync(
  `${repositoryRoot}/apps/worker/src/app.ts`,
  "utf8"
);
assert.match(appRuntime, /distilledcanarycheckpoint/);

console.log(
  `Canary cost plan reserves at most $${collection.maximumDailyUsd.toFixed(2)}/day ` +
  `for paid sources and $${llm.cohortMaximumDailyUsd.toFixed(6)}/day for designed canary LLM calls.`
);
