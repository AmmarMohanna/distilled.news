# Parallel intelligence implementation plan

Base: `c813a27` on `origin/backend-validation-contract`. Branch: `feat/parallel-cloudflare-event-reconciliation`.

Spec: the user's full Parallel Intelligence, Cloudflare-First Inference and Scalable Reconciliation specification, supplied 2026-10-19.

Goal: bounded independent inference, provider-qualified Cloudflare-first routing, and lossless development reconciliation. Priority: correctness, reliability, latency, cost, scalability.

Execution: inline using executing-plans. The user's explicit autonomous implementation instruction supersedes skill approval pauses.

- [ ] Milestone 1: bounded ordered settled mapping, isolated per-call usage, parallel semantic packets; preserve durable intent/reservation/settlement, lease chains, canonical write turns. Test concurrency, partial failure, duplicate delivery and restart.
- [ ] Milestone 2: shared Workers AI transport and explicit task routing; default workers_ai, retain explicit OpenRouter regression route; block unqualified tasks before spending. Test schema/response/error/billing identity and configuration. Verify model metadata against official documentation without inference.
- [ ] Milestone 3: stable development references, lossless mechanical reconstruction, complete source context and final existing binding validation; retain direct short-article path and selectable legacy reconciliation. Test coverage, shared mentions, correction/contradiction, ambiguous ownership and scale.
- [ ] Run focused regressions, typechecks, offline replay and deterministic comparisons. Record measured and unavailable metrics separately. Prepare bounded paid qualification plan, never execute it.
- [ ] Review final diff, commit each milestone separately and push only the feature branch.

Review focus: shared mutable usage on failure; parallel lease renewal; ambiguous packet ownership; model/provider identity reuse; uncertain billing without a recoverable provider receipt.

Ledger: baseline contains shared-enum compaction (`0e069a2`) and scheduling fixes (`33c5a7d`). Reuse, do not alter live recovery. Dependency setup reuses installed packages with local workspace links; no package versions changed.
