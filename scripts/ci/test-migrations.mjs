#!/usr/bin/env node

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { repositoryRoot, wranglerPath } from "../lib/release-config.mjs";
import {
  verifyCurrentRollbackSchemaCompatibility
} from "../release/verify-rollback-schema-compatibility.mjs";

const sourceMigrations = resolve(repositoryRoot, "apps/worker/migrations");
const workerMain = resolve(repositoryRoot, "apps/worker/src/index.ts");
const temporaryRoot = mkdtempSync(join(tmpdir(), "distilled-migration-test-"));

try {
  runScenario("clean", Number.POSITIVE_INFINITY);
  runScenario("upgrade-from-0024", 24);
  verifyCurrentRollbackSchemaCompatibility();
  console.log("Migration checks passed for a clean database and the migration-24 upgrade fixture.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function runScenario(name, initialMaximum) {
  const scenarioRoot = resolve(temporaryRoot, name);
  const migrationDirectory = resolve(scenarioRoot, "migrations");
  const persistenceDirectory = resolve(scenarioRoot, "state");
  const configPath = resolve(scenarioRoot, "wrangler.jsonc");
  const files = readdirSync(sourceMigrations).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();

  mkdirSync(migrationDirectory, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: `distilled-migration-test-${name}`,
    main: workerMain,
    compatibility_date: "2026-07-29",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    d1_databases: [{
      binding: "DB",
      database_name: `distilled-migration-test-${name}`,
      database_id: "00000000-0000-0000-0000-000000000001",
      migrations_dir: "./migrations"
    }]
  }, null, 2));

  for (const file of files) {
    const number = Number(file.slice(0, 4));
    if (number <= initialMaximum) {
      cpSync(resolve(sourceMigrations, file), resolve(migrationDirectory, basename(file)), { recursive: false });
    }
  }
  apply(configPath, persistenceDirectory);

  if (Number.isFinite(initialMaximum)) {
    seedUpgradeFixture(configPath, persistenceDirectory);
    for (const file of files) {
      const number = Number(file.slice(0, 4));
      if (number > initialMaximum) {
        cpSync(resolve(sourceMigrations, file), resolve(migrationDirectory, basename(file)), { recursive: false });
      }
    }
    apply(configPath, persistenceDirectory);
  }

  apply(configPath, persistenceDirectory);
  if (Number.isFinite(initialMaximum)) {
    assertUpgradeFixture(configPath, persistenceDirectory);
  }
  execute(configPath, persistenceDirectory, "PRAGMA quick_check;");
  execute(
    configPath,
    persistenceDirectory,
    "SELECT COUNT(*) AS application_tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%';"
  );
}

