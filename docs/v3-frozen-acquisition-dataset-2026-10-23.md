# Frozen acquired-content benchmark pilot

Prepared from read-only QA storage on October 23, 2026. Full article/post text is confined to ignored private storage under `.local-reports/v3-frozen-acquisition-20261023/`. Do not commit or publish that directory or its archive. This document contains metadata only.

## Delivered pilot

- 20 interval JSON files across five feeds and Arabic, English and French.
- 18 half-hour cases in six independent three-window chronological sequences, plus one 60-minute and one 120-minute case.
- 240 distinct acquired record IDs, appearing 400 times across the cases because longer independent tracks overlap shorter cases. This is not a count of unique stories.
- Per-window volumes: 0, 1, 1, 1, 3, 3, 4, 6, 7, 9, 10, 10, 16, 24, 26, 27, 35, 57, 67 and 93 records.
- Stored source types include RSS, X, Google News, Telegram and LinkedIn company posts.
- The snapshot retains 912 acquired records; 89 without an established intelligence-availability timestamp are preserved separately with original text and provenance, not assigned using a guessed timestamp. Other timestamped records outside the selected intervals remain in the private snapshot.

Feeds: Lebanon and the Levant; Space and Astronomy; Europe: decisions and consequences; Public Health and Medical Research; World News—Major Developments. Exact historical interests and output languages are read from retained feed versions, not reconstructed descriptions.

## Field mapping and semantics

| Export | Stored equivalent |
| --- | --- |
| id | acquired content ID; original evidence revision ID additionally retained |
| sourceId | acquired/observed source identity; feed-source identity also retained |
| sourceType | stored source kind, without relabelling |
| title / url / publishedAt | acquired title, canonical URL and publication timestamp; missing values null |
| acquiredAt | original acquisition timestamp |
| availableAt | evidence acceptance receipt decidedAt for promoted/replayed evidence |
| text | exact acquired body, without whitespace/entity cleanup or truncation |
| contentCompleteness | original stored completeness |
| provenance | original observation, receipt, source/revision identities, quality, publication-date evidence and text hash |

Membership uses `[windowStart,windowEnd)` in UTC. The dataset uses retrospective availability replay grids; these are not representations of historical scheduled briefing requests. Production V3 additionally uses observation/publication time and product freshness policy. Exporting this dataset does not change that behavior. The reusable `toBriefingInput` adapter maps the dataset into the existing V3 input contract without modifying V3; null publication dates become its existing empty-string sentinel only at that boundary.

No relevance filtering or semantic deduplication was performed. Replays, stale publication dates and extraction imperfections are retained. Acquisitions not established as available to intelligence, including quarantined/unaccepted outcomes, remain in the unassigned file. The snapshot is a paginated read with an acquisition cutoff, not a transactionally atomic database backup.

## Continuity and remaining coverage limits

Mechanical recurrence checks find repeated URLs or identical text in later Lebanon, Space, Health and World News intervals. Health and World News also contain later records with the same URL and different text. These are useful revision/repetition candidates; changed text alone does not establish a meaningful development, correction or conflicting claim. Cross-publisher development identity, correction cases, conflicts and confirmation-only reports have not been semantically certified. The pilot must not be presented as satisfying all those scenarios yet.

The empty half-hour contains no accepted arrivals and five recorded fetch starts. This establishes an empty retained-input window, not proof all sources were healthy or no news occurred. High volume does not imply importance.

Each sequence is a separate replay track. Longer overlapping cases are separate experiments, not subsequent windows. Retained V3 input history is preserved where available; missing initial history is null, not an invented empty published history. No published edition records were present in the snapshot. An evaluator choosing a cold start must record that choice and use actual generated published reader text for subsequent windows. No ideal summaries or importance labels were prepared.

## Reuse and verification

`scripts/export-acquired-benchmark.mjs` takes a private snapshot, explicit interval plan and Git-ignored output directory. It refuses overwriting an existing dataset directory. The private manifest records chronological case order, independent tracks and SHA-256 hashes. Its private README describes replay semantics and limits.

Validation compared every exported body, content ID, publication/acquisition timestamp and availability timestamp against the snapshot; checked case hashes and interval membership; and confirmed source types and count totals. Three focused tests cover exact-text preservation and half-open boundaries, unknown availability, and carrying actual reader history through the V3 adapter. All passed. No model calls, new acquisition, feed changes or deployment were performed for this export.
