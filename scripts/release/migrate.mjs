#!/usr/bin/env node

import {
  assertIsolatedStaging,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  requiredConfirmation,
  runWrangler
} from "../lib/release-config.mjs";

const environment = process.argv[2];
const config = readWorkerConfig();
const selected = environmentConfig(config, environment);
const expectedConfirmation = requiredConfirmation(environment, "migrate");

if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expectedConfirmation) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expectedConfirmation} to migrate ${environment}.`);
}
if (environment === "staging") assertIsolatedStaging(config);
if (environment === "production" && !/lownoise|distilled/i.test(d1Binding(selected).database_name)) {
  throw new Error("Production migration refused: unexpected database target.");
}

runWrangler(["d1", "migrations", "apply", "DB", "--remote", "--env", environment]);
