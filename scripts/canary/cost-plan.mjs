const HOURS_PER_UTC_DAY = 24;
const USD_PRECISION = 6;

export const CANARY_COLLECTION_PLAN = Object.freeze({
  actorMinimumRunChargeUsd: 0.02,
  actorStartChargeUsd: 0.00005,
  accountDailyCeilingUsd: 0.25,
  globalDailyCeilingUsd: 0.5
});

export const CANARY_X_PLAN = Object.freeze({
  feedIndex: 2,
  maxItems: 1,
  refreshHours: 6,
  freshnessHours: 7
});

export const CANARY_GOOGLE_NEWS_PLAN = Object.freeze({
  feedIndex: 4,
  maxItems: 1,
  refreshHours: 6,
  freshnessHours: 7,
  maximumAttemptsPerRefresh: 2
});

export const CANARY_LLM_PLAN = Object.freeze({
  accountCount: 50,
  staticFixtureMessagesPerAccount: 6,
  hourlyFixtureRotationHours: 1,
  dailyFixtureRotationHours: 4,
  hourlyEditionsPerAccountPerUtcDay: 24,
  dailyEditionsPerAccountPerUtcDay: 1,
  summaryCallsPerMessage: 1,
  importanceReviewCallsPerMessage: 1,
  eventReviewCallsPerMessage: 2,
  maximumLocalizationSummaryCallsPerEdition: 10,
  controlledLocalizationSummaryCallsPerEdition: 0,
  editionAttemptsPerEdition: 2,
  accountDailyCeilingUsd: 0.75,
  accountMonthlyCeilingUsd: 3,
  globalDailyCeilingUsd: 38,
  globalMonthlyCeilingUsd: 150,
  minimumMonthlyRunwayDays: 4,
  minimumHeadroomRatio: 0.25,
  purposes: Object.freeze({
    summary: Object.freeze({
      inputTokenVar: "OPENAI_SUMMARY_MAX_INPUT_TOKENS",
      outputTokenVar: "OPENAI_SUMMARY_MAX_OUTPUT_TOKENS"
    }),
    importanceReview: Object.freeze({
      inputTokenVar: "OPENAI_IMPORTANCE_REVIEW_MAX_INPUT_TOKENS",
      outputTokenVar: "OPENAI_REVIEW_MAX_OUTPUT_TOKENS"
    }),
    eventReview: Object.freeze({
      inputTokenVar: "OPENAI_EVENT_REVIEW_MAX_INPUT_TOKENS",
      outputTokenVar: "OPENAI_REVIEW_MAX_OUTPUT_TOKENS"
    }),
    editionSummary: Object.freeze({
      inputTokenVar: "OPENAI_EDITION_MAX_INPUT_TOKENS",
      outputTokenVar: "OPENAI_EDITION_MAX_OUTPUT_TOKENS"
    })
  })
});

export function canaryXMaximumDailyReservationUsd(pricePerThousandUsd) {
  return dailyProviderReservation({
    pricesPerThousandUsd: [pricePerThousandUsd],
    maxItems: CANARY_X_PLAN.maxItems,
    refreshHours: CANARY_X_PLAN.refreshHours
  });
}

export function canaryGoogleNewsMaximumDailyReservationUsd(
  primaryPricePerThousandUsd,
  fallbackPricePerThousandUsd
) {
  return dailyProviderReservation({
    pricesPerThousandUsd: [primaryPricePerThousandUsd, fallbackPricePerThousandUsd],
    maxItems: CANARY_GOOGLE_NEWS_PLAN.maxItems,
    refreshHours: CANARY_GOOGLE_NEWS_PLAN.refreshHours
  });
}

export function assertCanaryCollectionCostPlan(input) {
  assertDailyPaidFeed(CANARY_X_PLAN, "X");
  assertDailyPaidFeed(CANARY_GOOGLE_NEWS_PLAN, "Google News");

  const xMaximumDailyUsd = canaryXMaximumDailyReservationUsd(
    input.xPricePerThousandUsd
  );
  const googleNewsMaximumDailyUsd = canaryGoogleNewsMaximumDailyReservationUsd(
    input.googleNewsPricePerThousandUsd,
    input.googleNewsFallbackPricePerThousandUsd
  );
  for (const [label, maximumDailyUsd] of [
    ["X", xMaximumDailyUsd],
    ["Google News", googleNewsMaximumDailyUsd]
  ]) {
    if (maximumDailyUsd > CANARY_COLLECTION_PLAN.accountDailyCeilingUsd) {
      throw new Error(
        `Canary ${label} plan can reserve $${maximumDailyUsd}/day, above the account ceiling.`
      );
    }
  }
  const maximumDailyUsd = rounded(xMaximumDailyUsd + googleNewsMaximumDailyUsd);
  if (maximumDailyUsd > CANARY_COLLECTION_PLAN.globalDailyCeilingUsd) {
    throw new Error(
      `Canary paid-source plan can reserve $${maximumDailyUsd}/day, above the global collection ceiling.`
    );
  }
  return {
    xMaximumDailyUsd,
    googleNewsMaximumDailyUsd,
    maximumDailyUsd
  };
}

export function assertCanaryXCostPlan(pricePerThousandUsd) {
  const result = assertCanaryCollectionCostPlan({
    xPricePerThousandUsd: pricePerThousandUsd,
    googleNewsPricePerThousandUsd: 0.5,
    googleNewsFallbackPricePerThousandUsd: 1.5
  });
  return { maximumDailyUsd: result.xMaximumDailyUsd };
}

