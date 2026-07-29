#!/usr/bin/env node

import {
  assertIsolatedStaging,
  combinedEnvironment,
  d1Binding,
  environmentConfig,
  readWorkerConfig,
  usableValue
} from "../lib/release-config.mjs";

const config = readWorkerConfig();
const staging = environmentConfig(config, "staging");
assertIsolatedStaging(config);
const values = combinedEnvironment("staging");
const token = values.get("CLOUDFLARE_API_TOKEN");
const accountId = staging.vars?.CLOUDFLARE_ACCOUNT_ID;
const databaseId = d1Binding(staging).database_id;
const scriptName = staging.name;
const baseUrl = String(staging.vars?.PUBLIC_WEB_BASE_URL ?? "").replace(/\/+$/, "");
const expectedReleaseSha = String(process.env.RELEASE_SHA ?? "").trim().toLowerCase();
const requestCount = integerArgument("--requests", 500, 1, 20_000);
const concurrency = integerArgument("--concurrency", 25, 1, 200);
const settleSeconds = integerArgument("--settle-seconds", 180, 0, 600);
const maxRowsPerRequest = numberArgument("--max-d1-rows-per-request", 10, 0);
const maxReadQueriesPerRequest = numberArgument("--max-d1-read-queries-per-request", 0.25, 0);

for (const [label, value] of [
  ["CLOUDFLARE_API_TOKEN", token],
  ["CLOUDFLARE_ACCOUNT_ID", accountId],
  ["staging D1 database ID", databaseId],
  ["staging Worker script name", scriptName],
  ["staging public URL", baseUrl]
]) {
  if (!usableValue(value)) throw new Error(`${label} is required.`);
}
if (!/^[a-f0-9]{40}$/.test(expectedReleaseSha)) {
  throw new Error("RELEASE_SHA must be the exact full staging release commit.");
}

const startedAt = new Date();
await assertLiveRelease();
const before = await metricsSnapshot(startedAt);
const routes = await discoverRoutes();
const outcomes = new Map();
let nextRequest = 0;
let failures = 0;

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (true) {
    const index = nextRequest++;
    if (index >= requestCount) return;
    const path = routes[index % routes.length];
    const response = await fetch(new URL(path, baseUrl), {
      headers: {
        accept: path === "/sitemap.xml" ? "application/xml" : "application/json",
        "user-agent": "distilled-public-edge-cost-test/1"
      },
      redirect: "error"
    }).catch(() => null);
    if (!response?.ok) {
      failures += 1;
      continue;
    }
    const outcome = response.headers.get("x-distilled-cache") ?? "UNREPORTED";
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    await response.arrayBuffer();
  }
}));

const loadFinishedAt = new Date();
let after = await metricsSnapshot(new Date());
const deadline = Date.now() + settleSeconds * 1000;
while (
  Date.now() < deadline &&
  after.workers.requests - before.workers.requests < requestCount - failures
) {
  await delay(Math.min(15_000, Math.max(1_000, deadline - Date.now())));
  after = await metricsSnapshot(new Date());
}

const delta = {
  workerInvocations: after.workers.requests - before.workers.requests,
  workerErrors: after.workers.errors - before.workers.errors,
  d1RowsRead: after.d1.rowsRead - before.d1.rowsRead,
  d1ReadQueries: after.d1.readQueries - before.d1.readQueries,
  d1WriteQueries: after.d1.writeQueries - before.d1.writeQueries
};
const successfulRequests = requestCount - failures;
const ratios = {
  d1RowsReadPerRequest: successfulRequests > 0 ? delta.d1RowsRead / successfulRequests : null,
  d1ReadQueriesPerRequest: successfulRequests > 0 ? delta.d1ReadQueries / successfulRequests : null
};
const report = {
  schemaVersion: 1,
  environment: "staging",
  releaseSha: expectedReleaseSha,
  scriptName,
  databaseId,
  startedAt: startedAt.toISOString(),
  loadFinishedAt: loadFinishedAt.toISOString(),
  metricsCapturedAt: new Date().toISOString(),
  requestCount,
  successfulRequests,
  failures,
  concurrency,
  routes,
  cacheOutcomes: Object.fromEntries([...outcomes.entries()].sort()),
  before,
  after,
  delta,
  ratios,
  thresholds: {
    maxRowsPerRequest,
    maxReadQueriesPerRequest
  },
  attributionNote:
    "GraphQL metrics are account telemetry. Concurrent staging traffic and the minute scheduler are included in the delta."
};
console.log(JSON.stringify(report, null, 2));

