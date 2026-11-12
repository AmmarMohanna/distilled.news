# Cutoff editions � staging rollout, 2026-11-13

Scheduled V3 editions now use evidence accepted and observed before their existing cutoff (five minutes before scheduled delivery). Unfinished acquisition and review no longer hold a new edition. Work remains pending for later editions; coverage records `INCOMPLETE` and `INTAKE_DEFERRED_AT_CUTOFF`. An empty incomplete edition is deferred, never fabricated or labelled complete.

Delayed preparation reconstructs the immutable revision ready at cutoff. Updates accepted afterward become candidates for a subsequent edition, with original publication dates and the existing relevance/novelty checks. A retained deletion prevents a later restoration from authorizing the deleted revision. Disabled/deleted sources and feed revision changes remain publication fences.

New snapshots persist `READY_AT_CUTOFF_V1`. Retained markerless frozen inputs, models, paid identities and receipts keep their existing policy. No monetary, article or source limit is introduced. The change applies to scheduled V3 windows across feeds; manual and legacy relative-window contracts remain unchanged.

Migration `0092_cutoff_tombstone_lookup.sql` provides the indexed deletion-history check. Staging migrations 0090�0092 applied successfully; 0090 and 0091 were already-created additive indexes and their migration records are now current.

Validation: regression tests exercise unfinished acquisition/review, late acceptance carry-forward, updates during inference, delayed first preparation, source revocation, deletion/restoration, dispatch and legacy frozen input preservation. Supporting coverage, priority dispatch, scheduling and semantic-operation suites passed 68 tests. Full V3 rerun: 71 passed; one new dispatch fixture incorrectly included older missed windows. Its clock origin was corrected and the dispatch regression reran successfully (1 passed). All 72 briefing cases are verified; 68 supporting tests passed. Worker TypeScript and staging bundle dry run passed. A separate read-only review found no remaining rollout blocker.

Before deployment, Lebanon-2 had one pending 23:30 UTC edition with cutoff 23:25, held by `AWAITING_INTAKE_REASSESSMENT`. Its most recently published edition was created at 23:38 UTC for an older scheduled window. This is baseline evidence, not proof of the new policy.
