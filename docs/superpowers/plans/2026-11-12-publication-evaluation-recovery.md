# Publication and evaluation recovery plan

**Goal:** Restore scheduled staging briefing publication and trustworthy evaluation progress across feeds, without spending quotas, manufactured news or replay of unknown paid calls.

**Architecture:** Repair the demonstrated intake dispatch/read bottlenecks, make frozen/uncertain V3 windows reach an honest recoverable disposition while carrying evidence forward, and recover transient evaluation failures using exact settled responses. Preserve source scope, source revisions, reader history, immutable window identities, reservations and receipts. All fixes apply generally rather than hard-coding this feed.

**Tech stack:** Cloudflare Workers, D1/R2/Queues, TypeScript, Vitest and retained live evidence.

- [ ] Intake: identify acquisition/reassessment stalls and D1 hot queries; write regressions, implement selective/durable queue progress.
- [ ] V3: reproduce obsolete frozen inputs and dispatch-skipped isolated calls; repair safe dispositions and carry-forward without changing old paid requests.
- [ ] Evaluator: expose original failure classes and safely retry transient read/storage failures without new paid calls when settled bodies exist.
- [ ] Preserve honest publication progress and failed/unreviewed quality reporting.
- [ ] Run targeted suites, TypeScript and package checks; review the combined diff.
- [ ] Deploy staging and verify actual new publication and evaluation results, source coverage and preserved old charges. Record limitations precisely.

Parallel owners: intake agent owns connector/intake scheduling; evaluator agent owns evaluation/briefing-quality; primary owns V3 publication/recovery and integration. No live mutations or deployment by subagents.
