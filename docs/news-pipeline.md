# News processing and product APIs

Acquisition remains the input boundary. Its orchestration, security, temporal
coverage and durable workflow authority are unchanged. Downstream processing
uses the existing `raw_messages`, `processing_jobs`, `clusters`,
`briefing_items`, evidence and edition tables.

## Data and processing

`acquired_source_items` preserves trusted acquisition evidence and workflow
provenance. Configured subscriptions atomically create a feed-scoped normalized
raw message and a processing job. The normalized news metadata references the
acquired item, upstream resource, tenant, canonical identity, SHA-256 body hash,
headline, language and acquisition run. Publisher and acquisition times remain
separate. Queue failure leaves these records available to the existing relay.

Processing leases serialize modifications within a feed. Completed deliveries
do no model work. Document identity uses normalized canonical URLs, preserving
meaningful query parameters, and exact same-publisher content hashes. Separate
publishers remain separate documents, even when their reporting describes the
same development.

Development membership starts with deterministic event matching within a
bounded temporal neighborhood. Optional bounded semantic review resolves
ambiguous pairs; pair decisions are cached. Topic overlap alone is insufficient.
Membership records distinguish initial, deterministic and reviewed attachments.
This is incremental development clustering, not a general knowledge graph or
an embedding search system.

Synthesis uses the configured existing model provider. OpenRouter supports
strict structured claim output, followed by a separate entailment check.
Runtime validation requires real evidence IDs, exact source quotations and
support for numeric values. Failed synthesis falls back to source-extractive
sentences. These checks reduce unsupported claims; model review is not a formal
proof of semantic entailment. Sample review remains necessary.

Development state persists supported claims, an evidence fingerprint, versions,
membership and bounded change history. New facts and corrections are meaningful
updates; additional corroboration is recorded separately. Exact known claims
are reused. Paraphrase-based novelty is conservative and imperfect. Ranking
records relevance, importance, novelty, recency and confidence components.
Publisher count affects bounded confidence rather than directly determining
importance. Relevance is currently deterministic interest matching, not a
learned personalization model.

Development state, evidence and membership keys are saved atomically. Existing
edition scheduling uses feed cadence and reuses processed claims instead of
re-summarizing every publication. Publication waits for pending news jobs and
advances scheduling only after successful edition persistence.

## Product contracts

- `GET /api/me/home`: owned feeds, new card counts and cross-feed Catch Me Up.
- `GET /api/me/briefings/:id/developments`: ranked owned-feed developments.
- `GET /api/feed/:username/:briefingSlug/developments`: public developments.
- Existing public edition and original evidence APIs remain available.
- `GET /api/me/catch-up`: a durable ranked cross-feed snapshot.
- `POST /api/me/catch-up/:id/acknowledge`: explicit owner-scoped acknowledgement.

Development DTOs expose claims, supporting source IDs, publisher URLs and
timestamps. Acquisition agents, workflows, raw authentication state and content
hashes are operational details, not feed fields.

Catch Me Up merges deterministic equivalents across feeds, ranks across the
whole account, and shows new claim deltas after acknowledgement. Generation
does not advance a read boundary. Acknowledgement records only the captured
versions of displayed developments; omitted cards and concurrent updates stay
unread. Truncated new counts are marked partial. Read state and snapshots expire
with retained product data. Corroboration alone does not repeatedly produce an
already-read card.

## Reproducible evaluation

Run the package-local `development-pipeline.test.ts`, `news-model.test.ts` and
`acquisition-evaluation.test.ts` with serial Vitest. The integration test applies
the complete migration chain to a clean D1 database and reconstructs repository
instances between processing, publication and read-state operations.

For bounded live evaluation, temporarily enable
`DISTILLED_NEWS_PIPELINE_EVALUATION` and use
`scripts/evaluate-news-pipeline.mjs --base <worker> --owner <account> --prefix <run>`.
Supply the existing runtime token through the environment or `--tokenFile`.
The protected route invokes the same product helpers. `--publish` exercises
normal manual edition publication; acknowledgement is a separate explicit
option. `--previous` compares development versions and model counts. Run
artifacts go to ignored `.local-reports/`. Disable evaluation after use.

Report live source processing separately from synthetic matching fixtures.
Quote checks are automated; inspect a bounded claim/source sample for semantic
support and inspect both positive and negative development memberships. Costs
are reported only when the provider actually returns them.

## Established acquisition limitations

Browser Use and Al Jazeera Arabic acquisition and zero-agent replay are live
proven. OpenRouter Jev execution is live proven, but its performance advantage
is not proven: `GENERATIVE_ONLY` remains default and `JEV_HYBRID` experimental.
Authenticated downstream acquisition is synthetically proven. Live X login and
fresh-session replay still require production validation. None of these
limitations should be interpreted as universal website support.

## v1.5 acquisition and challenge policy

The target acquisition path is deterministic source retrieval, a specialized
connector, provider retrieval when appropriate, deterministic browser replay,
then a compatible authenticated executor and bounded Web Operator repair.
Challenges are recoverable states: re-observe, use a supported challenge
capability, try an eligible executor with the same authorized profile, verify
access independently, and resume from the durable checkpoint. Keep retries,
cost and elapsed time bounded. A human authentication step is necessary only
when an account owner must personally provide or approve a factor, authorized
automated routes are exhausted, or the budget expires.

Anti-bot compatibility, proxy-backed browser providers, and supported CAPTCHA
handling may be used for permitted read-only acquisition. They do not grant
access authority. Source and account authorization, tenant isolation, SSRF
protection, secret containment, and prohibitions on posting or account changes
are enforced independently. A challenge clearing is not proof of successful
acquisition; trusted source content must still pass normal temporal coverage,
candidate intake, normalization, persistence and checkpoint checks.
