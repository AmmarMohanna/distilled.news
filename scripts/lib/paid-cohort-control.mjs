import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const legacyPaidSourceRetirementMarker =
  "retired during reviewed 2026-07-29 hosted paid-provider reconciliation";

export const reviewedLegacyPaidCohort = Object.freeze({
  digest: "53cd2818eae085885fc9e37991cdf8babd43ec4e296dc2605c06269a1860c0ae",
  originalPaidSourceCount: 71,
  realAccountCount: 2,
  retainedPaidSourceCount: 4,
  retiredRealSourceCount: 44,
  canaryAccounts: Object.freeze([
    ["account_canary_ar_01", "canary-ar-01"],
    ["account_canary_ar_02", "canary-ar-02"],
    ["account_canary_ar_03", "canary-ar-03"],
    ["account_canary_ar_04", "canary-ar-04"],
    ["account_canary_en_01", "canary-en-01"],
    ["account_canary_en_02", "canary-en-02"],
    ["account_canary_en_03", "canary-en-03"],
    ["account_canary_en_04", "canary-en-04"],
    ["account_canary_en_05", "canary-en-05"],
    ["account_canary_fr_01", "canary-fr-01"],
    ["account_canary_fr_02", "canary-fr-02"],
    ["account_canary_fr_03", "canary-fr-03"]
  ].map(([accountId, username]) => Object.freeze({ accountId, username })))
});

export function readProtectedPaidCohortManifest(path) {
  const resolved = resolve(path);
  const stat = statSync(resolved);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 32 * 1024) {
    throw new Error("Protected paid-cohort manifest must be a nonempty regular file under 32 KiB.");
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error("Protected paid-cohort manifest must not grant group or other permissions.");
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new Error("Protected paid-cohort manifest is not valid JSON.");
  }
  const topKeys = Object.keys(payload ?? {}).sort();
  if (
    !payload ||
    Array.isArray(payload) ||
    JSON.stringify(topKeys) !== JSON.stringify(["realAccounts", "reviewDigest", "schemaVersion"])
  ) {
    throw new Error("Protected paid-cohort manifest has an unexpected shape.");
  }
  if (
    payload.schemaVersion !== 1 ||
    payload.reviewDigest !== reviewedLegacyPaidCohort.digest ||
    !Array.isArray(payload.realAccounts) ||
    payload.realAccounts.length !== reviewedLegacyPaidCohort.realAccountCount
  ) {
    throw new Error("Protected paid-cohort manifest does not match the pinned review.");
  }
  const accountIds = new Set();
  const sourceIds = new Set();
  for (const account of payload.realAccounts) {
    const keys = Object.keys(account ?? {}).sort();
    if (
      !account ||
      Array.isArray(account) ||
      JSON.stringify(keys) !== JSON.stringify([
        "accountId",
        "googleNewsSourceId",
        "username",
        "xSourceId"
      ])
    ) {
      throw new Error("Protected paid-cohort account entry has an unexpected shape.");
    }
    for (const field of ["accountId", "username", "googleNewsSourceId", "xSourceId"]) {
      if (typeof account[field] !== "string" || account[field].length < 2 || account[field].length > 512) {
        throw new Error(`Protected paid-cohort field ${field} is invalid.`);
      }
    }
    if (account.username.startsWith("canary-")) {
      throw new Error("Protected real paid-cohort username cannot use the synthetic canary prefix.");
    }
    if (accountIds.has(account.accountId)) throw new Error("Protected paid-cohort account IDs must be unique.");
    accountIds.add(account.accountId);
    for (const field of ["googleNewsSourceId", "xSourceId"]) {
      if (sourceIds.has(account[field])) throw new Error("Protected retained source IDs must be unique.");
      sourceIds.add(account[field]);
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    reviewDigest: payload.reviewDigest,
    realAccounts: Object.freeze(payload.realAccounts.map((account) => Object.freeze({ ...account })))
  });
}

export function reviewedAccountIds(protectedManifest) {
  return [
    ...reviewedLegacyPaidCohort.canaryAccounts.map(({ accountId }) => accountId),
    ...protectedManifest.realAccounts.map(({ accountId }) => accountId)
  ];
}

