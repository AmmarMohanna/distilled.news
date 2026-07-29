#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertApifyCapacity,
  assertReviewedActor,
  reviewedActors,
  verifyApifyReadiness
} from "../lib/apify-readiness.mjs";

const now = new Date("2026-07-29T12:00:00.000Z");
const environment = {
  vars: {
    GLOBAL_COLLECTION_MONTHLY_BUDGET_USD: "25",
    PROVIDER_X_ENABLED: "true",
    PROVIDER_GOOGLE_NEWS_ENABLED: "true",
    PROVIDER_LINKEDIN_ENABLED: "false",
    PROVIDER_GENERIC_APIFY_ENABLED: "false",
    APIFY_EXPECTED_USER_ID: "production-user-id",
    APIFY_EXPECTED_PLAN_TIER: "BRONZE",
    APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD: "29",
    APIFY_X_ACTOR_ID: "xquik/x-tweet-scraper",
    APIFY_X_ACTOR_BUILD: "1.1.3",
    APIFY_X_PRICE_USD_PER_1000_RESULTS: "0.15",
    APIFY_GOOGLE_NEWS_ACTOR_ID: "groupoject/google-news-scraper",
    APIFY_GOOGLE_NEWS_ACTOR_BUILD: "1.1.1",
    APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS: "0.50",
    APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_ID: "solidcode/google-news-scraper",
    APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD: "1.0.10",
    APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS: "1.20"
  }
};

const limits = {
  monthlyUsageCycle: {
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: "2026-08-01T00:00:00.000Z"
  },
  limits: { maxMonthlyUsageUsd: 29 },
  current: { monthlyUsageUsd: 2.5 }
};
const user = {
  id: "production-user-id",
  plan: { tier: "BRONZE" },
  effectivePlatformFeatures: {
    ACTORS: { isEnabled: true },
    ACTORS_PUBLIC_ALL: { isEnabled: true }
  }
};
const actorFixtures = new Map([
  ["xquik~x-tweet-scraper", actorFixture({
    id: "actor-x",
    username: "xquik",
    name: "x-tweet-scraper",
    build: "1.1.3",
    eventPrice: { eventTieredPricingUsd: { BRONZE: { tieredEventPriceUsd: 0.00015 } } }
  })],
  ["groupoject~google-news-scraper", actorFixture({
    id: "actor-google",
    username: "groupoject",
    name: "google-news-scraper",
    build: "1.1.1",
    eventPrice: { eventPriceUsd: 0.0005 }
  })],
  ["solidcode~google-news-scraper", actorFixture({
    id: "actor-google-fallback",
    username: "solidcode",
    name: "google-news-scraper",
    build: "1.0.10",
    eventPrice: { eventTieredPricingUsd: { BRONZE: { tieredEventPriceUsd: 0.0012 } } }
  })]
]);

{
  const requests = [];
  const result = await verifyApifyReadiness(environment, {
    token: "apify_api_test_token_1234567890",
    now,
    fetcher: async (url, init) => {
      requests.push({ url, init });
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/me/limits")) return jsonResponse(limits);
      if (parsed.pathname.endsWith("/users/me")) return jsonResponse(user);
      const actorName = decodeURIComponent(parsed.pathname.split("/")[3]);
      const fixture = actorFixtures.get(actorName);
      assert.ok(fixture, `unexpected actor request ${actorName}`);
      return jsonResponse(parsed.pathname.endsWith("/builds") ? fixture.builds : fixture.details);
    }
  });

  assert.equal(result.maxMonthlyUsageUsd, 29);
  assert.equal(result.remainingMonthlyUsageUsd, 26.5);
  assert.equal(result.userId, "production-user-id");
  assert.equal(result.planTier, "BRONZE");
  assert.deepEqual(
    result.actors.map((actor) => actor.build).sort(),
    ["1.0.10", "1.1.1", "1.1.3"]
  );
  assert.equal(requests.length, 8);
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.authorization, "Bearer apify_api_test_token_1234567890");
    assert.ok(!request.url.includes("token="));
  }
}

await assert.rejects(
  verifyApifyReadiness(environment, {
    token: "apify_api_test_token_1234567890",
    now,
    fetcher: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/me/limits")) return jsonResponse(limits);
      if (parsed.pathname.endsWith("/users/me")) {
        return jsonResponse({ ...user, id: "wrong-user-id" });
      }
      throw new Error("actor requests must not run for a mismatched account");
    }
  }),
  /does not match the reviewed account identity/
);