function seedUpgradeFixture(configPath, persistenceDirectory) {
  execute(configPath, persistenceDirectory, `
    INSERT INTO accounts (
      id, email, normalized_email, username, role, password_hash,
      email_verified_at, created_at, updated_at
    ) VALUES (
      'migration_fixture_account', 'fixture@example.invalid', 'fixture@example.invalid',
      'migration-fixture', 'user', 'not-a-login', '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
    INSERT INTO accounts (
      id, email, normalized_email, username, role, password_hash,
      email_verified_at, created_at, updated_at
    ) VALUES (
      'migration_stale_unverified_account',
      'stale-unverified@example.invalid', 'stale-unverified@example.invalid',
      'stale-unverified', 'user', 'not-a-login', NULL,
      '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
    );
    INSERT INTO briefings (
      id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
      public_feed_enabled, paused, language, retention_days, intensity, daily_budget_usd,
      briefing_cadence, briefing_time_of_day, briefing_timezone, next_briefing_at,
      created_at, updated_at
    ) VALUES (
      'migration_fixture_briefing', 'migration_fixture_account', 'fixture', 'Fixture', 99,
      'Migration coverage', NULL, 0, 0, 'en', 15, 'low', 0.25,
      'hourly', '00:15', 'UTC', '2026-07-01T01:00:00.000Z',
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
    INSERT INTO briefing_stars (briefing_id, voter_id, created_at) VALUES
      ('migration_fixture_briefing', 'migration_fixture_account', '2026-07-01T00:00:00.000Z'),
      ('migration_fixture_briefing', 'deleted_account', '2026-07-01T00:00:00.000Z');
    INSERT INTO sources (
      id, briefing_id, title, type, username, enabled, last_seen_at,
      provider, kind, input, source_url, canonical_key,
      health_state, failure_class, consecutive_failures, created_at, updated_at
    ) VALUES
      (
        'migration_fixture_source', 'migration_fixture_briefing', 'Fixture Google News', 'channel',
        NULL, 1, '2026-07-01T00:00:00.000Z', 'apify', 'google_news',
        'google news: migration fixture', 'https://news.google.com/rss/search?q=migration-fixture',
        'apify|google_news|https://news.google.com/rss/search?q=migration-fixture',
        'healthy', NULL, 0, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
      ),
      (
        'migration_fixture_generic_apify', 'migration_fixture_briefing', 'Fixture generic Apify', 'channel',
        NULL, 0, '2026-07-01T00:00:00.000Z', 'apify', 'apify_actor',
        'apify: fixture/actor', NULL, 'apify|apify_actor|fixture/actor',
        'degraded', 'disabled', 0, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
      );
    INSERT INTO source_runs (
      id, source_id, briefing_id, provider, state, item_count,
      started_at, completed_at, created_at, updated_at, estimated_cost_usd, actual_cost_usd
    ) VALUES
      (
        'migration_fixture_run_1', 'migration_fixture_source', 'migration_fixture_briefing',
        'rss', 'succeeded', 1, '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z',
        '2026-07-01T00:00:00.000Z', '2026-07-01T00:01:00.000Z', 0, 0
      ),
      (
        'migration_fixture_run_2', 'migration_fixture_source', 'migration_fixture_briefing',
        'rss', 'succeeded', 1, '2026-07-01T00:02:00.000Z', '2026-07-01T00:03:00.000Z',
        '2026-07-01T00:02:00.000Z', '2026-07-01T00:03:00.000Z', 0, 0
      );
  `);
}

