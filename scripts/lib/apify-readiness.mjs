const APIFY_API_ROOT = "https://api.apify.com/v2";
const REVIEWED_ACTOR_START_CHARGE_USD = 0.00005;
const REQUEST_TIMEOUT_MS = 10_000;
const PRICE_TOLERANCE_USD = 1e-9;

export async function verifyApifyReadiness(environment, options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Apify readiness requires a valid current time.");

  const monthlyCollectionCapUsd = finiteNonnegativeNumber(
    environment.vars?.GLOBAL_COLLECTION_MONTHLY_BUDGET_USD,
    "GLOBAL_COLLECTION_MONTHLY_BUDGET_USD"
  );
  const actors = reviewedActors(environment);
  if (actors.length === 0) {
    return {
      skipped: true,
      reason: "No Apify-backed provider is enabled.",
      monthlyCollectionCapUsd,
      actors: []
    };
  }
  if (monthlyCollectionCapUsd === 0) {
    throw new Error("GLOBAL_COLLECTION_MONTHLY_BUDGET_USD must be positive while Apify providers are enabled.");
  }
  const expectedUserId = requiredApifyUserId(environment.vars?.APIFY_EXPECTED_USER_ID);
  const expectedPlanTier = requiredApifyPlanTier(environment.vars?.APIFY_EXPECTED_PLAN_TIER);
  const expectedMaxMonthlyUsageUsd = positiveNumber(
    environment.vars?.APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD,
    "APIFY_EXPECTED_MAX_MONTHLY_USAGE_USD"
  );

  const token = String(options.readinessToken ?? options.token ?? "").trim();
  if (token.length < 20 || /[<>\s]/.test(token)) {
    throw new Error(
      "APIFY_READINESS_TOKEN or APIFY_API_TOKEN must be available from the protected environment."
    );
  }

  const [limits, user] = await Promise.all([
    apifyJson("/users/me/limits", token, fetcher),
    apifyJson("/users/me", token, fetcher)
  ]);
  const capacity = assertApifyCapacity(
    limits,
    monthlyCollectionCapUsd,
    now,
    expectedMaxMonthlyUsageUsd
  );
  const account = assertApifyAccountCapability(user, { expectedUserId, expectedPlanTier });
  const planTier = account.planTier;

  const actorEvidence = await Promise.all(actors.map(async (actor) => {
    const actorPath = `/actors/${apifyActorPath(actor.actorId)}`;
    const [details, builds] = await Promise.all([
      apifyJson(actorPath, token, fetcher),
      apifyJson(`${actorPath}/builds?limit=1000&desc=1`, token, fetcher)
    ]);
    return assertReviewedActor({ actor, details, builds, planTier, now });
  }));

  return {
    skipped: false,
    monthlyCollectionCapUsd,
    maxMonthlyUsageUsd: capacity.maxMonthlyUsageUsd,
    currentMonthlyUsageUsd: capacity.currentMonthlyUsageUsd,
    remainingMonthlyUsageUsd: capacity.remainingMonthlyUsageUsd,
    usageCycleEndsAt: capacity.usageCycleEndsAt,
    userId: account.userId,
    planTier,
    actors: actorEvidence
  };
}

export function reviewedActors(environment) {
  const vars = environment.vars ?? {};
  const actors = [];

  if (vars.PROVIDER_X_ENABLED === "true") {
    actors.push(reviewedActor(
      "X",
      vars.APIFY_X_ACTOR_ID,
      vars.APIFY_X_ACTOR_BUILD,
      vars.APIFY_X_PRICE_USD_PER_1000_RESULTS
    ));
  }
  if (vars.PROVIDER_GOOGLE_NEWS_ENABLED === "true") {
    actors.push(
      reviewedActor(
        "Google News",
        vars.APIFY_GOOGLE_NEWS_ACTOR_ID,
        vars.APIFY_GOOGLE_NEWS_ACTOR_BUILD,
        vars.APIFY_GOOGLE_NEWS_PRICE_USD_PER_1000_RESULTS
      ),
      reviewedActor(
        "Google News fallback",
        vars.APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_ID,
        vars.APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_BUILD,
        vars.APIFY_GOOGLE_NEWS_FALLBACK_PRICE_USD_PER_1000_RESULTS
      )
    );
  }
  if (vars.PROVIDER_LINKEDIN_ENABLED === "true") {
    throw new Error("LinkedIn cannot be enabled until its Apify actor builds and prices are reviewed.");
  }
  if (vars.PROVIDER_GENERIC_APIFY_ENABLED === "true") {
    throw new Error("Generic Apify cannot be enabled in hosted mode without an actor-specific build and price review.");
  }

  const contracts = new Map();
  for (const actor of actors) {
    const existing = contracts.get(actor.actorId);
    if (
      existing &&
      (existing.build !== actor.build || existing.priceUsdPer1000Results !== actor.priceUsdPer1000Results)
    ) {
      throw new Error(`Conflicting reviewed contracts are configured for Apify actor ${actor.actorId}.`);
    }
    contracts.set(actor.actorId, actor);
  }
  return [...contracts.values()];
}

