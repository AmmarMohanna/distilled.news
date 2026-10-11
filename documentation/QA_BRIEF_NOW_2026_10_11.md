# QA Brief now, scheduled collection and AI synthesis — October 11

Branch: `backend-full-stack-october-11`. Target: existing `distilled-news-sources-qa` Worker. The original `backend-sources-fixes` branch stays at its restored pre-merge tip.

## Implemented behavior

- A verified feed owner can request Brief now. Anonymous users, other owners and unrelated browser origins cannot trigger paid collection. Existing manual request rate limits are applied before enqueueing work.
- The HTTP route acknowledges durable work with HTTP 202 and a request ID. An active request is reused; ten-minute identities prevent repeated completed clicks from creating additional collection runs in the same bucket.
- The existing RSS and provider schedulers collect the owner's approved sources, preserving frozen provider order, current scope authorization, paid-operation replay and the shared USD 15 source allowance. Manual scheduling does not drain other owners' jobs with a partial allowlist.
- Cron recovers lost queue sends and advances durable request progress. Publication gets one closed window after collection terminates; acquisition and reassessment finish before synthesis. Source collection failure is reported, rather than called a quiet briefing.
- Frontend progress distinguishes checking, AI setup pending and publication failure. The owner cannot submit another request while checking. Public visitors retain read access but cannot trigger paid Brief now work. Legacy deployments retain their existing request behavior.
- QA Cron runs each minute. Each source's existing polling-window identity retains its family cadence; a Cron tick does not force a new paid request every minute. Existing per-source allowances and operation ceilings remain enforced.
- Product-mode maintenance publishes through the V1 pipeline rather than also invoking legacy edition generation.
- OpenRouter is the selected transport: the existing writer defaults to `openai/gpt-4.1-mini`, with `openai/gpt-4.1` for strong editorial planning. Existing bounded model adapters, operation reservations, grounding verification and publication leases are retained. Real synthesis is enabled and required in QA; it does not silently substitute a deterministic edition.
- If the model credential is missing, pending requests show `MODEL_SETUP_REQUIRED` without spending their retry attempts. Ordinary dispatch resumes after a key is installed.

## Migration and recovery

`0049_manual_briefing_requests.sql` adds only `manual_briefing_requests` to the mutable document types. Existing immutable editorial and publication types remain protected. No tables or source histories are erased.

Before migration, a new private 71,928,305-byte D1 backup was exported, encrypted and restored locally: 105 tables, integrity OK, zero foreign-key violations. The remote migration was applied and its trigger verified; remote foreign-key checks passed. Private backup material is under ignored `.review-tmp/` and must not be committed.

For rollback, restore the preceding Worker version and frontend prefix. Keep the additive migration and request history. Never reset source budget reservations. The preceding Worker version is `e884d906-d1ee-4c9b-ba85-cfcc3724db07`, with frontend prefix `staging-assets/e458121646e6cf833383113afc17dd060a703a55/`; it has Cron disabled.

## Verification and remaining setup

- 145 affected Worker tests passed across 13 suites, plus the model-credential wait/resume integration check. Includes owner admission, duplicate clicks, queue recovery, source failure, immutable publication, closed-window dispatch and source budget replay.
- Frontend unit tests: 18/18 passed. Desktop/mobile request and layout checks: 10/10 passed.
- Worker and frontend typechecks passed; frontend build and exact QA Worker dry-run passed. The complete Worker suite was not rerun for this change.
- A real local D1 flow covers HTTP admission, RSS collection, acquisition, reassessment, grounded publication and the public frontend API. It uses fixture source data and deterministic publication, and is not a live OpenRouter synthesis proof.

The OpenRouter key is user-supplied setup. It must be installed as the `OPENROUTER_API_KEY` Worker secret, never put in Git, documentation or chat. The private interactive helper is `.review-tmp/install-qa-openrouter.ps1`; it targets only sources QA. Real model-backed QA publication remains unverified until a valid funded key is installed and a live request completes.


## Deployed QA verification

Code commit: `9049d6c`, pushed to `backend-full-stack-october-11`.

Worker version: `068506d3-594d-45cb-82af-f585e504a0e8` (deployment succeeded).
Frontend prefix: `staging-assets/c31ceafc7b5932edb5e4097d52159795608d569b/`.
Site: https://distilled-news-sources-qa.distillednews-platform.workers.dev/.

- All 21 live asset/API smoke checks passed; deployed frontend asset hashes match the uploaded manifest.
- The existing verified ECB feed owner submitted Brief now successfully (HTTP 202). A duplicate submission reused the same durable request ID. The public feed API returned `publicationState: checking`.
- Queue execution scheduled all four approved ECB source jobs: X, Telegram and both Google News queries. No additional sources were substituted.
- The one-minute Cron trigger is deployed. An explicitly invoked maintenance pass returned HTTP 200 after approximately 172 seconds and advanced an older queued provider job. The new manual request was still waiting behind historical jobs at that check. This proves the maintenance path executed, but does not establish sustained autonomous collection or completed manual publication. Cloudflare documents Cron propagation taking up to 15 minutes: https://developers.cloudflare.com/workers/configuration/cron-triggers/.
- At the initial live check, `OPENROUTER_API_KEY` remained absent. Real AI publication is still blocked on securely installing that secret; no model-backed live edition is claimed.
- The old `backend-sources-fixes` branch still resolves to `b38e2effaee82743624ac27122ee5a58d3622abc`.


