# Staging integration verification — 2026-10-05

## Repository and integration history

Integration branch: `integration/staging-end-to-end-v1`, pushed to origin. The original dirty `main` checkout was preserved by using an isolated worktree under `.integration/staging-end-to-end-v1`. Nothing was merged or pushed to main.

Actual fetched source heads matched the supplied checkpoints:

- Downstream: `a5d2d1108c2587ed90789baf02916033ce887386`.
- Connectors: `149e9bcfc712e090fee2999f038d1769fac7d1f7`.
- Real no-fast-forward merge: `ca672710977f118d6a1181392dc1cdebcb0ce17e`. No textual conflicts occurred. Subsystem contracts were reconciled through subsequent integration commits rather than choosing an entire side.

Logical integration commits:

- `15d46e242312431538e639878d8b5f08f3a8da5d`: connector schemas and durable supplied-payload intake/acquisition compatibility.
- `bffceb65682f070126cc09f860ba639d005eee57`: approved RSS runtime, current authorization, exclusive ownership, one-Worker composition and verified staging configuration.
- `37b956c812e0f73b631722733e774023d3a1d502`: legacy collection fence and application assets.
- `8c5c2d1c10ac763ba41bddb64d8125b219de6933`: narrowly scoped immutable R2 application assets.

The deployed code corresponds to `8c5c2d1c10ac763ba41bddb64d8125b219de6933`. Subsequent documentation commits do not change the deployed bundle. Final repository HEAD is available from the integration branch; the documentation commit cannot contain its own hash.

## Migrations, composition and contracts

All frozen migrations through 0043 were preserved. New 0044 installs connector-owned storage, scheduler and paid-operation schemas; 0045 installs collection ownership and its lifecycle fence. The empty-D1 integration test applies the complete migration set and starts the runtime. Remote staging now records 45 migrations through `0045_connector_collection_owner.sql`; `PRAGMA foreign_key_check` is empty. Five pre-existing connector smoke receipts were preserved and are not counted as downstream proof.

One Worker retains the actual application, scheduled maintenance and queue consumers. It mounts D1 RSS scheduling, the connector collector/provider registry, R2 payload storage, the real downstream intake, current persisted authorization, acquisition/intelligence relays, comparative EditorialPlans, grounding/fidelity and immutable publication. Private execution uses the VPC Fetcher binding and never falls back to a public helper URL when that binding exists. Provider secrets resolve from Worker secret bindings; operation ceilings default to zero.

`CandidateIntakePort.acceptBatch` calls `acceptV1Handoff`, not the preflight smoke intake. Every observation is durably resolved with a downstream IntakeReceipt; identity, restriction, ordering, replay, conflict and deletion policies remain downstream-owned. Scoped connector payload references are verified for scope, bytes/hash, shape, representation and content identity both at intake and acquisition. An expected configuration revision is checked inside the guarded intake transaction.

FeedSource authorization reads real source/feed/account configuration, persisted connector ownership and enabled intake scope. It checks exact locator/provider, source/feed identities and current revision before collection, network activity and handoff. Stale/disabled source tests show zero fetch runs and zero network calls. The persisted owner also prevents legacy collection after runtime flag changes. Staging globally disables legacy polling as an additional fence.

Connector checkpoint advancement requires durable resolved receipts through the proposed cursor. It never waits for acquisition, intelligence or publication. A historical replay cannot rewind a newer fetch sequence; evidence acceptance has its own ordering and immutable revision rules. Non-authoritative DELETE behavior and conflict semantics remain covered by the merged contract/intake suites.

## Deployment and infrastructure

Worker: `distilled-news-staging`; environment: staging-only top-level configuration. Account: `e32b564514d4f9b9e383b7dd30dbb026` (Distillednews.platform@gmail.com’s Account).

Deployment: `46dde9e4-a603-4e2e-8531-b1b7804ed479`; active version: `48477b39-3425-4cda-abba-f3e2c301ee6d`, 100%. API verified fetch/scheduled/queue handlers and the deployed binding settings. Bundle SHA-256: `87fc83f28d87902aa76fcd9122a79887e496529dbe31d5c9ddcad6f5483c019c`.

| Binding | Verified staging resource |
| --- | --- |
| DB | distilled-news-staging / ab259bfe-6029-4e20-8cb6-eea6b7a67459 |
| RAW_ARCHIVE | distilled-news-staging-raw |
| PROCESSING_QUEUE | distilled-news-staging-processing / bf578e1627ff41bcb8eacf497e39eba4 |
| DLQ | distilled-news-staging-processing-dlq / 3a06d96704d14fdcb23176211d436c4e |
| SOURCE_EXECUTION_SERVICE | distilled-source-runtime-staging / 01a1099d-e88a-7c23-a1c5-eeb51471e780 |
| Private tunnel | distilled-source-vpc-staging / c1e81868-ecf4-4b62-b138-bdde1322e062 |