export function retainedPaidSourceIds(protectedManifest) {
  return protectedManifest.realAccounts.flatMap(
    ({ googleNewsSourceId, xSourceId }) => [googleNewsSourceId, xSourceId]
  );
}

export function canonicalLegacyPaidCohort({ accounts, sources }) {
  return {
    accounts: accounts
      .map((row) => ({
        accountId: String(row.account_id),
        username: String(row.username),
        feedCount: Number(row.feed_count),
        pausedFeedCount: Number(row.paused_feed_count)
      }))
      .sort(compareBy("accountId")),
    sources: sources
      .filter((row) => isPaidKind(row.kind))
      .map((row) => ({
        accountId: String(row.account_id),
        briefingId: String(row.briefing_id),
        sourceId: String(row.source_id),
        kind: String(row.kind),
        enabled: Number(row.enabled)
      }))
      .sort(compareBy("sourceId"))
  };
}

export function legacyPaidCohortDigest(inventory) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalLegacyPaidCohort(inventory)))
    .digest("hex");
}

export function classifyLegacyPaidCohort({ accounts, sources }, protectedManifest) {
  const expectedAccounts = new Map(
    [
      ...reviewedLegacyPaidCohort.canaryAccounts,
      ...protectedManifest.realAccounts
    ].map((account) => [account.accountId, account])
  );
  const accountById = new Map(accounts.map((row) => [String(row.account_id), row]));
  for (const row of accounts) {
    const expected = expectedAccounts.get(String(row.account_id));
    if (!expected || expected.username !== row.username) {
      throw new Error("Paid-cohort inventory contains an unreviewed account.");
    }
    if (Number(row.feed_count) !== Number(row.paused_feed_count)) {
      throw new Error("Paid-cohort reconciliation requires every reviewed feed to remain paused.");
    }
  }

  const canaryPresent = reviewedLegacyPaidCohort.canaryAccounts.filter(({ accountId }) =>
    accountById.has(accountId)
  );
  const realPresent = protectedManifest.realAccounts.filter(({ accountId }) =>
    accountById.has(accountId)
  );
  if (realPresent.length !== protectedManifest.realAccounts.length) {
    throw new Error("Reviewed real paid-provider accounts are missing.");
  }
  const paidSources = sources.filter((row) => isPaidKind(row.kind));
  const retiredSources = sources.filter(
    (row) => row.kind === "apify_actor" && row.last_error === legacyPaidSourceRetirementMarker
  );
  const unexpectedRows = sources.filter(
    (row) => !isPaidKind(row.kind) &&
      !(row.kind === "apify_actor" && row.last_error === legacyPaidSourceRetirementMarker)
  );
  if (unexpectedRows.length > 0) {
    throw new Error("Paid-cohort inventory contains an unreviewed source state.");
  }

  const retainedIds = new Set(retainedPaidSourceIds(protectedManifest));
  const retainedRows = paidSources.filter((row) => retainedIds.has(String(row.source_id)));
  const unexpectedPaidRows = paidSources.filter((row) => !retainedIds.has(String(row.source_id)));
  const paidCanaryRows = paidSources.filter((row) =>
    reviewedLegacyPaidCohort.canaryAccounts.some(({ accountId }) => accountId === row.account_id)
  );
  if (retainedRows.length !== retainedIds.size) {
    throw new Error("Protected retained paid-provider mapping does not match the reviewed inventory.");
  }
  assertOnePerRealProvider(retainedRows, protectedManifest);

  if (
    canaryPresent.length === reviewedLegacyPaidCohort.canaryAccounts.length &&
    retiredSources.length === 0 &&
    paidSources.length === reviewedLegacyPaidCohort.originalPaidSourceCount
  ) {
    const digest = legacyPaidCohortDigest({ accounts, sources });
    if (digest !== reviewedLegacyPaidCohort.digest) {
      throw new Error(
        `Live paid cohort changed after review: ${digest}; expected ${reviewedLegacyPaidCohort.digest}.`
      );
    }
    return { state: "unreconciled", digest, paidSourceCount: paidSources.length, retiredSourceCount: 0 };
  }

  if (
    unexpectedPaidRows.length !== 0 ||
    paidCanaryRows.length !== 0
  ) {
    throw new Error("Paid-provider reconciliation does not match the four explicitly retained source rows.");
  }

  const expectedRetired = reviewedLegacyPaidCohort.originalPaidSourceCount - retainedIds.size;
  if (canaryPresent.length > 0 && retiredSources.length !== expectedRetired) {
    if (
      canaryPresent.length === reviewedLegacyPaidCohort.canaryAccounts.length ||
      retiredSources.length <= reviewedLegacyPaidCohort.retiredRealSourceCount ||
      retiredSources.length >= expectedRetired
    ) {
      throw new Error("Reconciled cohort has an unexpected retired-source count.");
    }
    return {
      state: "cleanup-partial",
      digest: reviewedLegacyPaidCohort.digest,
      paidSourceCount: paidSources.length,
      retiredSourceCount: retiredSources.length
    };
  }
  if (canaryPresent.length === 0) {
    const retiredCanaryRows = retiredSources.filter((row) =>
      reviewedLegacyPaidCohort.canaryAccounts.some(({ accountId }) => accountId === row.account_id)
    );
    if (
      retiredCanaryRows.length !== 0 ||
      retiredSources.length !== reviewedLegacyPaidCohort.retiredRealSourceCount
    ) {
      throw new Error("Hardened canary cleanup left an unexpected retired-source inventory.");
    }
  }

  return {
    state: canaryPresent.length === 0 ? "cleaned" : "reconciled",
    digest: reviewedLegacyPaidCohort.digest,
    paidSourceCount: paidSources.length,
    retiredSourceCount: retiredSources.length
  };
}