export function canaryLlmMaximumDailyReservationUsd(vars) {
  const prices = {
    input: positiveNumber(
      vars?.OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS,
      "OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS"
    ),
    output: positiveNumber(
      vars?.OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS,
      "OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS"
    )
  };
  const purposeCosts = Object.fromEntries(
    Object.entries(CANARY_LLM_PLAN.purposes).map(([purpose, plan]) => [
      purpose,
      llmReservationUsd({
        inputTokens: positiveInteger(vars?.[plan.inputTokenVar], plan.inputTokenVar),
        outputTokens: positiveInteger(vars?.[plan.outputTokenVar], plan.outputTokenVar),
        inputPricePerMillionUsd: prices.input,
        outputPricePerMillionUsd: prices.output
      })
    ])
  );
  const messagesPerAccount =
    CANARY_LLM_PLAN.staticFixtureMessagesPerAccount +
    HOURS_PER_UTC_DAY / CANARY_LLM_PLAN.hourlyFixtureRotationHours +
    HOURS_PER_UTC_DAY / CANARY_LLM_PLAN.dailyFixtureRotationHours;
  const editionsPerAccount =
    CANARY_LLM_PLAN.hourlyEditionsPerAccountPerUtcDay +
    CANARY_LLM_PLAN.dailyEditionsPerAccountPerUtcDay;
  const messageReservationUsd =
    purposeCosts.summary * CANARY_LLM_PLAN.summaryCallsPerMessage +
    purposeCosts.importanceReview * CANARY_LLM_PLAN.importanceReviewCallsPerMessage +
    purposeCosts.eventReview * CANARY_LLM_PLAN.eventReviewCallsPerMessage;
  const perAccountMaximumDailyUsd = rounded(
    messagesPerAccount * messageReservationUsd +
    editionsPerAccount *
      (
        CANARY_LLM_PLAN.editionAttemptsPerEdition *
          purposeCosts.editionSummary +
        CANARY_LLM_PLAN.controlledLocalizationSummaryCallsPerEdition *
          purposeCosts.summary
      )
  );
  return {
    prices,
    purposeCosts,
    messagesPerAccount,
    editionsPerAccount,
    messageReservationUsd: rounded(messageReservationUsd),
    perAccountMaximumDailyUsd,
    cohortMaximumDailyUsd: rounded(
      perAccountMaximumDailyUsd * CANARY_LLM_PLAN.accountCount
    )
  };
}

export function assertCanaryLlmCostPlan(vars) {
  const result = canaryLlmMaximumDailyReservationUsd(vars);
  const accountHeadroomRatio =
    CANARY_LLM_PLAN.accountDailyCeilingUsd / result.perAccountMaximumDailyUsd - 1;
  const globalHeadroomRatio =
    CANARY_LLM_PLAN.globalDailyCeilingUsd / result.cohortMaximumDailyUsd - 1;
  if (accountHeadroomRatio < CANARY_LLM_PLAN.minimumHeadroomRatio) {
    throw new Error(
      `Canary LLM plan has only ${(accountHeadroomRatio * 100).toFixed(2)}% account headroom.`
    );
  }
  if (globalHeadroomRatio < CANARY_LLM_PLAN.minimumHeadroomRatio) {
    throw new Error(
      `Canary LLM plan has only ${(globalHeadroomRatio * 100).toFixed(2)}% global headroom.`
    );
  }
  const requiredAccountMonthlyRunwayUsd =
    result.perAccountMaximumDailyUsd *
    CANARY_LLM_PLAN.minimumMonthlyRunwayDays *
    (1 + CANARY_LLM_PLAN.minimumHeadroomRatio);
  const requiredGlobalMonthlyRunwayUsd =
    result.cohortMaximumDailyUsd *
    CANARY_LLM_PLAN.minimumMonthlyRunwayDays *
    (1 + CANARY_LLM_PLAN.minimumHeadroomRatio);
  if (CANARY_LLM_PLAN.accountMonthlyCeilingUsd < requiredAccountMonthlyRunwayUsd) {
    throw new Error("Canary LLM account monthly ceiling lacks the required retry runway.");
  }
  if (CANARY_LLM_PLAN.globalMonthlyCeilingUsd < requiredGlobalMonthlyRunwayUsd) {
    throw new Error("Canary LLM global monthly ceiling lacks the required retry runway.");
  }
  return {
    ...result,
    accountHeadroomRatio,
    globalHeadroomRatio,
    requiredAccountMonthlyRunwayUsd,
    requiredGlobalMonthlyRunwayUsd
  };
}

function dailyProviderReservation(input) {
  const prices = input.pricesPerThousandUsd.map((price, index) =>
    positiveNumber(price, `provider attempt ${index + 1} price`)
  );
  const perRefreshUsd = prices.reduce(
    (sum, price) => sum + Math.max(
      CANARY_COLLECTION_PLAN.actorMinimumRunChargeUsd,
      CANARY_COLLECTION_PLAN.actorStartChargeUsd +
        (input.maxItems / 1_000) * price
    ),
    0
  );
  const runsPerDay = Math.ceil(HOURS_PER_UTC_DAY / input.refreshHours);
  return rounded(perRefreshUsd * runsPerDay);
}

function assertDailyPaidFeed(plan, label) {
  if (plan.feedIndex % 2 !== 0) {
    throw new Error(`Canary ${label} must be assigned to a daily feed.`);
  }
  if (plan.freshnessHours <= plan.refreshHours) {
    throw new Error(
      `Canary ${label} freshness allowance must exceed its refresh interval.`
    );
  }
}

function llmReservationUsd(input) {
  return rounded(
    (
      input.inputTokens * input.inputPricePerMillionUsd +
      input.outputTokens * input.outputPricePerMillionUsd
    ) / 1_000_000
  );
}

function positiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function rounded(value) {
  return Number(value.toFixed(USD_PRECISION));
}
