# V3 on the product scheduler

The product feed path can now select the V3 editor?verifier with `BRIEFING_ENGINE=v3`. This is an opt-in code change; this work does not change deployed configuration, deploy, send notifications, or run paid inference.

## Shared behavior

V3 uses the existing product acquisition queue, approved source scopes, fixed reporting windows, full first-window eligibility, timezone scheduling, ordered durable requests, retry backoff, publication status, citation reads and delivery outbox. The legacy V3 cursor is not used for product feeds. Delaying a 01:00 edition until 01:04 does not change its 00:30?01:00 reporting interval.

Five-minute preparation remains mechanical and read-through: it loads eligible acquired articles without freezing paid editorial decisions. At close, V3 freezes the full article inputs and reader history. Observations before close remain eligible even if acquisition finishes afterward; observations arriving after close are considered as late discoveries in a subsequent interval, with original publication dates retained. This does not promise instantaneous publication or early model inference.

New V3 reassessment jobs acknowledge acquisition without constructing V2 claims, Events or storylines. Previously started V2 operations and rematches retain their existing recovery path. A window pins its engine; changing the environment does not reinterpret started V2 editorial operations or switch a retained V3 input to different models.

Initial pre-subscription backlog and future-dated reporting are excluded from ordinary admission. Post-subscription late discoveries, source revisions of communicated articles, explicitly deferred earlier windows and verification-dropped items remain eligible. Unknown publication dates are retained but not admitted as newly published ordinary news. No article's acquisition timestamp is substituted for its publication time.

## Configuration and accounting

Product V3 currently uses OpenRouter, with `BRIEFING_EDITOR_MODEL` (default `openai/gpt-4.1`) and `BRIEFING_VERIFIER_MODEL` (default `openai/gpt-4.1-mini`). An OpenRouter key and existing product-account authority are required. Unknown model capabilities require the existing verified capability configuration. This integration makes no new claim of model qualification.

Each model request uses the existing durable semantic-operation reservation and settlement ledger, provider concurrency/rate limits, provider receipts and unknown-outcome recovery. Product V3 does **not** use the legacy `v3_model_spend` budget ledger; `BRIEFING_V3_DAILY_BUDGET_USD` and `BRIEFING_V3_RUN_BUDGET_USD` continue to apply only to the legacy non-product adapter. Existing product authorization remains authoritative. Concurrency uses the existing `V1_PROVIDER_MAX_CONCURRENCY` (integer 1?6, default 3) and `V1_PROVIDER_REQUESTS_PER_MINUTE` (default 20) settings. Staging explicitly uses concurrency 6. These are shared provider limits, not per-feed limits. Uncertain operations retain financial exposure and execution capacity until evidence-bound recovery or explicitly approved operation quarantine; raising concurrency does not automatically resolve uncertain operations.

Full retained article text is offered to V3; its default 6,000-character article trim is disabled on this path. Each published item cites the original immutable evidence revisions. Whole supporting articles are stored as source context, not represented as model-selected exact quotations. The V3 engine's semantic verifier checks the item against those sources. The application validates exact revision ownership and reconstructs publication from the retained verified result; it does not pretend to independently prove the model's semantic verdict.

V3 reader memory is actual published prose, including existing V2 editions. It does not fabricate V2 canonical Events or claim dispositions. Switching back to V2 does not import V3 prose into V2's semantic event graph automatically; cross-engine semantic-memory migration remains unqualified. Historical V2 graph validation is unchanged.

## Validation

`apps/worker/src/v1-intelligence/v3-window.test.ts` exercises local D1 acquisition through publication and public citation reads with mocked provider responses. Cases cover fixed delayed windows, initial backlog versus late discovery, no V2 semantic preprocessing, no inference for empty windows, first-full-window dispatch, preparation, ordered delivery, duplicate delivery, settled-call replay after interruption, uncertain-charge holds and source revocation.

Mocked tokens and costs test accounting behavior only. They establish neither live provider quality nor real end-to-end latency. No new paid trial or unattended staging publication was performed for this integration. Existing three-article model evaluation is documented separately in `v2-v3-three-article-comparison.md`.

The focused checks cover 11 new integration cases and 108 existing regression cases, plus the Worker TypeScript check. The first broad regression run passed 106 cases and timed out two local-D1 runtime tests. Those two passed separately after giving the same assertions 60/30 seconds; this is test-runner headroom, not a product latency claim. The observation-cutoff test uses immutable observations accepted through the intake API. Machine-readable results are in `benchmarks/results/v3-shared-product-scheduling.json`.
