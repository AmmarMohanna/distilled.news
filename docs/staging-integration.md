# Staging integration operating notes

The integration branch preserves the downstream and connector histories through a real merge. It deploys one application Worker, `distilled-news-staging`, in account `e32b564514d4f9b9e383b7dd30dbb026`. Use `apps/worker/wrangler.staging.toml`; the default Wrangler configuration belongs to older infrastructure and must not be used for this staging rollout.

## Composition and safety

The staging entry point wraps the existing application's fetch handler with a narrowly scoped immutable R2 asset reader. It retains the same scheduled and queue handlers. The connector runtime uses D1-backed RSS scheduling and source storage, R2 payload storage, current persisted FeedSource authorization, and the real `acceptV1Handoff` durable intake implementation. Existing downstream acquisition, evidence acceptance, intelligence, editorial planning, grounding and immutable publication remain authoritative.

Authorization requires enabled RSS sources owned by the connector, an active account and unpaused feed, an enabled intake scope, exact feed/source identities, the current configuration revision and locator, empty bounds and a batch limit of 30. Staging admission is limited to the explicit FeedSource allowlist. Other provider families remain closed until their product enrollment contracts and credentials are verified. Authorization occurs before collection, again before network dispatch and before handoff. Intake checks the expected feed revision within its guarded durable transaction.

Checkpoint advancement follows durable resolved IntakeReceipts. It does not wait for acquisition or publication. RSS retries and continuation preserve saved payloads and stable observation identities. Connector fetch-start ordering remains independent from evidence acceptance ordering.

The persisted `sources.collection_owner` field prevents migrated sources from entering legacy polling even if runtime flags change. Staging also disables every legacy polling path globally. A change of collection owner fences the intake scope and increments its epoch.

Migration `0044` installs the connector-owned schemas after frozen downstream migration `0043`. Migration `0045` adds persisted collection ownership and its fencing trigger. No frozen migration was rewritten. The staging migration ledger records all 45 migrations; pre-existing connector smoke receipts were preserved.

## Verified bindings

| Binding | Staging resource |
| --- | --- |
| DB | distilled-news-staging / ab259bfe-6029-4e20-8cb6-eea6b7a67459 |
| RAW_ARCHIVE | distilled-news-staging-raw |
| PROCESSING_QUEUE | distilled-news-staging-processing / bf578e1627ff41bcb8eacf497e39eba4 |
| Queue DLQ | distilled-news-staging-processing-dlq / 3a06d96704d14fdcb23176211d436c4e |
| SOURCE_EXECUTION_SERVICE | distilled-source-runtime-staging / 01a1099d-e88a-7c23-a1c5-eeb51471e780 |

The private service targets loopback port 8790 through the existing healthy tunnel. No public helper hostname is installed. Its bearer token must match the helper's existing token. Worker provider secrets and the account Secrets Store were empty at deployment; no secret was installed. TwitterAPI.io, Apify and Zyte operation ceilings are all zero. Secret presence alone cannot activate paid operations.

The queue consumer uses batches of five, a one-second batch wait, five retries and one concurrent consumer. The cron runs every minute. There are no custom-domain routes. Compatibility date is 2026-10-05 with `nodejs_compat` and `global_fetch_strictly_public`. Deterministic semantic, salience and synthesis fallback keeps this first proof free of model-provider charges while exercising actual persisted editorial plans.

Native asset upload sessions required separate authorization unavailable to the connected API. The application assets therefore live under an immutable `staging-assets/<commit>/` prefix in the private raw bucket. The reader accepts only manifest-listed hash keys within that prefix, never source payload keys. Tests cover prefix escape rejection and SPA/static responses.

## Rollout boundaries

Complete RSS persisted-state proof before enrolling Telegram. Telegram requires the matching private helper token, and its product enrollment adapter must be extended and tested. Paid providers require credentials, a reviewed nonzero tiny ceiling and one bounded operation at a time. Do not deploy production or use old account resources to install secrets.