Deployed queue consumer `50145fb7657042ea939fdc40dc205b84` has the correct DLQ, batch size five, one-second wait, five retries and one concurrent consumer. Cron `* * * * *` was configured and actual successful scheduled/queue invocations appeared in staging observability. Workers.dev is enabled; preview URLs are disabled; no production/custom-domain route was installed. Compatibility date/flags and zero ceilings were read back from deployed settings. No old lownoise account/Worker/D1/R2/queue reference appears in the staging configuration.

The application HTML, JavaScript and CSS return 200 with appropriate MIME types. Native Cloudflare asset-upload authorization was unavailable through the connected API; immutable application assets were safely installed in a private R2 prefix and served by the same Worker. Source raw data cannot be accessed through that adapter.

Secrets installed: **none**. Deployed Worker secret names and account Secrets Store were both empty. No credential values were printed, committed or added to logs. TwitterAPI.io, Apify and Zyte ceilings: **zero**. Durable paid operations: **zero**.

## Real RSS proof

Approved product account/feed/source: `staging-proof-owner` / `staging-rss-feed` / `staging-rss-source`. The account uses an unusable password and an example.invalid address. RSS endpoint: `https://feeds.bbci.co.uk/news/world/rss.xml`. The actual cron enrolled the source and fetched it through the connector.

First fetch run: `d8f439241e0aceacbb80e0ea781ca6aaf4e476da1e1a3d24150d40f350a3c96b`, sequence 1; handoff: `05e82c9eaad0ff366657496d84d6eecbec26f3faae7bbe88cfdb154f58b9734f`; coverage: `650904baf72481e94d816bb17781448eab2a3d39a9466c91e77ccdead6d49d63`. The batch contained 23 observations and 23 proposals. Coverage honestly reported PARTIAL, failure NONE, continuation NONE. Provider telemetry recorded one request, HTTP 200 and cost zero.

R2 contains the raw XML and supplied item payloads under `source-payloads/f71c48bbf0f05ba84a323c13055e8f075d3a013f24419a5bd99cb276523750cf/`. Example raw XML: `332d8274d265a1e27d43cb833541d8c7bbe3a559682e05cb580e3db9eb9caa69`, 18,082 bytes. Saved normalized snapshot and content-addressed item objects were independently listed from the real bucket.

While the first collection was unresolved, checkpoint state was absent. After all 23 downstream receipts resolved, the batch stored receipts, the job completed and the checkpoint advanced to sequence/version 1. At that point only five acquisitions were done: checkpoint advancement did not wait for downstream completion. A subsequent scheduled poll advanced to sequence 2 after its receipts.

The two snapshots yielded 46 durable receipt identities, 23 candidates and 23 immutable evidence revisions. Reobserving identical content produced no duplicate evidence revision per item. Real processing-queue consumers performed acquisition and semantic processing, persisting ClaimMentions, Events, Storylines, semantic state and source documents.

The bounded staging operator proof submitted an explicit closed publication window through the real processing queue while remaining semantic jobs continued. The Worker constructed a comparative EditorialPlan and published edition `29e29fc97db606f14e47b4326cb3be14bf40e7e5e2f77e46f2c808d5651e81ac` at `2026-10-05T10:00:30.832Z`. It contains four stories, four exact evidence references, zero rejected grounded claims, passed fidelity checks, persisted publication status and four communication-ledger entries. Generation used the truthful deterministic fallback with zero tokens/provider cost.

Exact cited EvidenceRevision IDs:

- `1e180751-e0fd-4681-99d1-2ec4c5e25367`
- `e90eb978-b82b-4694-9506-40b253624395`
- `1c62d095-7966-4f81-8267-666beb47a136`
- `31b2fd97-ed93-4cd2-860d-3c8abfb9961b`

Every support quote was checked against the referenced revision body and the edition's evidence list. The public edition endpoint returns 200. Its response SHA-256 remained `48c2f94ecbcbe3472c7db950fe0d74e55f1ee78d24387d33c90bed6f15ed0280` on reread.