export function assertPaidSeatInventory(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Paid-provider seat verification returned no aggregate row.");
  }
  const row = rows[0];
  const seatCount = Number(row.seat_count);
  const paidOwnerCount = Number(row.paid_owner_count);
  const maximumGoogleNews = Number(row.max_google_news_per_account);
  const maximumX = Number(row.max_x_per_account);
  const unexpectedSeats = Number(row.unexpected_seats);
  const unexpectedPaidOwners = Number(row.unexpected_paid_owners);
  const reviewedRealSeats = Number(row.reviewed_real_seats);
  if (
    !Number.isSafeInteger(seatCount) ||
    seatCount > 4 ||
    seatCount !== paidOwnerCount ||
    paidOwnerCount !== 2 ||
    maximumGoogleNews > 1 ||
    maximumX > 1 ||
    unexpectedSeats !== 0 ||
    unexpectedPaidOwners !== 0 ||
    reviewedRealSeats !== 2
  ) {
    throw new Error(
      `Paid-provider post-migration invariant failed: ${JSON.stringify({
        seatCount,
        paidOwnerCount,
        maximumGoogleNews,
        maximumX,
        unexpectedSeats,
        unexpectedPaidOwners,
        reviewedRealSeats
      })}.`
    );
  }
  return {
    seatCount,
    paidOwnerCount,
    maximumGoogleNews,
    maximumX,
    unexpectedSeats,
    unexpectedPaidOwners,
    reviewedRealSeats
  };
}

function assertOnePerRealProvider(rows, protectedManifest) {
  for (const account of protectedManifest.realAccounts) {
    const accountRows = rows.filter((row) => row.account_id === account.accountId);
    const googleNews = accountRows.filter((row) => row.kind === "google_news");
    const x = accountRows.filter((row) => row.kind === "x_profile" || row.kind === "x_search");
    if (
      googleNews.length !== 1 ||
      x.length !== 1 ||
      googleNews[0].source_id !== account.googleNewsSourceId ||
      x[0].source_id !== account.xSourceId
    ) {
      throw new Error("Retained paid-provider sources do not match the protected review.");
    }
  }
}

function isPaidKind(kind) {
  return kind === "google_news" || kind === "x_profile" || kind === "x_search";
}

function compareBy(key) {
  return (left, right) => String(left[key]).localeCompare(String(right[key]));
}
