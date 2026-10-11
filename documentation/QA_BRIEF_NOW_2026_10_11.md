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
