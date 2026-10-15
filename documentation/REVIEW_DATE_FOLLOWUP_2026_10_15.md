# Review and date follow-up — October 15, 2026

Branch: `backend-sources-mixed-source-fixes`.

Merged `7fb7c0d` from `integration/backend-sources-ai-editorial` with merge
commit `46da843`. This distinguishes an unstarted publication intent from an
unknown provider call; uncertain paid executions remain protected.

## Dates and traceability

The inspected Telegram item https://t.me/cointelegraph/72635 was published
October 13 at 12:20:24 UTC (15:20:24 Beirut). Its retained reference correctly
showed October 13. The feed first discovered it October 15 and published it in
the October 15 edition. No October 14 reference-date corruption was reproduced.
Source publication, source edit, discovery and edition publication timestamps
are distinct; discovery must not replace the original source date.

Existing `freshness` and `reader-novelty-age` regression tests preserve original
report dates, mark older reporting `OLD_RECAP`, require historical framing and
prevent already communicated facts from becoming new again. Older reader-unseen
reporting remains eligible by the current explicit editorial policy; this patch
does not silently change that policy into a strict publication-date cutoff.

## Review continuation

After successful reassessment and release of the Feed intelligence turn, the
queue consumer attempts one next durable due reassessment in the same feed.
It rotates through approved sources, honors retry times and active transport
claims, and does not change attempts, evidence, model-operation identity or
financial authorization. Cron remains recovery if continuation fails. A failed
continuation logs `V1_REVIEW_CONTINUATION_FAILED` rather than failing already
completed review. This logic lives outside `v1-intelligence/runtime.ts`.

This reduces cron gaps; it does not remove the canonical per-feed lease, resolve
semantic/model failures or guarantee that incoming throughput stays below review
capacity. Collected items can also fail acquisition, be unauthorized, remain in
retry or be obsolete: collection count is not a count of reviewable revisions.
Do not mark unresolved jobs DONE or publish unreviewed evidence to clear a backlog.

## Rollout acceptance still required

Deploy this exact branch, then follow a real scheduled window: count due,
running, completed, retrying and terminal jobs separately; inspect failure codes
and oldest pending age; confirm pending work drains under continued collection;
compare completion time with the feed frequency. Audit original source dates,
retained evidence and the published claims. Local regression success alone is
not evidence that the live backlog or all semantic failures are fixed.

## Local validation

38 distinct regression tests passed across review continuation (4), intelligence
turn fencing (9), queue dispatch (5), adaptive publication (7), reader novelty
and dates (5), review graph prefetch (2), and freshness (6). Worker typecheck,
staging Worker dry-run build and `git diff --check` passed. No deployment or
production throughput claim is made by this change.
