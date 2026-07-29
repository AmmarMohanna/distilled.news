#!/usr/bin/env node

import {
  assertIsolatedStaging,
  readWorkerConfig,
  requiredConfirmation,
  runWrangler
} from "../lib/release-config.mjs";
import { resetObservationWindow } from "./observation-window.mjs";

assertIsolatedStaging(readWorkerConfig(), { baseUrl: process.env.CANARY_BASE_URL });
const expected = requiredConfirmation("staging", "canary-remove");
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expected) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expected} to remove the staging cohort.`);
}

const keys = query(`
  SELECT DISTINCT object_key
  FROM (
    SELECT raw_payload_key AS object_key
    FROM raw_messages
    WHERE briefing_id LIKE 'launch_canary_briefing_%'
    UNION ALL
    SELECT archive_key AS object_key
    FROM source_runs
    WHERE briefing_id LIKE 'launch_canary_briefing_%'
  )
  WHERE object_key IS NOT NULL
    AND object_key != '';
`);
if (keys.length > 0) {
  throw new Error(
    `Removal refused: ${keys.length} staging R2 object(s) are still referenced. ` +
    "Delete them from the staging RAW_ARCHIVE bucket, then rerun."
  );
}

runWrangler([
  "d1", "execute", "DB",
  "--remote",
  "--env", "staging",
  "--yes",
  "--command", "PRAGMA foreign_keys = ON; DELETE FROM accounts WHERE id LIKE 'launch_canary_account_%';"
]);
const remainingSeats = query(`
  SELECT account_id
  FROM paid_provider_seats
  WHERE account_id LIKE 'launch_canary_account_%';
`);
if (remainingSeats.length > 0) {
  throw new Error(`Canary removal left ${remainingSeats.length} paid-provider seat(s) claimed.`);
}
resetObservationWindow("canary-removed");
console.log("Removed the 50-account synthetic cohort from staging.");

function query(command) {
  const result = runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", "staging",
    "--json",
    "--command", command
  ], { capture: true });
  return JSON.parse(result.stdout)[0]?.results ?? [];
}
