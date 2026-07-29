#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildCloudflareR2Url,
  main,
  validateRetentionTarget
} from "../backup/verify-retention.mjs";

const accountId = "0123456789abcdef0123456789abcdef";
const bucketName = "distilled-news-raw-staging";
const token = "runtime-only-token_0123456789abcdef";

assert.deepEqual(
  validateRetentionTarget({
    configuredAccountId: accountId,
    configuredBucket: bucketName,
    runtimeAccountId: accountId,
    runtimeBucket: bucketName,
    runtimeToken: token
  }),
  { accountId, bucketName, token }
);

for (const fixture of [
  {
    label: "alternate account URL",
    input: { runtimeAccountId: "evil.example/path?token=1" },
    pattern: /32-character hexadecimal/
  },
  {
    label: "bucket path traversal",
    input: { runtimeBucket: "safe/../../other?token=1" },
    pattern: /valid runtime R2 bucket/
  },
  {
    label: "authorization header injection",
    input: { runtimeToken: `${token}\r\nX-Evil: yes` },
    pattern: /provided directly to this process/
  },
  {
    label: "manifest mismatch",
    input: { runtimeBucket: "other-reviewed-bucket" },
    pattern: /exactly match the reviewed Wrangler environment/
  }
]) {
  assert.throws(
    () => validateRetentionTarget({
      configuredAccountId: accountId,
      configuredBucket: bucketName,
      runtimeAccountId: accountId,
      runtimeBucket: bucketName,
      runtimeToken: token,
      ...fixture.input
    }),
    fixture.pattern,
    fixture.label
  );
}

const cursor = "next?target=https://evil.example/#fragment";
const objectUrl = buildCloudflareR2Url({
  accountId,
  bucketName,
  operation: "objects",
  cursor
});
assert.equal(objectUrl.origin, "https://api.cloudflare.com");
assert.equal(
  objectUrl.pathname,
  `/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`
);
assert.equal(objectUrl.searchParams.get("per_page"), "1000");
assert.equal(objectUrl.searchParams.get("cursor"), cursor);
assert.throws(
  () => buildCloudflareR2Url({
    accountId,
    bucketName,
    operation: "https://evil.example/"
  }),
  /operation is invalid/
);

let wranglerCalls = 0;
let fetchCalls = 0;
await assert.rejects(
  main({
    argv: ["--environment", "production"],
    environment: {
      CONFIRM_PRODUCTION_READ: "distilled-news:production:retention-read",
      CLOUDFLARE_ACCOUNT_ID: accountId,
      RAW_ARCHIVE_BUCKET: "safe/../../other",
      CLOUDFLARE_API_TOKEN: token
    },
    config: {
      env: {
        production: {
          vars: { CLOUDFLARE_ACCOUNT_ID: accountId },
          d1_databases: [{
            binding: "DB",
            database_name: "fixture-production",
            database_id: "11111111-2222-4333-8444-555555555555"
          }],
          r2_buckets: [{
            binding: "RAW_ARCHIVE",
            bucket_name: bucketName
          }]
        }
      }
    },
    runWrangler() {
      wranglerCalls += 1;
      throw new Error("Wrangler must not run for an invalid target.");
    },
    async fetcher() {
      fetchCalls += 1;
      throw new Error("Fetch must not run for an invalid target.");
    }
  }),
  /valid runtime R2 bucket/
);
assert.equal(wranglerCalls, 0);
assert.equal(fetchCalls, 0);

console.log("Retention target validation and fixed-origin URL fixtures passed.");
