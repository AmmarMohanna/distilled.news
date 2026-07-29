#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  assertIsolatedStaging,
  readWorkerConfig,
  requiredConfirmation,
  runWrangler
} from "../lib/release-config.mjs";
import {
  CANARY_GOOGLE_NEWS_PLAN,
  CANARY_LLM_PLAN,
  CANARY_X_PLAN
} from "./cost-plan.mjs";
import { resetObservationWindow } from "./observation-window.mjs";

const config = readWorkerConfig();
const { staging, baseUrl } = assertIsolatedStaging(config, { baseUrl: process.env.CANARY_BASE_URL });
const expected = requiredConfirmation("staging", "canary-seed");
if (process.env.CONFIRM_CLOUDFLARE_MUTATION !== expected) {
  throw new Error(`Set CONFIRM_CLOUDFLARE_MUTATION=${expected} to seed the isolated staging cohort.`);
}
const existing = queryOne(`
  SELECT
    (SELECT COUNT(*) FROM accounts WHERE id LIKE 'launch_canary_account_%') AS accounts,
    (SELECT COUNT(*) FROM paid_provider_seats) AS paid_provider_seats;
`);
if (Number(existing.accounts ?? 0) > 0) {
  throw new Error(
    "A canary cohort already exists. Remove its referenced R2 objects and run canary:remove before reseeding a fresh evidence window."
  );
}
if (Number(existing.paid_provider_seats ?? 0) > 2) {
  throw new Error(
    "Canary seed requires two paid-provider account seats, but fewer than two of the four staging seats are available."
  );
}

const fixtureEpoch = String(Math.floor(Date.now() / 3_600_000) * 3_600_000);
const sql = buildSeedSql(
  new URL("/canary-fixture.xml", baseUrl ?? staging.vars.PUBLIC_WEB_BASE_URL).toString(),
  fixtureEpoch
);
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "distilled-canary-seed-"));
const sqlPath = resolve(temporaryDirectory, "seed.sql");
try {
  writeFileSync(sqlPath, sql, { mode: 0o600 });
  runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", "staging",
    "--yes",
    "--file", sqlPath
  ]);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const seeded = queryOne(`
  SELECT
    (SELECT COUNT(*) FROM accounts WHERE id LIKE 'launch_canary_account_%') AS accounts,
    (SELECT COUNT(*) FROM briefings WHERE id LIKE 'launch_canary_briefing_%') AS feeds,
    (SELECT COUNT(*) FROM sources WHERE id LIKE 'launch_canary_source_%') AS live_sources,
    (SELECT COUNT(*) FROM sources WHERE id LIKE 'launch_canary_fixture_%') AS fixture_sources,
    (SELECT COUNT(*) FROM paid_provider_seats
      WHERE account_id LIKE 'launch_canary_account_%') AS canary_paid_provider_seats,
    (SELECT COUNT(DISTINCT briefings.owner_account_id)
      FROM sources
      JOIN briefings ON briefings.id = sources.briefing_id
      WHERE sources.id LIKE 'launch_canary_source_%'
        AND sources.kind IN ('google_news', 'x_profile', 'x_search')) AS canary_paid_provider_accounts,
    (SELECT COUNT(*) FROM paid_provider_seats) AS total_paid_provider_seats;
`);
if (
  Number(seeded.accounts) !== 50 ||
  Number(seeded.feeds) !== 100 ||
  Number(seeded.live_sources) !== 100 ||
  Number(seeded.fixture_sources) !== 400 ||
  Number(seeded.canary_paid_provider_seats) !== 2 ||
  Number(seeded.canary_paid_provider_accounts) !== 2 ||
  Number(seeded.total_paid_provider_seats) > 4
) {
  throw new Error(`Canary seed inventory assertion failed: ${JSON.stringify(seeded)}`);
}

resetObservationWindow("canary-seed", readRelease());
console.log("Seeded 50 verified synthetic accounts, 100 public feeds, 100 live sources, 400 controlled fixture sources, and exactly two paid-provider account seats in staging.");

