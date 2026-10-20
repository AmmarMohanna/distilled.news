# Real news end-to-end evaluation

> **For agentic workers:** Use superpowers:executing-plans to implement and verify this evaluation inline.

**Goal:** Compare complete source-to-briefing behavior on identical saved real news, including long articles, multiple developments, corrections, editorial quality and actual wall time.

**Architecture:** Use isolated local D1 with the production claim extraction, semantic preparation, canonical engine, V2 shortlist/editorial plan, scoring and publication functions. Inject provider ports only; never seed a finished graph as though inference produced it. Store exact source lineage and stage outputs privately; publish hashes, measurements and honest quality findings. A failed pipeline has no time-to-useful-briefing result.

**Tech Stack:** TypeScript, Vitest, Miniflare/D1, existing model/provider interfaces.

**Spec:** User request of October 20: complete real news processing and briefing-quality/end-to-end performance evaluation.

## Constraints

- No deployment, external publication, notifications, cap changes or uncertain-hold release.
- Previous frozen paid scopes are exhausted; no new paid call until separate bounded approval.
- Keep Cloudflare task qualification gates intact. Evaluations must not qualify themselves.
- Real articles remain immutable; synthetic correction controls must be labelled separately.
- AI-assisted review is not independent human ground truth.

## Review focus

- Reject evidence identity/content changes, including conflicting copies of one saved article.
- Report failures and partial stages, rather than excluding them from latency results.
- Separate snapshot import from live network acquisition, and billing delay from model response.
- Do not equate textual duplication checks or provider ACCEPT with editorial quality.
- Prevent isolated evaluation editions from being confused with public publication.

## Tasks

- [x] Add hash-bound real corpus import, exact ClaimMention extraction and stage instrumentation; test changed evidence and failed-stage measurement.
- [x] Implement isolated full pipeline runner with production functions, injected model ports, persistent output checkpoints and explicit V2 validation.
- [x] Add quality review artifacts covering importance, evidence support, omissions, repetition, corrections and attribution; keep semantic review pending unless actually reviewed.
- [x] Run offline preparation and relevant regression checks, create exact bounded paid proposal and document remaining live blockers.
- [x] After explicit spending approval, run both routes with identical source corpus and model mappings; retain raw results, actual cost and all failures; review complete briefings and commit/push results.


## Execution ledger and rulings

- Authorized workflow: 24 calls / $2.50 conservative reservations, immutable four-hour window ending 2026-10-20T19:04:35.261Z. Migration 0066 separately approved and installed; original five grants and 50 holds snapshotted unchanged.
- Baseline: nine paid calls, $0.372776 actual. Both routes failed closed at UNDISPOSED_PARENT_FACT; no writing/verification or useful-briefing latency. Full baseline retained separately in `benchmarks/news-end-to-end-baseline-results.json`.
- Ruling: evaluate opt-in whole-parent references as a distinct policy/question, preserving the original baseline and every authoritative source fact. Existing production configuration remains unchanged. A policy successor is allowed only after a conclusive, token-matched settled semantic rejection; successful/unknown old scopes remain fenced.
- RED to GREEN: compact source reference ownership tests and full offline compact V2 integration; 31 focused worker tests passed, including seven known/unknown successor cases. Independent read-only review found no actionable issues.
- Compact OpenRouter stream: completed generation retained, adapter failed before usage confirmation. Metadata-only recovery proved exact dated GPT-4.1 generation and $0.110432 actual cost; no inference reissued. Strict offline editorial decoding accepted the retained result. Append-only local operator recovery retained original semantic result and settlement byte-for-byte; this is operator-assisted evidence, not unattended success.
- Compact Cloudflare again failed complete dispositions. OpenRouter recovered plan reached scoring but was blocked by the unchanged p.m./PT source-boundary guard before paid writing. Separate shared AI-curated writing/verification controls returned ACCEPT on both routes; source review identified qualifier/coverage concerns. No primary edition, no qualification.
- Ruling: do not make spurious reconciliation calls when compacted schemas fit naturally. This real cohort does not qualify parallel packet reconciliation; deterministic packet benchmarks remain separate evidence.

- Final accounting: 15 paid calls, $0.727884 actual, $2.2068431 conservative reservations; all settled. Read-only postflight proved original five grants/50 holds unchanged and lifetime actual-plus-held $65.6207170953 under unchanged $73.
- Scope reporting: primary arms remain FAILED with null useful-briefing latency; four downstream control operations are separately bound to their exact frozen requests and 12 source-owned facts. Operator assistance and unavailable recovery sub-timings are explicit; full prose stays local.
- Final focused verification: news benchmark offline 12 passed, strong-route/billing 13 passed; worker/publication 65 assertions passed. Native exit-status rerun and final review are recorded in local logs. Worker, news benchmark and strong-route typechecks passed; the native worker test rerun exited zero and final read-only review found no material issues.
- Completion means this evaluation was executed, failed/accepted cases reviewed, and artifacts retained. It does not mean the feature is production-qualified; grouping, editorial coverage, source context, writer/verifier quality and real packet/concurrent billing qualification remain blocked.