Current checkpoint replay completed on attempt 2 with `UNCHANGED`, reusing the same saved batch, existing receipt identities and one fetch-run record; candidate/revision counts remained 23/23. Deliberately replaying the older sequence returned `CAS_CONFLICT` and BLOCKED, preserving the newer checkpoint and creating no duplicated effects. This is a safe historical rollback refusal, not a successful fresh poll. Duplicate publication messages were also submitted through the real queue for immutable edition replay.

Duplicate publication delivery retained the same edition identity and public response hash. Quiet window 09:00–09:30 UTC persisted request `9470924dbc6250d1e067a0247e024a2ca876b3527b5db5fdc3911a5bad116f41` as DONE with no failure and no edition. All 41 acquisition jobs (including legitimate reobservations arriving before evidence acceptance) drained to DONE; candidates and revisions stayed at 23. Further scheduled snapshots create distinct resolved observation receipts as expected, without duplicate candidates or identical evidence revisions. By 10:05 UTC there were 69 receipts and 18 completed semantic jobs, with five semantic jobs still pending. Those intermediate counts are snapshots, not claims that scheduling was stopped.

At 10:07 UTC all 23 semantic jobs were DONE and there were 23 ClaimMentions, 23 Events and 23 Storylines, with no pending/failed acquisition or semantic jobs. The public evidence endpoint independently returned the exact cited immutable revision. The username-scoped feed endpoint returns 200 after completing the proof account's normal username alias. Its legacy edition list remains empty: these new editions are exposed through `/api/v1/editions/:id`, and the existing feed UI/legacy read model is not yet bridged to the new edition model. This staging proof establishes persisted publication and its real public edition/evidence API, not full browser presentation of the new pipeline.

The actual automatic cron/relay path subsequently published closed-window edition `106ee9006d996c7dda92f2b53983528428b2bba8c2cdaf7212a631fd2e2d32e5` at `2026-10-05T10:10:25.728Z`, covering 09:30–10:00 UTC, without an operator publication message for that window. It contains two stories citing `e4923ee0-1c83-4e6a-8f55-5ca4ee3b08af` and `3c51d7aa-3cc4-4069-ad48-6c8456c32e32`. Both exact support checks pass, cost is zero, request is DONE and the real public API returns 200. This verifies the automatic scheduler through publication as well as the earlier bounded operator proof.

At 10:10 UTC there were no unfinished downstream jobs and no dispatch warnings in the inspected ten-minute telemetry interval. Continuing polls advanced checkpoint version/sequence to 5. Two source content updates raised the revision count to 25 while candidates remained 23; grouping by item identity and content hash found zero duplicate content revisions. These later updates do not invalidate the earlier 23/23 replay snapshot. Paid-operation count remained zero.

## Tests and limitations

Workspace typecheck passes. Contracts 44, core 43, connectors 168 and web unit tests 5 pass. Private execution Node tests 5 and Python tests 4 pass. Final focused integration tests: 7/7, including actual empty migration and full RSS-to-edition local execution. Git diff check and web build pass.

Complete serial Worker run: 440 passed, 10 skipped, one publication timing failure and one module-load timeout. Both failed areas passed unchanged in isolation (publication case 1/1; preservation 11/11). No timeout was weakened. Earlier concurrent full-suite runs produced load-dependent timeouts; those were rerun serially/isolation rather than hidden.

Agent runtime: 264 passed, 2 skipped and one unchanged trusted-browser API guard failure for `.dispatchEvent(` in `browser.ts`; the offending file/test have no integration changes. Browser bridge: 81 passed, one load-sensitive secret-leak test failure; unchanged isolation passed 4/4. Browser E2E: 18 passed, 15 failed, 1 skipped, with existing selector/visibility failures in unchanged web/E2E files. These failures are reported rather than called green. Existing Windows temp-cleanup issues were not worked around by weakening tests.

Telegram end-to-end: **not attempted/verified**. The helper's matching `SOURCE_EXECUTION_TOKEN` is unavailable in the connected account, Secrets Store, repository configuration and accessible environment. The existing VPC/tunnel were verified; neither was modified or made public. Telegram product enrollment remains closed until its adapter and the real matching token can be validated. Transport proof from the friend's report is not claimed as a deployed ingestion proof.

Paid-provider checks: TwitterAPI.io, Apify X, LinkedIn/Apify and Zyte **not attempted**; required credentials are unavailable and ceilings remain zero. No billable provider activation occurred. Adding their enrollment contracts and bounded provider proof remains work for a subsequent credential-enabled rollout.

RSS staging succeeds; the entire multi-provider objective remains incomplete because the next phase has a real owner-controlled credential blocker. Production was not modified, no production Worker/configuration was deployed, and main was not changed.
