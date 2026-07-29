#!/usr/bin/env node

import { verifyApifyReadiness } from "../lib/apify-readiness.mjs";
import {
  environmentConfig,
  readWorkerConfig
} from "../lib/release-config.mjs";

const environmentName = process.argv[2];
const environment = environmentConfig(readWorkerConfig(), environmentName);
const evidence = await verifyApifyReadiness(environment, {
  readinessToken: process.env.APIFY_READINESS_TOKEN || process.env.APIFY_API_TOKEN
});

if (evidence.skipped) {
  console.log(`Apify readiness skipped for ${environmentName}: ${evidence.reason}`);
} else {
  console.log(
    `Apify readiness passed for ${environmentName}: ` +
    `$${evidence.remainingMonthlyUsageUsd.toFixed(2)} headroom for a ` +
    `$${evidence.monthlyCollectionCapUsd.toFixed(2)} cap; ` +
    `${evidence.actors.length} reviewed actor contracts match tier ${evidence.planTier}.`
  );
}