const violations = [];
if (failures > 0) violations.push(`${failures} HTTP requests failed`);
if (delta.workerInvocations <= 0) violations.push("Worker invocation telemetry did not advance");
if ((outcomes.get("HIT") ?? 0) + (outcomes.get("COALESCED") ?? 0) === 0) {
  violations.push("no Cache API hit or coalesced response was observed");
}
if (ratios.d1RowsReadPerRequest === null || ratios.d1RowsReadPerRequest > maxRowsPerRequest) {
  violations.push(`D1 rows read/request exceeded ${maxRowsPerRequest}`);
}
if (ratios.d1ReadQueriesPerRequest === null ||
  ratios.d1ReadQueriesPerRequest > maxReadQueriesPerRequest) {
  violations.push(`D1 read queries/request exceeded ${maxReadQueriesPerRequest}`);
}
if (violations.length > 0) {
  throw new Error(`Public edge cost gate failed:\n- ${violations.join("\n- ")}`);
}

async function assertLiveRelease() {
  const response = await fetch(new URL("/api/status", baseUrl), {
    headers: {
      accept: "application/json",
      "user-agent": "distilled-public-edge-cost-test/1"
    },
    redirect: "error"
  });
  const payload = await response.json().catch(() => ({}));
  if (
    !response.ok ||
    payload.status !== "operational" ||
    payload.releaseSha !== expectedReleaseSha
  ) {
    throw new Error("Public edge cost gate requires the exact operational staging release SHA.");
  }
}

async function discoverRoutes() {
  const routes = ["/api/status", "/api/capabilities", "/api/explore/feeds", "/sitemap.xml"];
  const explore = await fetch(new URL("/api/explore/feeds", baseUrl), {
    headers: { accept: "application/json", "user-agent": "distilled-public-edge-cost-test/1" }
  });
  if (!explore.ok) throw new Error(`Could not discover a public feed: HTTP ${explore.status}`);
  const payload = await explore.json();
  const feed = Array.isArray(payload?.feeds) ? payload.feeds[0] : undefined;
  if (!feed?.ownerUsername || !feed?.slug) {
    throw new Error("Staging must expose at least one non-canary public feed for the edge cost test.");
  }
  const feedPath = `/api/feed/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}`;
  routes.push(feedPath, `${feedPath}/search?q=release`);
  const feedResponse = await fetch(new URL(feedPath, baseUrl), {
    headers: { accept: "application/json", "user-agent": "distilled-public-edge-cost-test/1" }
  });
  if (!feedResponse.ok) throw new Error(`Could not inspect the public feed: HTTP ${feedResponse.status}`);
  const feedPayload = await feedResponse.json();
  const editionId = Array.isArray(feedPayload?.editions) ? feedPayload.editions[0]?.id : undefined;
  if (editionId) routes.push(`${feedPath}/editions/${encodeURIComponent(editionId)}`);
  return routes;
}

async function metricsSnapshot(now) {
  const date = now.toISOString().slice(0, 10);
  const datetimeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      query: `query PublicEdgeCost(
        $accountTag: string!,
        $databaseId: string!,
        $date: Date,
        $scriptName: string!,
        $datetimeStart: string!,
        $datetimeEnd: string!
      ) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 1000,
              filter: { date_geq: $date, date_leq: $date, databaseId: $databaseId }
            ) {
              sum { rowsRead readQueries writeQueries }
            }
            workersInvocationsAdaptive(
              limit: 10000,
              filter: {
                scriptName: $scriptName,
                datetime_geq: $datetimeStart,
                datetime_leq: $datetimeEnd
              }
            ) {
              sum { requests errors }
            }
          }
        }
      }`,
      variables: {
        accountTag: accountId,
        databaseId,
        date,
        scriptName,
        datetimeStart,
        datetimeEnd: now.toISOString()
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Cloudflare GraphQL metrics failed: HTTP ${response.status} ${JSON.stringify(payload.errors ?? [])}`);
  }
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("Cloudflare GraphQL returned no account metrics.");
  return {
    d1: sumGroups(account.d1AnalyticsAdaptiveGroups, ["rowsRead", "readQueries", "writeQueries"]),
    workers: sumGroups(account.workersInvocationsAdaptive, ["requests", "errors"])
  };
}

function sumGroups(groups, fields) {
  return Object.fromEntries(fields.map((field) => [
    field,
    (groups ?? []).reduce((total, group) => total + Number(group?.sum?.[field] ?? 0), 0)
  ]));
}

function integerArgument(name, fallback, minimum, maximum) {
  const value = numberArgument(name, fallback, minimum);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function numberArgument(name, fallback, minimum) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a number greater than or equal to ${minimum}.`);
  }
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
