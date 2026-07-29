#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  assertPaidSeatInventory,
  classifyLegacyPaidCohort,
  legacyPaidSourceRetirementMarker,
  readProtectedPaidCohortManifest,
  retainedPaidSourceIds,
  reviewedLegacyPaidCohort
} from "../lib/paid-cohort-control.mjs";

const protectedManifest = {
  schemaVersion: 1,
  reviewDigest: reviewedLegacyPaidCohort.digest,
  realAccounts: [
    {
      accountId: "test-real-account-1",
      username: "test-real-1",
      googleNewsSourceId: "test-real-1-google",
      xSourceId: "test-real-1-x"
    },
    {
      accountId: "test-real-account-2",
      username: "test-real-2",
      googleNewsSourceId: "test-real-2-google",
      xSourceId: "test-real-2-x"
    }
  ]
};
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "distilled-paid-cohort-test-"));
try {
  const manifestPath = resolve(temporaryDirectory, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(protectedManifest), { mode: 0o600 });
  assert.deepEqual(readProtectedPaidCohortManifest(manifestPath), protectedManifest);
  if (process.platform !== "win32") {
    chmodSync(manifestPath, 0o644);
    assert.throws(() => readProtectedPaidCohortManifest(manifestPath), /permissions/i);
    chmodSync(manifestPath, 0o600);
  }
  writeFileSync(manifestPath, JSON.stringify({ ...protectedManifest, unexpected: true }));
  assert.throws(() => readProtectedPaidCohortManifest(manifestPath), /unexpected shape/i);
  writeFileSync(manifestPath, JSON.stringify({
    ...protectedManifest,
    reviewDigest: "0".repeat(64)
  }));
  assert.throws(() => readProtectedPaidCohortManifest(manifestPath), /pinned review/i);
} finally {
  rmSync(temporaryDirectory, { recursive: true });
}
const allAccounts = [
  ...reviewedLegacyPaidCohort.canaryAccounts,
  ...protectedManifest.realAccounts
].map(({ accountId, username }) => ({
  account_id: accountId,
  username,
  feed_count: 2,
  paused_feed_count: 2
}));
const retainedSources = protectedManifest.realAccounts.flatMap((account) => [
  {
    account_id: account.accountId,
    briefing_id: `${account.accountId}:reviewed`,
    source_id: account.googleNewsSourceId,
    kind: "google_news",
    enabled: 1,
    last_error: null
  },
  {
    account_id: account.accountId,
    briefing_id: `${account.accountId}:reviewed`,
    source_id: account.xSourceId,
    kind: "x_profile",
    enabled: 1,
    last_error: null
  }
]);
const retired = (count, accounts) => Array.from({ length: count }, (_, index) => ({
  account_id: accounts[index % accounts.length].accountId,
  briefing_id: `${accounts[index % accounts.length].accountId}:retired`,
  source_id: `retired-source-${index}`,
  kind: "apify_actor",
  enabled: 0,
  last_error: legacyPaidSourceRetirementMarker
}));

const reconciled = classifyLegacyPaidCohort({
  accounts: allAccounts,
  sources: [
    ...retainedSources,
    ...retired(67, [
      ...reviewedLegacyPaidCohort.canaryAccounts,
      ...protectedManifest.realAccounts
    ])
  ]
}, protectedManifest);
assert.equal(reconciled.state, "reconciled");
assert.equal(reconciled.paidSourceCount, 4);
assert.equal(reconciled.retiredSourceCount, 67);

const cleaned = classifyLegacyPaidCohort({
  accounts: allAccounts.filter((row) =>
    protectedManifest.realAccounts.some(({ accountId }) => accountId === row.account_id)
  ),
  sources: [
    ...retainedSources,
    ...retired(44, protectedManifest.realAccounts)
  ]
}, protectedManifest);
assert.equal(cleaned.state, "cleaned");
assert.equal(cleaned.retiredSourceCount, 44);

assert.throws(
  () => classifyLegacyPaidCohort({
    accounts: allAccounts.map((row, index) =>
      index === 0 ? { ...row, paused_feed_count: 1 } : row
    ),
    sources: retainedSources
  }, protectedManifest),
  /every reviewed feed.*paused/i
);
assert.throws(
  () => classifyLegacyPaidCohort({
    accounts: allAccounts,
    sources: retainedSources.filter(
      (row) => row.source_id !== retainedPaidSourceIds(protectedManifest)[0]
    )
  }, protectedManifest),
  /protected retained/i
);

assert.deepEqual(
  assertPaidSeatInventory([{
    seat_count: 2,
    paid_owner_count: 2,
    max_google_news_per_account: 1,
    max_x_per_account: 1,
    unexpected_seats: 0,
    unexpected_paid_owners: 0,
    reviewed_real_seats: 2
  }]),
  {
    seatCount: 2,
    paidOwnerCount: 2,
    maximumGoogleNews: 1,
    maximumX: 1,
    unexpectedSeats: 0,
    unexpectedPaidOwners: 0,
    reviewedRealSeats: 2
  }
);
assert.throws(
  () => assertPaidSeatInventory([{
    seat_count: 14,
    paid_owner_count: 14,
    max_google_news_per_account: 2,
    max_x_per_account: 1,
    unexpected_seats: 12,
    unexpected_paid_owners: 12,
    reviewed_real_seats: 2
  }]),
  /invariant failed/i
);

console.log("Validated reviewed legacy paid-cohort reconciliation and hard seat invariants.");