function assertUpgradeFixture(configPath, persistenceDirectory) {
  const row = executeJson(configPath, persistenceDirectory, `
    SELECT
      (SELECT session_version FROM accounts WHERE id = 'migration_fixture_account') AS session_version,
      (SELECT COUNT(*) FROM briefing_stars WHERE briefing_id = 'migration_fixture_briefing') AS retained_stars,
      (SELECT stars FROM briefings WHERE id = 'migration_fixture_briefing') AS star_counter,
      (SELECT public_feed_enabled FROM briefings WHERE id = 'migration_fixture_briefing') AS public_feed_enabled,
      (SELECT health_state FROM sources WHERE id = 'migration_fixture_source') AS source_health,
      (SELECT failure_class FROM sources WHERE id = 'migration_fixture_source') AS failure_class,
      (SELECT canonical_key FROM sources
        WHERE id = 'migration_fixture_source') AS paid_canonical_key,
      (SELECT canonical_key FROM sources
        WHERE id = 'migration_fixture_generic_apify') AS generic_apify_canonical_key,
      (SELECT COUNT(*) FROM pragma_table_info('accounts')
        WHERE name IN (
          'terms_accepted_at', 'terms_version', 'privacy_version', 'acceptable_use_version'
        )) AS legal_acceptance_columns,
      (SELECT CASE
        WHEN terms_accepted_at IS NULL
          AND terms_version IS NULL
          AND privacy_version IS NULL
          AND acceptable_use_version IS NULL
        THEN 1
        ELSE 0
      END FROM accounts WHERE id = 'migration_fixture_account') AS legacy_legal_acceptance_remains_null,
      (SELECT COUNT(*) FROM pragma_table_info('source_runs') WHERE name = 'idempotency_key') AS idempotency_column,
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'spend_ledger') AS spend_ledger_table,
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'spend_ledger_no_%') AS spend_ledger_triggers,
      (SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = 'spend_daily_aggregates') AS spend_daily_aggregate_table,
      (SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = 'spend_idempotency_tombstones') AS spend_tombstone_table,
      (SELECT COUNT(*) FROM spend_retention_lease WHERE id = 1) AS spend_retention_lease,
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'paid_provider_seats') AS paid_provider_seat_table,
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'paid_provider_seat_%') AS paid_provider_seat_triggers,
      (SELECT COUNT(*) FROM paid_provider_seats WHERE account_id = 'migration_fixture_account') AS backfilled_paid_provider_seat,
      (SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = 'registration_email_receipts') AS registration_email_receipt_table,
      (SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = 'retired_username_hashes') AS retired_username_hash_table,
      (SELECT COUNT(*) FROM accounts
        WHERE id = 'migration_stale_unverified_account'
          AND email_verified_at IS NULL) AS stale_unverified_fixture,
      (SELECT COUNT(*) FROM retired_username_hashes) AS legacy_retired_username_hashes;
  `)[0] ?? {};
  if (
    Number(row.session_version) !== 1 ||
    Number(row.retained_stars) !== 1 ||
    Number(row.star_counter) !== 1 ||
    Number(row.public_feed_enabled) !== 0 ||
    row.source_health !== "degraded" ||
    row.failure_class !== "pending_first_success" ||
    row.paid_canonical_key !==
      "migration_fixture_account|apify|google_news|https://news.google.com/rss/search?q=migration-fixture" ||
    row.generic_apify_canonical_key !== "apify|apify_actor|fixture/actor" ||
    Number(row.legal_acceptance_columns) !== 4 ||
    Number(row.legacy_legal_acceptance_remains_null) !== 1 ||
    Number(row.idempotency_column) !== 1 ||
    Number(row.spend_ledger_table) !== 1 ||
    Number(row.spend_ledger_triggers) !== 1 ||
    Number(row.spend_daily_aggregate_table) !== 1 ||
    Number(row.spend_tombstone_table) !== 1 ||
    Number(row.spend_retention_lease) !== 1 ||
    Number(row.paid_provider_seat_table) !== 1 ||
    Number(row.paid_provider_seat_triggers) !== 5 ||
    Number(row.backfilled_paid_provider_seat) !== 1 ||
    Number(row.registration_email_receipt_table) !== 1 ||
    Number(row.retired_username_hash_table) !== 1 ||
    Number(row.stale_unverified_fixture) !== 1 ||
    Number(row.legacy_retired_username_hashes) !== 0
  ) {
    throw new Error(`Migration-24 upgrade fixture assertions failed: ${JSON.stringify(row)}`);
  }

  execute(
    configPath,
    persistenceDirectory,
    "DELETE FROM accounts WHERE id = 'migration_stale_unverified_account';"
  );
  const staleCleanupRow = executeJson(
    configPath,
    persistenceDirectory,
    "SELECT COUNT(*) AS retired_username_hashes FROM retired_username_hashes;"
  )[0] ?? {};
  if (Number(staleCleanupRow.retired_username_hashes) !== 0) {
    throw new Error(
      `Stale unverified cleanup created a username tombstone: ${JSON.stringify(staleCleanupRow)}`
    );
  }

  execute(
    configPath,
    persistenceDirectory,
    "UPDATE source_runs SET idempotency_key = 'fixture-idempotency' WHERE id = 'migration_fixture_run_1';"
  );
  executeExpectFailure(
    configPath,
    persistenceDirectory,
    "UPDATE source_runs SET idempotency_key = 'fixture-idempotency' WHERE id = 'migration_fixture_run_2';"
  );
  execute(configPath, persistenceDirectory, `
    INSERT INTO spend_ledger (
      id, idempotency_key, account_id, briefing_id, category, provider,
      event_type, amount_usd, created_at
    ) VALUES (
      'migration_fixture_spend', 'migration_fixture_spend_key', 'migration_fixture_account',
      'migration_fixture_briefing', 'collection', 'rss', 'reservation', 0.01,
      '2026-07-01T00:00:00.000Z'
    );
  `);
  executeExpectFailure(
    configPath,
    persistenceDirectory,
    "UPDATE spend_ledger SET amount_usd = 0.02 WHERE id = 'migration_fixture_spend';"
  );
  execute(
    configPath,
    persistenceDirectory,
    "DELETE FROM spend_ledger WHERE id = 'migration_fixture_spend';"
  );
  execute(configPath, persistenceDirectory, `
    INSERT INTO accounts (
      id, email, normalized_email, username, role, password_hash,
      email_verified_at, created_at, updated_at
    ) VALUES (
      'migration_second_paid_account', 'second-paid@example.invalid', 'second-paid@example.invalid',
      'second-paid', 'user', 'not-a-login', '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
    INSERT INTO briefings (
      id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
      public_feed_enabled, paused, language, retention_days, intensity, daily_budget_usd,
      briefing_cadence, briefing_time_of_day, briefing_timezone, next_briefing_at,
      created_at, updated_at
    ) VALUES (
      'migration_second_paid_briefing', 'migration_second_paid_account', 'paid', 'Paid', 0,
      'Migration capacity coverage', NULL, 1, 0, 'en', 15, 'low', 0.25,
      'daily', '00:00', 'UTC', '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
    INSERT INTO settings (key, value, updated_at)
    VALUES ('hosted_paid_provider_account_cap', '1', '2026-07-01T00:00:00.000Z')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
  `);
  const secondPaidSourceSql = `
    INSERT INTO sources (
      id, briefing_id, title, type, username, enabled, last_seen_at,
      provider, kind, input, source_url, canonical_key,
      health_state, failure_class, consecutive_failures, created_at, updated_at
    ) VALUES (
      'migration_second_paid_source', 'migration_second_paid_briefing', 'Second paid source', 'channel',
      NULL, 1, '2026-07-01T00:00:00.000Z', 'apify', 'x_profile',
      'x: second-paid', 'https://x.com/second-paid', 'apify|x_profile|second-paid',
      'degraded', 'pending_first_success', 0,
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );`;
  executeExpectFailure(configPath, persistenceDirectory, secondPaidSourceSql);
  execute(
    configPath,
    persistenceDirectory,
    "DELETE FROM sources WHERE id = 'migration_fixture_source';"
  );
  execute(configPath, persistenceDirectory, secondPaidSourceSql);
  const seatRow = executeJson(
    configPath,
    persistenceDirectory,
    "SELECT COUNT(*) AS count, MIN(account_id) AS account_id FROM paid_provider_seats;"
  )[0] ?? {};
  if (
    Number(seatRow.count) !== 1 ||
    seatRow.account_id !== "migration_second_paid_account"
  ) {
    throw new Error(`Paid-provider seat release assertions failed: ${JSON.stringify(seatRow)}`);
  }
}

function apply(configPath, persistenceDirectory) {
  run([
    "d1", "migrations", "apply", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--config", configPath
  ]);
}

function execute(configPath, persistenceDirectory, command) {
  run([
    "d1", "execute", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--command", command,
    "--config", configPath
  ]);
}

function executeJson(configPath, persistenceDirectory, command) {
  const result = run([
    "d1", "execute", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--json",
    "--command", command,
    "--config", configPath
  ], { capture: true });
  return JSON.parse(result.stdout)[0]?.results ?? [];
}

function executeExpectFailure(configPath, persistenceDirectory, command) {
  const result = run([
    "d1", "execute", "DB",
    "--local",
    "--persist-to", persistenceDirectory,
    "--command", command,
    "--config", configPath
  ], { capture: true, allowFailure: true });
  if (result.status === 0) throw new Error(`Expected D1 statement to fail: ${command}`);
}

function run(args, options = {}) {
  const result = spawnSync(wranglerPath(), args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: { ...process.env, CI: "true" }
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      throw new Error(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
    }
    process.exit(result.status ?? 1);
  }
  return result;
}
