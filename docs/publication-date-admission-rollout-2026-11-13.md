# Publication-date admission rollout — 2026-11-13

Branch: ghada/v4-transactional-briefing-recovery, based on integration/v4-transactional-readiness.

The missed-window path previously excluded published citations but ignored earlier explicit omissions and redundancy decisions. It could therefore reoffer unchanged old sources on every later edition. New V3 preparations now combine original publication-time eligibility with candidate-indexed earlier decisions. Each admitted source receives a reason: publication window, late discovery, source revision, verification retry, editorial overflow, verified-but-unpublished selection, or an unresolved original window.

Resolution never means deleting retained evidence. Unaccounted input, mechanical duplicate grouping, missing consolidation judgments, true verification retry and old output overflow remain recoverable. New revisions are separate identities and remain eligible. Existing frozen inputs, semantic intent identities, financial receipts and prior outputs are untouched. The policy is in the common backend for all newly prepared V3 feed editions; no new spending or editorial caps were introduced.

The decision lookup reads compact reference/reason metadata once per relevant result, with generation checks across candidate pages and after metadata reads. It preserves the older-schema/backfill fallback and the original carry-only API. It neither downloads unrelated historical source text nor changes the publication/visibility validators.

Validation:
- Three old-behavior regressions reproduced unchanged skipped/omitted/redundant sources returning through a superseded window.
- The full V3/source/carry/date/scaling regression run passed 141 tests. Follow-up tests cover corrected source-revision audit labels and the optimized, generation-fenced lookup.
- Review found no blocker. The metadata issue it identified was reproduced red and corrected.
- A scan-cost regression reproduced repeated result extraction across candidate pages; the final lookup reads each relevant result once.

Real staging comparison, 15:23:07 UTC, using the same retained window and hard guards forbidding writes/provider calls:

| | Previous admission | Corrected admission |
| --- | ---: | ---: |
| Revisions | 958 | 739 |
| Source text characters | 590,318 | 468,945 |
| Total preparation D1 rows read | 30,219 | 30,820 |
| Preparation time through the operator HTTP adapter |46.857 s|51.590 s|

All 219 removed candidates had an explicit prior resolution; no candidates were added. Original publication dates and the persisted frozen input fingerprint stayed unchanged. Provider calls: 0. Writes: 0. The corrected reasons were 702 unresolved original-window sources, 24 late discoveries and 13 ordinary publication-window sources. These remain eligible evidence, not an assertion that every source contains an important development.

This is one read-only admission comparison, not a sustained latency benchmark, independent factual-quality evaluation or proof that staging D1 overload is eliminated. Already-frozen paid work retains its original input; the corrected admission policy applies when a new snapshot is prepared.

Final follow-up validation: 20 decision/carry consistency and scaling checks passed, including the two-phase metadata race fence. The retained-history scaling fixture passed on the final lookup. Six revision/date checks passed after correcting the audit label. Final Worker TypeScript and the exact staging dry-run bundle passed.