function buildSeedSql(fixtureUrl, fixtureEpoch) {
  const accountRows = [];
  const aliasRows = [];
  const briefingRows = [];
  const sourceRows = [];
  const rssFeeds = [
    ["BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    ["Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"],
    ["Science", "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science"],
    ["NASA", "https://www.nasa.gov/rss/dyn/breaking_news.rss"],
    ["Cloudflare Blog", "https://blog.cloudflare.com/rss/"]
  ];
  let feedIndex = 0;

  for (let index = 1; index <= 50; index += 1) {
    const padded = String(index).padStart(3, "0");
    const accountId = `launch_canary_account_${padded}`;
    const username = `launch-canary-${padded}`;

    accountRows.push(
      `(${q(accountId)}, ${q(`${username}@example.invalid`)}, ${q(`${username}@example.invalid`)}, ${q(username)}, 'user', 'synthetic-no-login', datetime('now'), datetime('now'), datetime('now'))`
    );
    aliasRows.push(`(${q(username)}, ${q(accountId)}, 1, datetime('now'))`);

    for (const cadence of ["hourly", "daily"]) {
      feedIndex += 1;
      const briefingId = `launch_canary_briefing_${padded}_${cadence}`;
      const sourceId = `launch_canary_source_${padded}_${cadence}`;
      const slug = `${cadence}-signal`;
      briefingRows.push(
        `(${q(briefingId)}, ${q(accountId)}, ${q(slug)}, ${q(`[Canary ${padded}] ${cadence === "hourly" ? "Hourly" : "Daily"} Signal`)}, 0, ` +
        `${q("distilledcanarycheckpoint")}, ` +
        `${q("Synthetic staging cohort. Use concise factual English and omit unsupported claims.")}, ` +
        `1, 0, 'en', 15, 'low', ${q(cadence)}, ${q(`${String(index % 24).padStart(2, "0")}:15`)}, ` +
        `'UTC', strftime('%Y-%m-%dT%H:00:00.000Z', 'now', '+1 hour'), datetime('now'), datetime('now'))`
      );

      if (feedIndex === CANARY_X_PLAN.feedIndex) {
        sourceRows.push(sourceRow({
          sourceId,
          briefingId,
          title: "Canary X: Cloudflare",
          provider: "apify",
          kind: "x_profile",
          username: "Cloudflare",
          input: "x: @Cloudflare",
          sourceUrl: "https://x.com/Cloudflare",
          actorId: "xquik/x-tweet-scraper",
          actorInput: JSON.stringify({
            searchTerms: ["from:Cloudflare"],
            queryType: "Latest",
            maxItems: CANARY_X_PLAN.maxItems
          })
        }));
      } else if (feedIndex === CANARY_GOOGLE_NEWS_PLAN.feedIndex) {
        sourceRows.push(sourceRow({
          sourceId,
          briefingId,
          title: "Canary Google News: Cloudflare",
          provider: "apify",
          kind: "google_news",
          input: "news: Cloudflare Workers security",
          sourceUrl: "https://news.google.com/rss/search?q=Cloudflare+Workers+security&hl=en-US&gl=US&ceid=US:en",
          actorId: "groupoject/google-news-scraper",
          actorInput: JSON.stringify({
            maxResults: CANARY_GOOGLE_NEWS_PLAN.maxItems
          })
        }));
      } else if (feedIndex === 5) {
        sourceRows.push(sourceRow({
          sourceId,
          briefingId,
          title: "Canary Telegram: Telegram",
          provider: "telegram",
          kind: "telegram_channel",
          username: "telegram",
          input: "channel: @telegram",
          sourceUrl: "https://t.me/s/telegram"
        }));
      } else {
        const [title, url] = rssFeeds[(feedIndex - 3) % rssFeeds.length];
        sourceRows.push(sourceRow({
          sourceId,
          briefingId,
          title: `Canary RSS: ${title}`,
          provider: "rss",
          kind: "rss_feed",
          input: `rss: ${url}`,
          sourceUrl: url
        }));
      }
      for (let fixtureIndex = 1; fixtureIndex <= 4; fixtureIndex += 1) {
        const sourceUrl = new URL(fixtureUrl);
        sourceUrl.searchParams.set("source", `${padded}-${cadence}-${fixtureIndex}`);
        sourceUrl.searchParams.set("epoch", fixtureEpoch);
        if (fixtureIndex === 1) {
          sourceUrl.searchParams.set(
            "rotating",
            String(
              cadence === "hourly"
                ? CANARY_LLM_PLAN.hourlyFixtureRotationHours
                : CANARY_LLM_PLAN.dailyFixtureRotationHours
            )
          );
        }
        sourceRows.push(sourceRow({
          sourceId: `launch_canary_fixture_${padded}_${cadence}_${fixtureIndex}`,
          briefingId,
          title: `Canary controlled publication fixture ${fixtureIndex}`,
          provider: "rss",
          kind: "rss_feed",
          input: `rss: ${sourceUrl}`,
          sourceUrl: sourceUrl.toString()
        }));
      }
    }
  }

  return `PRAGMA foreign_keys = ON;

INSERT INTO accounts (
  id, email, normalized_email, username, role, password_hash,
  email_verified_at, created_at, updated_at
) VALUES
  ${accountRows.join(",\n  ")}
ON CONFLICT(id) DO UPDATE SET
  email_verified_at = excluded.email_verified_at,
  updated_at = datetime('now');

INSERT INTO username_aliases (username, account_id, is_current, created_at) VALUES
  ${aliasRows.join(",\n  ")}
ON CONFLICT(username) DO UPDATE SET
  account_id = excluded.account_id,
  is_current = 1;

INSERT INTO settings (key, value, updated_at)
VALUES ('hosted_paid_provider_account_cap', '4', datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

INSERT INTO briefings (
  id, owner_account_id, slug, title, stars, interest_profile, style_instruction,
  public_feed_enabled, paused, language, retention_days, intensity,
  briefing_cadence, briefing_time_of_day, briefing_timezone, next_briefing_at,
  created_at, updated_at
) VALUES
  ${briefingRows.join(",\n  ")}
ON CONFLICT(id) DO UPDATE SET
  public_feed_enabled = 1,
  paused = 0,
  stars = 0,
  intensity = 'low',
  briefing_cadence = excluded.briefing_cadence,
  next_briefing_at = CASE
    WHEN briefings.next_briefing_at IS NULL OR briefings.next_briefing_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      THEN excluded.next_briefing_at
    ELSE briefings.next_briefing_at
  END,
  updated_at = datetime('now');

INSERT INTO sources (
  id, briefing_id, title, type, provider, kind, username, input, source_url,
  actor_id, actor_input_json, enabled, last_seen_at, canonical_key,
  health_state, failure_class, consecutive_failures, created_at, updated_at
) VALUES
  ${sourceRows.join(",\n  ")}
ON CONFLICT(id) DO UPDATE SET
  briefing_id = excluded.briefing_id,
  title = excluded.title,
  provider = excluded.provider,
  kind = excluded.kind,
  username = excluded.username,
  input = excluded.input,
  source_url = excluded.source_url,
  actor_id = excluded.actor_id,
  actor_input_json = excluded.actor_input_json,
  enabled = 1,
  canonical_key = excluded.canonical_key,
  updated_at = datetime('now');

SELECT
  (SELECT COUNT(*) FROM accounts WHERE id LIKE 'launch_canary_account_%') AS accounts,
  (SELECT COUNT(*) FROM briefings WHERE id LIKE 'launch_canary_briefing_%') AS feeds,
  (SELECT COUNT(*) FROM sources WHERE id LIKE 'launch_canary_source_%') AS live_sources,
  (SELECT COUNT(*) FROM sources WHERE id LIKE 'launch_canary_fixture_%') AS fixture_sources;
`;
}

function queryOne(command) {
  const result = runWrangler([
    "d1", "execute", "DB",
    "--remote",
    "--env", "staging",
    "--json",
    "--command", command
  ], { capture: true });
  return JSON.parse(result.stdout)[0]?.results?.[0] ?? {};
}

function readRelease() {
  const result = runWrangler(["versions", "list", "--env", "staging", "--json"], {
    capture: true,
    allowFailure: true
  });
  if (result.status !== 0) return {};
  const versions = JSON.parse(result.stdout);
  const latest = Array.isArray(versions) ? versions.at(-1) ?? {} : {};
  const text = JSON.stringify(latest);
  return {
    versionId: latest.id ?? latest.version_id ?? null,
    releaseSha: text.match(/\b[a-f0-9]{40,64}\b/i)?.[0] ?? null
  };
}

function sourceRow(input) {
  const canonicalKey = canonicalSourceKey(input);
  return `(${q(input.sourceId)}, ${q(input.briefingId)}, ${q(input.title)}, 'channel', ` +
    `${q(input.provider)}, ${q(input.kind)}, ${nullable(input.username)}, ${q(input.input)}, ` +
    `${q(input.sourceUrl)}, ${nullable(input.actorId)}, ${nullable(input.actorInput)}, 1, datetime('now'), ` +
    `${q(canonicalKey)}, 'degraded', 'pending_first_success', 0, datetime('now'), datetime('now'))`;
}

function canonicalSourceKey(input) {
  const accountSuffix = input.briefingId.match(/^launch_canary_briefing_(\d{3})_/)?.[1];
  const accountScope =
    ["google_news", "x_profile", "x_search"].includes(input.kind) && accountSuffix
      ? `launch_canary_account_${accountSuffix}|`
      : "";
  if (input.kind === "google_news" && input.sourceUrl) {
    const url = new URL(input.sourceUrl);
    const rawQuery = url.search.match(/(?:^|[?&])q=([^&]+)/i)?.[1];
    const language = url.searchParams.get("hl")?.match(/^[A-Za-z]{2}/)?.[0]?.toLowerCase() ?? "en";
    if (rawQuery) return `${accountScope}apify|google_news|${language}|${rawQuery.toLowerCase()}`;
  }
  const identity = input.username ?? input.sourceUrl ?? input.input;
  return `${accountScope}${input.provider}|${input.kind}|${identity}`.toLowerCase().replace(/\/+$/, "");
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullable(value) {
  return value == null ? "NULL" : q(value);
}
