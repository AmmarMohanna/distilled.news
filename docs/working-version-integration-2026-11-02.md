# Working version integration — November 2, 2026

Branch: `working-version`.

- Aya first parent: `da9ec706` (`aya-collection-deadline-recovery`).
- Ghada second parent: `cdb9fa5097c7fdf45f74a536028aa521b7837388` (`ghada-agentops-grafana`, pinned exactly).
- Common ancestor: `b11c12cd1e1b5a76bdff817574cc00220fd9fc59`.
- Later remote commits are excluded. Neither original branch is rewritten.

## Preserved behavior

Scheduled V3 preparation uses the existing cutoff and intended delivery. Prepared work schedules a bounded delayed wake through the existing relay after releasing its transport slot; Cron and persisted due times remain recovery paths. Only a verified, current scheduled V3 result can defer unfinished acquisition at/after delivery. Reassessment, source ownership, current revisions, receipts and final publication validation remain authoritative. Late acquisition is retained for later windows. Bounded final-commit priority never preempts a held lock and yields precedence to ready work aged ten seconds. Existing schedule policies, DST behavior, window identities and actual publication timestamps are unchanged.

Aya's bounded catch-up for old unstarted windows remains opt-in in QA, including its mixed-version paid-intent fence, original evidence dates, correction/late-discovery carry, and protection of started or uncertain work. Numeric legacy collection checks remain supported. Scoped poll queries, confirmed capacity-refusal handling, unavailable-source coverage and retained V2/unmarked transport ownership are kept alongside Ghada's verified-delivery readiness hint. Coverage combines explicit verified-acquisition deferral with the pre-existing confirmed-backpressure path; it does not mark missing evidence collected or cancel recoverable jobs.

Current-format missing/invalid article citations invoke the existing one-correction mechanism rather than silently dropping selected stories. Correction has a separate durable/accounted request; verification and settled-operation replay remain mandatory. Frozen older prompt identities remain frozen. Version 5 novelty prompts are retained as an explicit opt-in; default version 4 and GPT-4.1/GPT-4.1-mini routing remain unchanged. Retained quality/repetition evaluation evidence is preserved without treating model judgments as human factual approval.

All acquisition-only changes from Aya remain unchanged, including initial-backlog deferral, duplicate discovery coalescing, Apify saved-receipt recovery, verified Google resolution reuse, redirect identity checks, full-body/readability extraction and listing/teaser distinctions. AgentOps collector, fifteen-minute configuration, private authorization, bounded reads, sanitized export, low-cardinality measurements, paused alerts and disabled legacy log export remain preserved.

Synthetic k6 profiles, CI fixtures and separately gated real campaigns remain distinct. Manifests, observer bounds, budgets, accounting, correlation, private artifacts and safe owned cleanup are retained. A larger multi-user pilot is not established as complete by this merge. Gmail consent/mailbox integration remains optional and read-only, with PKCE/state, plus-alias identity, bounded polling and recipient/time/origin validation. No bypass of registration/email verification is introduced.

## Integration audit

The two inputs changed 11 shared paths. Conflicts were resolved by feature. All 21 Aya-only paths match their input blobs. Of 35 Ghada-only paths, 34 match exactly; `window-coverage.test.ts` intentionally adds the combined-options regression and adjusts its EXPLAIN bindings to the retained capacity-aware query. The shared store/type additions were inspected as well as explicit conflicts. Frontend, package manifests, lockfile and deployment configurations remain unchanged. Ghada adds no migration at this boundary; Aya's 0083/0084 migrations and both previously retained 0082 filenames are preserved without renumbering.

## Validation

- Full briefing package: 123 passed.
- Full connector package: 348 passed, one existing skipped.
- Script/performance/campaign/Gmail tests: 157 passed.
- Workspace TypeScript: passed.
- Observability static validation: 70 metrics, 14 panels, 11 alerts, eight synthetic outcomes.
- Two environment fragments validate against the installed Wrangler schema and parse when merged with their existing target configurations.
- Combined worker regression suite: 242 passed across 11 files (V3, catch-up, runtime, coverage, schedule policies, first-delivery preparation, deadline wake-up, admission and publication priority).
- QA Wrangler dry-run build: passed; no deployment performed.
- Browser-test TypeScript configuration: passed.

All local providers are mocked. This integration performs no deployment, migration application, live mailbox use, paid inference, real source acquisition or reader notification. No private tokens, credentials or full benchmark articles are added to Git. Local logs and the blob audit remain in ignored `.local-reports/working-version-20261102/`.
