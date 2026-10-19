# Controlled single-feed staging publication — 2026-10-19

Status: **BLOCKED BEFORE DEPLOYMENT OR SPENDING**. Code through `b87c252` was pushed to `backend-validation-contract`; no production or sources-QA changes. The subsequent mission authorizes an isolated V2 staging attempt only if isolation, factual safeguards and a conservative $0.20 bound are established. Its explicit prohibition on grant/cap changes controls over the preceding general $10 top-up offer. No grant or hold changed.

## Read-only preflight result

Snapshot at 10:45:15Z; live staging continues independently, so recheck all values before execution. Account `e32b564514d4f9b9e383b7dd30dbb026`, Worker `distilled-news-staging`, D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`. Explicit configuration: `apps/worker/wrangler.staging.toml`. Active deployment `32d76037-144a-4dc6-938a-64cf0a86afb8`, active/rollback Worker `45f475b8-0d2a-4da3-9b44-bffc113ffdcb`; asset prefix `staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/`. No migration needed for the writer change; no backup, migration, deployment or rollback was executed. Any subsequent remote mutation needs the repository's applicable backup/rollback preflight, not a claim that this read-only inspection was a backup.

Candidate: existing RSS-only feed `briefing_4d69fb82-7190-4e19-bcc3-cb0a7decc8d7`, revision 7, 3 enabled sources, 98 active evidence items, 137 events. Chosen closed window: **09:00–10:00 UTC October 19**, existing pending request `4d6e2142cd25055b071d60e48cec9a41d52acaa87a3a62a1520143a0fca4ee5c`. No window-specific shortlist or semantic planning intent exists yet. This identifies a candidate; it does not certify evidence readiness or select three stories.

Actual runtime intake query finds **1 pending reassessment**, plus **2 failed reassessments (IDEMPOTENCY_CONFLICT)** and **1 failed acquisition (POLICY_DENIED)**. Pending evidence observed 09:40:38.797Z belongs before the cutoff. Do not skip it. Failed jobs date to October 13/16 and must remain visible as incomplete coverage; absence of new collection-window rows does not prove sources checked or a quiet period. No retries, job reset or replay was triggered.

Isolation gate fails for the current entrypoint/configuration: `staging.ts` forwards public HTTP, scheduled and queue handlers to `index.ts`; staging has `workers_dev=true`, active shared staging consumers and a minute cron. Scheduled code calls `sendBriefingNotifications`. V2 is currently a single environment contract variable, not a feed-scoped switch. Switching the existing Worker globally would affect unrelated feeds and cannot satisfy this mission. This is configuration/code evidence, not a claim that a notification was sent. No deployment performed. A private execution boundary with no public edition reads or delivery, one feed/window only and no competing writers must be established and tested before execution; do not disable shared staging processing or modify unrelated feeds as a shortcut.

## Complete-attempt cost decision

The preflight cannot produce a finite upper bound within $0.20. Missing values below are **unknown, not zero**. No paid planning was purchased to fill them.

| Component | Established bound/status |
| --- | --- |
| Attributable collection/intelligence, including failures and reused operations | Exact window allocation unavailable until ready canonical candidate/evidence set exists |
| RSS source-provider ledger | No `connector_provider_operations` rows for this feed; this alone does not prove all acquisition costs zero |
| Jev relevance | Existing batches of at most 8 candidates; actual candidate set/input not frozen |
| GPT editorial plan | Output reservation $0.0524288 plus actual serialized input upper bound |
| Writer | Output reservation $0.0524288 plus input; selected plan not yet available |
| First verification | At least one output reservation $0.0524288 plus input; packet count draft-dependent |
| One repair, if eligible | Output reservation $0.0524288 plus input |
| Re-verification | At least one output reservation $0.0524288 plus input |
| Additional packets, continuation, competing recovery | Not authorized to create extra exposure; cannot silently exclude them from full bound |

These are **reservation envelopes, not predicted or billed costs**. Existing verified GPT-4.1-mini capability uses 32,768 output tokens at $0.0000016/token: five permitted calls imply **$0.262144 output-only envelope**, already above $0.20 before any input/upstream cost. With no repair, three output envelopes are $0.1572864, still excluding input, ranking and upstream. Do not claim actual inference will necessarily cost $0.262144 or that all envelopes are held simultaneously: calls reserve/settle sequentially. Actual earlier V5 verification cost $0.0053996, but controls are not a full publication bound. Smaller per-request output allocations may be viable, but have not been demonstrated for this real plan/draft; no model capability, grant or runtime limit was changed to manufacture a passing estimate.

Account snapshot: cap **$53**, reported **$48.307721772**, unknown/unreported exposure **$4.604649902**, headroom **$0.087628326**, grant expires **19:15:55.700Z October 19**. This shared moving headroom is separate from the $0.20 mission ceiling. It does not fund the conservative complete attempt. No uncertain holds released.

Feed-wide historical semantic ledger: **793 operations, $7.874306446 reported, $1.309236 unknown exposure in 9 operations**, since October 13. These are feed totals, **not this edition's cost**. Reservation keys link using `kind:id`, not bare ID. Existing failed-window publication costs are separately documented in `PUBLICATION_DAY_ONE_2026_10_19.md`; neither historical waste nor shared upstream work may disappear from the cost report by averaging only successful calls.

New mission paid calls **0**, cost **$0**, attempted publications **0**, successful editions **0**. No successful-briefing cost or live latency is measured. The under-$0.20 and under-60-second acceptance targets remain unproven.

## Prepared execution and measurement contract

Machine-readable blocked manifest: `benchmarks/single-feed-publication-preflight.json`. Private read-only responses and runnable SELECT-only scripts are retained under ignored `.local-reports/single-feed-preflight/`; manifest pins their SHA256 without committing source text, owner data or provider payloads. Tracking template: `benchmarks/single-feed-publication-trace-template.json`.

Before starting the single authorized attempt:

1. Establish and test a non-public, feed/window-scoped execution boundary, no notification/delivery dispatch and no competing canonical writer. Preserve production and shared staging behavior.
2. Re-read authorized sources, accepted evidence dependency state, feed revision/epochs, pending corrections, window identity and existing legacy/paid boundaries. Never reset/relabel a previously started paid operation to escape it. Select up to three coherent real developments using existing event grouping; defer unselected protected work truthfully, never mark it delivered.
3. Freeze provenance and actual ready candidate inventory, de-duplicate the union of attributable reservation IDs, include prior failed work and all unknown liabilities. Retain separate historical and new-mission columns. Any unresolved allocation prevents declaring full cost compliance.
4. Preflight actual serialized Jev/planner payloads and conservative subsequent writer, repair and verifier packet bounds. Before **each** call prove `mission reported charges + mission unknown exposure + proposed reservation <= $0.20` and the separate account admission guard. Preserve all receipts and operation identities. Existing account authorization alone is not a mission-specific aggregate cap; no unguarded cron/queue execution is acceptable. Abort on unknown/unfunded/incompatible outcomes; no automatic second attempt or duplicate calls.
5. Capture exact execution commit/configuration/version and backup/rollback evidence before approved rollout. Keep default V2 disabled outside the isolated invocation. No financial/schema migration is proposed here.
6. Record correlated feed/window/selection/draft/operation/request/edition IDs and monotonic wall times for source observation, acceptance, review readiness, attempt trigger, turn request/acquisition/release, shortlist, plan, writer, repair, every verification packet, CAS callback/commit and edition persistence. Include database query count, returned bytes, D1 SQL CPU (separate from invocation CPU/wall), CAS attempts/conflicts/discarded callback wall, lease/turn held time, and all waits. Do not sum nested spans as exclusive stage time.
7. On acceptance independently inspect every reader assertion against same-story source evidence, speaker, quantity/unit, date role, modality, quotations and every mandatory proposition. Verify persisted edition and zero external delivery; a 200 response is not proof. On REJECT/UNRESOLVED retain exact reason/draft/verdict and stop; do not force acceptance. A blocked/failed attempt stays in the cost denominator/report.

These steps are a prepared, conditional runbook, **not an executed publication or a claim of deployability**. No existing trace demonstrates the new complete path. Prior local 18.3% synthetic publication-path improvement is not a live end-to-end result or p95.

## Editorial consolidation addition

V2 synthesis and its sole repair now explicitly consolidate overlapping source accounts **within existing selected story ownership**, combine complementary facts, avoid repeating shared explanations and preserve every required proposition and citation. Distinct selected developments, stages, corrections, disagreements and important updates remain separate. Legacy instructions and the exact V5 verifier request are unchanged. No additional model pass, lexical duplication gate, graph regrouping, source mutation or new concurrency.

The focused fixture supplies two publishers for one announcement and a separate same-company withdrawal. One synthetic transport request carries two stories (not three article summaries), keeps both required announcement facts/source owners, decodes consolidated prose, preserves the withdrawal and rejects a cross-story citation. It tests wiring and instructions, **not real-model editorial quality**. Actual writer request bytes change and remain part of durable intent identity; old paid response artifacts are not edited or represented as new evidence.

Validation for this follow-up: **20/20** focused model/writer-wire tests; **3/3** offline saved-response/preflight tests, live evaluation skipped; repository-wide `pnpm -r typecheck` passed; `git diff --check` passed. No full suite, real-model call or live publication was repeated. No new measured end-to-end speedup is claimed for the writer instruction change.