export function assertApifyCapacity(
  limits,
  monthlyCollectionCapUsd,
  now = new Date(),
  expectedMaxMonthlyUsageUsd
) {
  const maxMonthlyUsageUsd = finiteNonnegativeNumber(
    limits?.limits?.maxMonthlyUsageUsd,
    "Apify maxMonthlyUsageUsd"
  );
  const currentMonthlyUsageUsd = finiteNonnegativeNumber(
    limits?.current?.monthlyUsageUsd,
    "Apify current monthlyUsageUsd"
  );
  const cycleStart = Date.parse(limits?.monthlyUsageCycle?.startAt);
  const cycleEnd = Date.parse(limits?.monthlyUsageCycle?.endAt);
  if (
    !Number.isFinite(cycleStart) ||
    !Number.isFinite(cycleEnd) ||
    cycleStart > now.getTime() ||
    cycleEnd < now.getTime() ||
    cycleEnd <= cycleStart
  ) {
    throw new Error("Apify returned an invalid or non-current monthly usage cycle.");
  }

  const remainingMonthlyUsageUsd = maxMonthlyUsageUsd - currentMonthlyUsageUsd;
  if (
    expectedMaxMonthlyUsageUsd !== undefined &&
    Math.abs(maxMonthlyUsageUsd - expectedMaxMonthlyUsageUsd) > PRICE_TOLERANCE_USD
  ) {
    throw new Error(
      `Apify maxMonthlyUsageUsd $${maxMonthlyUsageUsd.toFixed(2)} does not match the reviewed ` +
      `$${expectedMaxMonthlyUsageUsd.toFixed(2)} account limit.`
    );
  }
  if (maxMonthlyUsageUsd + PRICE_TOLERANCE_USD < monthlyCollectionCapUsd) {
    throw new Error(
      `Apify maxMonthlyUsageUsd $${maxMonthlyUsageUsd.toFixed(2)} is below the configured $${monthlyCollectionCapUsd.toFixed(2)} collection cap.`
    );
  }
  if (remainingMonthlyUsageUsd + PRICE_TOLERANCE_USD < monthlyCollectionCapUsd) {
    throw new Error(
      `Apify remaining monthly headroom $${Math.max(0, remainingMonthlyUsageUsd).toFixed(2)} is below the configured $${monthlyCollectionCapUsd.toFixed(2)} collection cap.`
    );
  }

  return {
    maxMonthlyUsageUsd,
    currentMonthlyUsageUsd,
    remainingMonthlyUsageUsd,
    usageCycleEndsAt: new Date(cycleEnd).toISOString()
  };
}

export function assertReviewedActor({ actor, details, builds, planTier, now = new Date() }) {
  const expectedActorPath = actor.actorId.replace("/", "~").toLowerCase();
  const actualActorPath = `${details?.username ?? ""}~${details?.name ?? ""}`.toLowerCase();
  if (
    details?.isPublic !== true ||
    actualActorPath !== expectedActorPath
  ) {
    throw new Error(`${actor.label} Apify actor identity/public status does not match reviewed configuration.`);
  }

  const matchingBuilds = (builds?.items ?? []).filter((build) => build?.buildNumber === actor.build);
  if (
    matchingBuilds.length !== 1 ||
    matchingBuilds[0].status !== "SUCCEEDED" ||
    !new Set([expectedActorPath, String(details.id ?? "").toLowerCase()])
      .has(String(matchingBuilds[0].actId ?? "").toLowerCase())
  ) {
    throw new Error(`${actor.label} Apify build ${actor.build} is missing or not a succeeded build.`);
  }

  const pricing = activePricingInfo(details?.pricingInfos, now);
  if (pricing.pricingModel !== "PAY_PER_EVENT") {
    throw new Error(`${actor.label} Apify pricing model is not the reviewed PAY_PER_EVENT model.`);
  }
  const events = pricing.pricingPerEvent?.actorChargeEvents;
  if (!events || typeof events !== "object") {
    throw new Error(`${actor.label} Apify pricing does not expose charge events.`);
  }
  const primaryEvents = Object.entries(events).filter(([, event]) => event?.isPrimaryEvent === true);
  if (primaryEvents.length !== 1) {
    throw new Error(`${actor.label} Apify pricing must expose exactly one primary result event.`);
  }

  const [primaryEventName, primaryEvent] = primaryEvents[0];
  const primaryPriceUsd = eventPriceForTier(primaryEvent, planTier, actor.label);
  const livePriceUsdPer1000Results = primaryPriceUsd * 1000;
  if (
    Math.abs(livePriceUsdPer1000Results - actor.priceUsdPer1000Results) > PRICE_TOLERANCE_USD
  ) {
    throw new Error(
      `${actor.label} Apify price for tier ${planTier} is $${livePriceUsdPer1000Results.toFixed(6)}/1,000, not the reviewed $${actor.priceUsdPer1000Results.toFixed(6)}/1,000.`
    );
  }

  const actorStartEvent = events["apify-actor-start"];
  if (actorStartEvent) {
    const actorStartPriceUsd = eventPriceForTier(actorStartEvent, planTier, actor.label);
    if (actorStartPriceUsd - REVIEWED_ACTOR_START_CHARGE_USD > PRICE_TOLERANCE_USD) {
      throw new Error(`${actor.label} Apify actor-start charge exceeds the reviewed reservation.`);
    }
  }

  return {
    label: actor.label,
    actorId: actor.actorId,
    build: actor.build,
    buildId: matchingBuilds[0].id,
    primaryEvent: primaryEventName,
    priceUsdPer1000Results: livePriceUsdPer1000Results,
    pricingStartedAt: pricing.startedAt
  };
}

