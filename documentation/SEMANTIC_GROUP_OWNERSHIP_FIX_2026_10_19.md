# Semantic construction ownership correction — 19 October 2026

## Confirmed cause

The saved original and single repair referenced governance passage `c0e64b59dad5d787ffbf98e8e75276db237805af66e07f32fdd2673215007569` as a storyline open question without including it in that group's owned passages. The initial response also classified it as background. The canonical ownership validator correctly rejected both. No existing event/storyline partition existed upstream: this was a new model-generated partition, not evidence that an authoritative grouping should be silently changed.

The old transport offered global passage choices for group-local references. Its repair reverted from compact aliases to long IDs and did not supply a precise offending-reference/allowed-ownership map. These are confirmed contract weaknesses; model behavior under the revised contract remains to be measured.

## Implementation

V2 construction uses `group-owned-passages-v1`: explicit local group IDs and owned-passage records carrying open-question/date annotations. A local reference is derived only from the record that explicitly owns that passage. Unknown IDs, duplicate ownership and invalid background assignments fail closed. No foreign passage is automatically moved, dropped or rewritten. Entity and slot ownership still undergo canonical validation.

The prompt includes exact authorized source spans, revision/source identity and provenance, an unassigned incoming-passage catalog, existing storyline/version context and explicit rules separating overlapping coverage from independent developments. There is no invented pre-approved partition for new passages. Repair receives exact offending references and allowed IDs, uses the same constrained alias schema, and retains the one-repair maximum.

The contract version participates in durable operation identity. Historical failed receipts remain unchanged; the existing rematch continuation provides a legitimate new-contract review. Legacy construction remains unchanged when V2 is absent. No acquisition, provider, grant, CAS or canonical lease behavior was replaced.

Core files: `construction-transport.ts`, `semantic-preparation.ts`, `semantic-construction-repair.ts`, `semantic-continuation.ts` under `apps/worker/src/v1-intelligence/`.

## Offline evidence and verification

Both actual saved invalid responses remain rejected. A structural fixture explicitly owning the governance passage succeeds while retaining a separate development. This is a transport/graph regression result, not a saved provider success or factual-quality certification. Tests cover source spans/provenance, no silent ID rewriting, overlapping sources, independent developments, durable reuse, rejected receipts and a single successful repair.

The focused run passed 49 tests across nine files; subsequent runs passed all 15 semantic-preparation tests and all four runner/budget tests, including two additional tests (51 distinct focused tests in total). The separate saved-input preflight passed. Repository typechecks and explicit `wrangler deploy --dry-run --config wrangler.staging.toml` passed. No broad Worker suite was repeated; historical full-suite timing sensitivity is not claimed resolved here.

## Private staging preflight — no execution authorization consumed

Read-only verification at 2026-10-19T13:29:28.897Z confirmed private feed `staging-fresh-20261019-run1`, active full-article revision `478b532d-62cc-41d0-bf16-3010a8fd98f2`, zero editions/delivery jobs/push receipts, and exactly two settled failed operations totaling **$0.0035884** with no unknown outcomes for this feed. The retained article is a bounded one-article sample, not proof of complete source coverage.

Worker remains `98bac4ac-cae8-458e-82fa-ebdcef5c6421` on `distilled-news-staging`, account `e32b564514d4f9b9e383b7dd30dbb026`, D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`. Existing rollback version is `45f475b8-0d2a-4da3-9b44-bffc113ffdcb`; asset prefix remains `staging-assets/905fe696899a08e0e9a0521efed549416f3f3fe7/`. No schema migration is required. No new deployment, inference, publication or remote mutation occurred during this correction.

## Proposed bounded attempt (requires separate approval)

Deploy only the staging Worker, retaining bindings/secrets/assets. Enable `STAGING_GROUPING_RUN_POLICY=owned-group-single-attempt-v1` only there; the runner restricts V2 to the existing isolated private feed. Global V2 remains off. Execute one immutable `review-contract-v2` rematch, then the existing single publication attempt if review succeeds. No reacquisition, bulk replay, subscriber delivery or automatic second attempt.

The default-off staging policy uses existing models/prices and smaller admitted request envelopes, not a grant amendment. Atomic cumulative reservations include historical failures, unknown liabilities and the next reservation, capped at **$0.20**. Per-model operation limits count failed settled operations too: nine GPT total (two old plus at most seven new), three Jev. Oversized requests stop before purchase; no evidence is truncated to fit.

At 24,576 input-token upper bound and 8,192 output tokens, GPT costs at most $0.0229376 per request. Seven requests plus three 64k-input Jev decisions and prior $0.0035884 give a conservative provider bound of **$0.1722156**. See `benchmarks/group-ownership-publication-preflight.json`. Saved initial/repair-shaped requests fit (14,058/15,543 input bytes). Future planner/writer/verifier inputs must independently pass admission. Extra packets, repairs or continuations exceeding the fixed envelope stop. Output truncation also fails closed. This bound does not establish successful publication or quality at that output limit. Worker/D1/R2 invoice costs are unavailable and excluded from the provider bound.

Before execution, recheck feed isolation, active evidence, deployed configuration, account headroom and grant validity (current period ends 2026-10-19T19:15:55.700Z). Preserve all holds and accounting. Record current deployment/configuration for rollback; no migration/DB restoration is proposed. Existing publication diagnostics and profiling record stage/model/database/CAS timings; the complete path must be measured rather than extrapolated from individual calls.

## Outcome and remaining gate

**Real briefing published: NO.** New paid cost: **$0**. Full-path latency and revised real-model ownership accuracy remain unmeasured. Approval is required for the new staging deployment and one bounded rematch-to-publication attempt. The under-60-second target is unproven; no guarantee of model acceptance is implied. Production V2 remains disabled.