await assert.rejects(
  verifyApifyReadiness(environment, {
    token: "apify_api_test_token_1234567890",
    now,
    fetcher: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/me/limits")) return jsonResponse(limits);
      if (parsed.pathname.endsWith("/users/me")) {
        return jsonResponse({ ...user, plan: { tier: "FREE" } });
      }
      throw new Error("actor requests must not run for a mismatched tier");
    }
  }),
  /does not match the reviewed BRONZE tier/
);

await assert.rejects(
  verifyApifyReadiness({
    vars: {
      ...environment.vars,
      APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD: "30"
    }
  }, {
    token: "apify_api_test_token_1234567890",
    now,
    fetcher: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/me/limits")) return jsonResponse(limits);
      if (parsed.pathname.endsWith("/users/me")) return jsonResponse(user);
      throw new Error("actor requests must not run for a mismatched account limit");
    }
  }),
  /does not match the reviewed \$30.00 account limit/
);

assert.throws(
  () => assertApifyCapacity(
    { ...limits, limits: { maxMonthlyUsageUsd: 24.99 } },
    25,
    now
  ),
  /maxMonthlyUsageUsd/
);
assert.throws(
  () => assertApifyCapacity(
    { ...limits, current: { monthlyUsageUsd: 4.01 } },
    25,
    now
  ),
  /remaining monthly headroom/
);
assert.throws(
  () => assertApifyCapacity(
    {
      ...limits,
      monthlyUsageCycle: {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-07-01T00:00:00.000Z"
      }
    },
    25,
    now
  ),
  /non-current monthly usage cycle/
);

{
  const actor = reviewedActors(environment).find((candidate) => candidate.label === "X");
  const fixture = structuredClone(actorFixtures.get("xquik~x-tweet-scraper"));
  fixture.details.pricingInfos[0].pricingPerEvent.actorChargeEvents.results
    .eventTieredPricingUsd.BRONZE.tieredEventPriceUsd = 0.0002;
  assert.throws(
    () => assertReviewedActor({
      actor,
      details: fixture.details,
      builds: fixture.builds,
      planTier: "BRONZE",
      now
    }),
    /not the reviewed/
  );
}

{
  const actor = reviewedActors(environment).find((candidate) => candidate.label === "X");
  const fixture = structuredClone(actorFixtures.get("xquik~x-tweet-scraper"));
  fixture.builds.items[0].status = "FAILED";
  assert.throws(
    () => assertReviewedActor({
      actor,
      details: fixture.details,
      builds: fixture.builds,
      planTier: "FREE",
      now
    }),
    /missing or not a succeeded build/
  );
}

assert.throws(
  () => reviewedActors({
    vars: {
      ...environment.vars,
      PROVIDER_LINKEDIN_ENABLED: "true"
    }
  }),
  /LinkedIn cannot be enabled/
);
await assert.rejects(
  verifyApifyReadiness(environment, {
    token: "not-valid",
    now,
    fetcher: () => {
      throw new Error("must not fetch");
    }
  }),
  /APIFY_API_TOKEN/
);
assert.deepEqual(
  await verifyApifyReadiness({
    vars: {
      GLOBAL_COLLECTION_MONTHLY_BUDGET_USD: "0",
      PROVIDER_X_ENABLED: "false",
      PROVIDER_GOOGLE_NEWS_ENABLED: "false",
      PROVIDER_LINKEDIN_ENABLED: "false",
      PROVIDER_GENERIC_APIFY_ENABLED: "false"
    }
  }),
  {
    skipped: true,
    reason: "No Apify-backed provider is enabled.",
    monthlyCollectionCapUsd: 0,
    actors: []
  }
);

console.log("Apify capacity, account capability, actor build, and plan-tier price assertions passed.");

function actorFixture({ id, username, name, build, eventPrice }) {
  return {
    details: {
      id,
      username,
      name,
      isPublic: true,
      pricingInfos: [
        {
          pricingModel: "PAY_PER_EVENT",
          startedAt: "2026-07-01T00:00:00.000Z",
          pricingPerEvent: {
            actorChargeEvents: {
              "apify-actor-start": {
                eventPriceUsd: 0.00005
              },
              results: {
                isPrimaryEvent: true,
                ...eventPrice
              }
            }
          }
        }
      ]
    },
    builds: {
      items: [
        {
          id: `build-${id}`,
          actId: id,
          buildNumber: build,
          status: "SUCCEEDED"
        }
      ]
    }
  };
}

function jsonResponse(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