### Follow-up: OpenRouter secret installed

The user confirmed their friend installed the key and redeployed. Live version `93e2aef4-5f37-47de-a0a3-a9d404bd377b` contains `OPENROUTER_API_KEY`; its script ETag matches version `068506d3-594d-45cb-82af-f585e504a0e8` and its plain-text settings are unchanged. Secret presence is confirmed without reading its value. Real model-backed publication still requires the live collection/processing request to finish; this entry does not claim a valid model response yet.


### Manual collection queue priority

Live QA revealed that snapshot chunks and provider continuations returned behind historical scheduled jobs. Active manual requests now supply their pending job IDs as a scheduler ordering preference. SQL still enforces due times, leases and PENDING state; the runner still checks full current source authorization, durable provider identities and budgets. No job or checkpoint history is reset. Jobs outside manual requests retain the existing oldest-due ordering.

Regression checks cover manual snapshot continuation ahead of old work, completed-job replay, future-due exclusion and a real D1 Worker priority case. No shared acceptance contract or schema change is required.


### Manual queue continuation

Manual admission now drives its work on the existing processing Queue. Each delivery performs one bounded collection/dispatch pass, then sends a 30-second delayed continuation only while that same request remains pending. It does not schedule additional regular poll windows. Completed or paused/disabled requests stop; missing-model setup stops the continuation without consuming model retries. Durable scheduler/provider identities and leases fence duplicate delivery. Cron remains a separate recovery and regular polling path.

Cloudflare's schedule API confirms the one-minute trigger exists. Its dedicated scheduled-invocation dataset subsequently reported successful autonomous runs at 16:42:30, 16:43:30, 16:44:30 and 16:47:30 UTC on October 11. The initial empty result was not proof of a permanently broken trigger. Manual work nevertheless no longer depends on Cron propagation to finish its queued work.


Live follow-up: the Telegram job and both Google News jobs finished; X progressed through six pages and remained pending. The ECB X allowance still has a USD 15 ceiling, with approximately USD 0.90 reserved across its paid operations (reservations are not invoice charges). Acquisition and reassessment continued on the ordinary queue; a real model-backed edition remains unverified at this checkpoint.


## Latest deployed continuation verification

Priority commit: `3ca3bd4`. Queue continuation commit: `55b7648`. Both are pushed to `backend-full-stack-october-11`.

Latest QA Worker version: `fb7d6ac6-86c3-4b8d-bbc6-7238647ba4aa`.

- Focused priority checks: 93 connector tests and 33 Worker tests passed; connector and Worker typechecks passed; exact QA dry-run passed.
- Queue continuation checks: 9 Worker tests passed, including the new continuation/replay/paused/completed integration case; Worker typecheck and exact QA dry-run passed. Some Worker checks overlap the preceding run; these counts must not be added as a unique full-suite total.
- Post-rollout HTTP asset/API checks passed 21/21.
- The existing ECB owner request was resumed with HTTP 202 and the same request ID. No second manual source window was created.
- The existing request reached PROCESSING and created its closed-window publication request automatically. Telegram and both Google News jobs finished DONE. X handed off ten pages, then terminated BLOCKED/BOUNDED_LIMIT, so this is bounded partial X collection, not exhaustive recall.
- At this checkpoint, 290 acquisitions and 45 reassessments were DONE; 117 acquisitions, one running acquisition and 244 reassessments remained. The remaining review backlog is significant. Real model-backed publication and its live latency remain unverified; key presence alone does not prove a successful OpenRouter response.
- Successful autonomous Cron invocations were confirmed in Cloudflare's dedicated execution history. The secret was retained across both deployments. The old branch remains restored; no production site or friend's branch was changed.

The backend continues the pending request through the ordinary Queue and Cron paths. No operator should report a completed live AI edition until the durable publication request and public feed API show it.


## Large-feed reassessment recovery

The ECB frontend remained `checking` because its manual request was in PROCESSING while reassessment stayed at 45 DONE. Live diagnostics showed canonical transactions making hundreds of serial immutable-document reads, source-epoch CAS rejections and processing leases repeatedly expiring. Source acquisition continued independently.

Commit `daaf6a9` batches immutable duplicate decisions (including absent decisions) and retained semantic references within each canonical transaction. It preserves the ordered first-processed duplicate representative, source ownership checks, immutable graph validation and atomic source/feed/lease fences. No migration, source budget reset or paid-provider change is involved.

Verification: 17 focused real-D1 tests passed, including a 180-item acquired-backlog regression, concurrent/replayed intelligence, deletion/support changes and expired-lease rejection. Worker typecheck and exact QA dry-run passed. Live frontend/API smoke checks passed 21/21.

Deployed QA Worker version: `660f0e97-5307-4f1f-9216-5d76d3efa5c0`. After rollout, the ECB feed's completed reassessments advanced from 45 to 48; acquisition reached 409 DONE with no pending/running acquisition at that check. There were still 360 pending reassessments, and the publication request remained pending. This proves review progress resumed; it does not prove a completed real-model edition or acceptable sustained publication latency. Existing automatic processing continues the same durable request.
