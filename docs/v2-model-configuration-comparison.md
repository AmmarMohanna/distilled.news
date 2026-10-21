# V2 model configuration comparison

Status: preparation only; no candidate inference executed or qualified. Existing
staging routes remain unchanged. Requested by the owner on 2026-10-21.

## Matched configurations

| Profile | Understanding, identity challenge, packet reconciliation | Editorial | Writer | Verification |
| --- | --- | --- | --- | --- |
| A | openai/gpt-6-luna | openai/gpt-6-luna | openai/gpt-6-luna | openai/gpt-6-luna |
| B | deepseek/deepseek-v4.1-flash | xiaomi/mimo-v2.6-pro | anthropic/claude-haiku-5.5 | openai/gpt-6-luna |
| C | Snapshot deployed task configuration, currently openai/gpt-4.1-mini | Same deployed snapshot | Same deployed snapshot | Same deployed snapshot |

Keep GPT-4.1 historical results separately labeled; they are not the current
mini baseline and cannot substitute for a new matched current-code run. Record
canonical model revision and actual serving provider from each response. The
catalog also lists deepseek/deepseek-v4.1-flash-1017; do not silently interchange
that revision with the requested unsuffixed model. Repairs follow the model for
the failed task, with repair calls and time included in the result.

JEV is an optional, separately measured structured-comparison arm. The current
public catalog lookup did not list the configured typesafe/jev-1.13; it did list
typesafe/jev-router. Do not silently replace a pinned semantic model with that
router or treat its negative catalog price as a billing rate. First resolve
endpoint availability and bounded billing. The primary A/B/C comparison does not
require adding a JEV call to every article or weakening the independent identity
challenge.

## Evidence and initial state

Reuse .local-reports/news-end-to-end/corpus.json and manifest.json: acquired
Laplace, Replit and Anthropic articles with immutable source hashes. Preserve the
existing source review findings and failed drafts. No re-acquisition is needed.

Freeze a common initial event graph AND publication ledger for every arm. Use two
passes: matched intermediate-input stage tests (to locate a model's errors), and
full pipeline runs in independent private local databases (to measure propagated
errors and persisted editions). Stage tests are not end-to-end publication.

Required scenarios: unrelated occurrences sharing a company; meaningful update
to a published occurrence; uncertainty strengthened from developing to available;
attributed dispute; explicit correction; historical initial backlog; late discovery
since subscription; long multi-development articles. Reuse real saved cases when
available. Mark controlled mutations and AI-assisted judgments honestly. Arabic
source-to-English and Arabic output are product-supported and need real acquired
multilingual evidence, not a translated synthetic case labeled real news.

The saved three-article corpus alone does not establish all of these cases or
multilingual reliability. Missing real evidence/gold labels must be visible in the
report, rather than assigned a passing score.

## Reasoning and request compatibility

First compare the requested configurations at explicit normal settings. Then
compare Luna medium against low on exactly the same stage inputs and independent
end-to-end runs. Treat none as a separate optional arm. Do not change prompts,
output allowance, evidence, concurrency or repairs simultaneously.

GPT-4.1/mini have no reasoning-effort parameter. MiMo's catalog lists reasoning
but not reasoning_effort: no assumption that low/medium maps across providers.
Reject unsupported settings rather than recording an ignored setting as a result.

The existing shared completion body forces temperature:0. Luna and Haiku catalog
entries do not advertise temperature; a capability-aware omission and real schema
compatibility check are prerequisites. Reasoning/output limits must include hidden
reasoning tokens. Model, canonical revision, serving provider, reasoning settings,
prompt/schema hash and initial ledger hash belong in each operation identity.

Do not enable these models for unattended live publication from catalog metadata.
The current capability table only admits the existing qualified descriptors; add
verified evaluation-only descriptors and retain the same application validators.

## Judging and timing

Freeze expected independent occurrences, important facts, uncertainty, attribution,
correction obligations and already-published facts before reading candidate output.
Blind configuration labels during source review. Luna's own verification ACCEPT
is not independent proof of accuracy for profile A (or any other profile).
Distinguish human labels, AI-assisted review and mechanical integrity checks.

Report: false merges/splits, important-fact recall, unsupported/strengthened claims,
missing qualifiers, duplicate communicated facts, correction preservation, invalid
ACCEPTs, schema failures, repair frequency, and actually persisted V2 editions.
Failures remain in denominators. Fail closed on material accuracy failures.

Measure acquisition/import through persisted useful briefing with a monotonic
wall clock. Separately report queue wait, each stage, reconciliation, verification,
repairs, DB reads/writes, exclusive-turn duration, call count, all usage including
reasoning/cache tokens, provider-reported cost, and unresolved accounting. A warm
saved-evidence run is not evidence of live acquisition-to-deadline performance.

Repeat matched runs with rotated arm order and fixed concurrency. Report medians
and ranges; no p95 or reliability claim from a handful of successful runs. Rank
factual correctness/evidence completeness, then successful publication/recall,
then latency and cost. No winner before blind source review and settled receipts.

## Execution boundary

No paid call is authorized by this document. The existing historical frozen
comparison approvals are not permissions for these new models/requests. Prepare
the exact first-batch request inventory, conservative reservation total and scope
from the saved evidence before seeking one bounded new evaluation authorization.
No staging routing changes, public publication, notifications or deployment are
needed for the comparison. Reuse durable identities and stop on an uncertain
charge. Historical receipts remain intact.

## Catalog sources (checked 2026-10-21)

- https://openrouter.ai/api/v1/models
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://www.deepseek.com/en/news/deepseek-v4-1-flash/
- https://openrouter.ai/xiaomi/mimo-v2.6-pro
- https://www.anthropic.com/claude-haiku-5-5

Catalog rates are not measured run costs. DeepSeek has revision/provider and
peak/off-peak differences; Haiku and Luna have long-context pricing tiers. Reserve
using the worst applicable selected endpoint tier and settle actual reported cost.

## Implemented offline preparation

`benchmarks/v2-configuration-comparison.ts` builds the requested A/B/C task maps
and prepares evaluation requests from existing pipeline request bodies. It leaves
source prompts and schemas intact, omits unsupported temperature, refuses unsupported
effort, records canonical model identity, binds evidence/graph/publication-memory
hashes into operation identity, disables provider fallback, and calculates conservative
reservations including the highest advertised price tier. It makes no network calls
and does not grant spending authority or production qualification.

Run the six deterministic preparation tests with:

    node apps/worker/node_modules/vitest/vitest.mjs run --config benchmarks/v2-configuration-comparison.vitest.config.ts

The current staging TRACK_ONLY setting was re-read: it applies only to
`openai/gpt-4.1-mini`. It does not authorize the candidate models. Fresh paid
evaluation authorization is required; no historical approval is silently extended.
