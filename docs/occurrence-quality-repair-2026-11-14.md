# Occurrence-aware briefing quality repair — 2026-11-14

Live inspection found that the 12:30 Beirut window discarded new reports of an explosion in Qantara and shelling in Mansouri/Majdal Zoun/Wadi Zibqin as repetitions of incidents in older briefings. The 13:00 depot and IMF exclusions were defensible repeats. Both quiet windows completed on schedule; timely completion did not establish editorial correctness. The independent evaluator flagged missed developments in both, while an earlier published-edition review failed with `MISSING_DEVELOPMENT_ASSESSMENT`. Grafana export and evaluator discovery were running.

## Change

New V3 snapshots freeze `noveltyPolicy: occurrence-aware-v1` into their fingerprint. The editor, consolidation, novelty check and verifier distinguish a separate occurrence from later coverage of the same incident or unchanged state. Novelty receives full cited source text, original publication timestamps, and exact timestamps of prior reader coverage. Publication time remains context, never an inferred event date. A duplicate decision must name supplied prior IDs and explain the same incident/state; the explanation is retained in dropped-item/source-decision records. New-policy drafts no longer bypass this comparison solely because their text exactly matches an older headline. Legacy snapshots preserve their original options, prompt bytes and paid request identities.

The policy preserves concise reported-event headlines and all supporting citations. It does not require casualties or an independent confirmation before an attributed concrete occurrence can qualify, and it does not make a new outlet, recurring statement or fresh publication timestamp a substantive update. Factual verification and repair remain mandatory.

New edition payloads retain the approved source catalog display name using an indexed join in the existing citation query. Publisher IDs and evidence IDs are unchanged. Presentation uses the retained name, article title, then publisher ID, avoiding the generic `Source` fallback. Old immutable artifacts are not rewritten; absent historical names use retained identifiers.

The separate evaluator enforces the frozen inventory's coverage count and IDs in its provider schema. A received incomplete assessment may take one separately identified completeness correction, then must pass all original evidence and completeness checks. Recovery is restricted to settled, retained responses with no unknown/missing-body or previous correction calls. It replays original paid stages and preserves original response bodies, charges and failures; uncertain calls cannot be resent. No schema migration, model routing, monetary cap, feed allowlist or production binding was changed.

## Real-model qualification

The secret-free record is `benchmarks/occurrence-novelty/qualification-2026-11-14.json`. It contains public source URLs/dates/hashes, expected inclusion/exclusion labels, final prose, model usage and durable operation IDs. These were private qualification inputs, not canonical requests or public editions. Historical windows/results were not rewritten.

- New Qantara explosion plus shelling: two concise attributed headlines, all three supporting sources retained, no invented event date and no missing-detail commentary. Three model calls; reported cost $0.0149704.
- Same depot and IMF state: neither republished; duplicate explanations identify prior reader items. Three model calls including schema correction; reported cost $0.027986.

Earlier candidates retained the unchanged IMF story or added unnecessary missing-detail prose and were rejected before deployment. Only the final qualified policy is released. Curated controls do not establish general recall, semantic truth or production latency. External administrative D1 transport and provider caching affect timing/cost; these subset prices are not a full-briefing cost estimate.

## Validation and deployment

Final validation and actual release identifiers are recorded below. Local test infrastructure stalled once; its verified test process tree was stopped before rerunning. Source-integration checks passed; citation batching, source identity and withdrawal checks passed on rerun. Evaluator tests cover completeness correction, one-time settled recovery, UNKNOWN preservation and unchanged paid-stage identity.

Final checks: all 373 briefing tests, 93 evaluator tests, 13 source-integration tests, 12 citation/visibility/batching tests, and 8 focused frozen-window/accounting/replay tests passed. The broad window run was stopped after unusually slow local execution; the other 94 window tests are not claimed as newly passed. Worker and evaluator type checks and both staging bundle checks passed. Novelty evidence uses the existing evidence-size batching mechanism without truncating or dropping cited text; a regression checks local/global ownership across those batches.
