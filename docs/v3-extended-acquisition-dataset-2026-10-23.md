# Extended acquired-content benchmark dataset

A separate private extended export was prepared at `.local-reports/v3-extended-acquisition-20261023/`. The original 20-window pilot and ZIP were left unchanged. All acquired text and private snapshot files remain in Git-ignored storage.

## Contents

| Measure | Extended export |
| --- | ---: |
| Interval files | 95 |
| Feeds | 13 |
| Half-hour windows | 91 |
| One-hour windows | 2 |
| Two-hour windows | 2 |
| Distinct acquired content IDs | 565 |
| Article occurrences across all cases | 817 |
| Distinct acquired IDs added beyond pilot | 325 |
| Empty retained-input windows | 12 |
| Records retained separately with unknown availability | 89 |

Languages are Arabic, English and French. Source types are RSS, Google News, LinkedIn company, X profile, website and Telegram channel. Per-window volume ranges from 0 to 93 acquired records. Longer-duration experiments overlap shorter cases, so occurrences do not represent unique articles or stories.

The 13 feeds cover World News, Lebanon and the Levant, humanitarian developments, the global economy, space, energy, public health, science, European policy, education, culture, open source software and transport. Exact historical interests and languages are preserved.

## Continuity

The World News sequence has 46 consecutive half-hour windows from October 22 at 15:30 UTC to October 23 at 14:30 UTC: 23 hours with no gaps. Twelve other sequences contain three consecutive half-hour windows from October 21 collection sessions. Economy, Health and Open Source each have a separate three-window October 23 sequence. Four longer-duration cases are independent experiments. Sessions separated by unobserved days are not joined into a continuous track.

The private `continuity-index.json` identifies 76 later article occurrences with a prior exact URL or text match within their track. The long World News sequence includes 47 such later occurrences, 38 with a matching URL and different text; Health's October 23 sequence adds two changed-text cases. These are mechanical indicators only. They do not certify meaningful updates, corrections, conflicting claims or cross-publisher development identity. No importance annotations or ideal summaries were created.

## Freeze, privacy and replay

This dataset uses the same retained snapshot as the pilot, frozen at `2026-10-23T14:53:15.891Z`. All 240 distinct acquired IDs from the pilot also occur in the extension. The two sets are not independent held-out evaluations. Additional windows and 325 additional acquired records broaden coverage without claiming new live acquisition.

Each interval uses acceptance-receipt availability time and `[start,end)` membership, preserving full text, original timestamps, stable acquired/source IDs, original revision IDs, acquisition quality and provenance. No relevance filtering or semantic deduplication was performed. Retrospective availability replay grids are distinct from original product scheduler windows and production freshness policy.

The ZIP includes the source snapshot, interval plan, interval JSONs, chronological manifest, continuity index, validation report, replay instructions and file checksums. Unknown-availability records remain in `unassigned-acquisitions.json`; no acquisition/publication timestamp was substituted to assign them. The source snapshot contains all 912 original acquired records, including those outside the selected intervals.

Empty arrays mean no retained accepted acquisitions became available, not guaranteed healthy collection or absence of news. Four empty windows have no recorded fetch start within that half-hour; eight have at least one. This distinction is retained in the validation report. Initial publication history is unavailable for 12 tracks and represented as null. Record any deliberate cold start and feed actual generated published reader text into subsequent windows.

## Verification

All 95 cases were rebuilt from the entire snapshot and compared exactly, confirming that no matching record was omitted. Checks covered full text, original IDs, publication/acquisition/availability timestamps, case hashes and chronological adjacency. The three existing exporter tests passed. Original pilot file checksums were rechecked without changing its content. No application code, live feed state, provider budget or deployment was changed, and no acquisition or inference calls were made for this extension.