function reviewedActor(label, actorIdValue, buildValue, priceValue) {
  const actorId = String(actorIdValue ?? "").trim();
  const build = String(buildValue ?? "").trim();
  if (!/^[a-z0-9_-]+\/[a-z0-9_-]+$/i.test(actorId)) {
    throw new Error(`${label} Apify actor ID must be a reviewed owner/name pair.`);
  }
  if (!/^(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\.(?:[1-9]\d{0,4})$/.test(build)) {
    throw new Error(`${label} Apify actor build must be an immutable build number.`);
  }
  return {
    label,
    actorId,
    build,
    priceUsdPer1000Results: positiveNumber(priceValue, `${label} price per 1,000 results`)
  };
}

function activePricingInfo(pricingInfos, now) {
  if (!Array.isArray(pricingInfos)) throw new Error("Apify actor pricing history is missing.");
  const active = pricingInfos
    .map((pricing) => ({ pricing, startedAt: Date.parse(pricing?.startedAt) }))
    .filter((candidate) =>
      Number.isFinite(candidate.startedAt) && candidate.startedAt <= now.getTime()
    )
    .sort((left, right) => right.startedAt - left.startedAt);
  if (active.length === 0) throw new Error("Apify actor has no active timestamped pricing contract.");
  return active[0].pricing;
}

function eventPriceForTier(event, planTier, actorLabel) {
  const direct = event?.eventPriceUsd;
  if (typeof direct === "number" && Number.isFinite(direct) && direct >= 0) return direct;
  const tiered = event?.eventTieredPricingUsd?.[planTier]?.tieredEventPriceUsd;
  if (typeof tiered === "number" && Number.isFinite(tiered) && tiered >= 0) return tiered;
  throw new Error(`${actorLabel} Apify pricing has no numeric price for account tier ${planTier}.`);
}

function assertApifyAccountCapability(user, { expectedUserId, expectedPlanTier }) {
  const userId = String(user?.id ?? "").trim();
  if (userId !== expectedUserId) {
    throw new Error(
      `Apify /users/me user.id ${userId || "(missing)"} does not match the reviewed account identity.`
    );
  }
  const planTier = String(user?.plan?.tier ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]*$/.test(planTier)) {
    throw new Error("Apify account plan tier is unavailable for live price resolution.");
  }
  if (planTier !== expectedPlanTier) {
    throw new Error(
      `Apify account plan tier ${planTier} does not match the reviewed ${expectedPlanTier} tier.`
    );
  }
  if (
    user?.effectivePlatformFeatures?.ACTORS?.isEnabled !== true ||
    user?.effectivePlatformFeatures?.ACTORS_PUBLIC_ALL?.isEnabled !== true
  ) {
    throw new Error("Apify account cannot run the reviewed public Actors.");
  }
  return { userId, planTier };
}

function requiredApifyUserId(value) {
  const userId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(userId)) {
    throw new Error("APIFY_EXPECTED_USER_ID must pin the reviewed /users/me user.id.");
  }
  return userId;
}

function requiredApifyPlanTier(value) {
  const planTier = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]*$/.test(planTier)) {
    throw new Error("APIFY_EXPECTED_PLAN_TIER must pin the reviewed Apify plan tier.");
  }
  return planTier;
}

async function apifyJson(path, token, fetcher) {
  let response;
  try {
    response = await fetcher(`${APIFY_API_ROOT}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "distilled-apify-readiness/1"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error(`Apify readiness read failed for ${path}.`, { cause: error });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data) {
    throw new Error(`Apify readiness read failed for ${path} with HTTP ${response.status}.`);
  }
  return payload.data;
}

function apifyActorPath(actorId) {
  return encodeURIComponent(actorId.replace("/", "~"));
}

function positiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a finite positive number.`);
  return parsed;
}

function finiteNonnegativeNumber(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`${label} must be a finite nonnegative number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a finite nonnegative number.`);
  return parsed;
}
