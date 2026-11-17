# LinkedIn QA retest after Apify limit increase

The user confirmed that Apify's external monthly hard limit had been increased. The focused retest ran on October 23, 2026, approximately 10:45:12–10:50:39 UTC (13:45–13:50 Asia/Beirut). No application code, deployment or budget configuration changed.

## Results

| Approved LinkedIn source | New post observations | Additional retained bodies | Outcome at cleanup |
| --- | ---: | ---: | --- |
| World Bank company | 20 | 4 | Posts collected and content persisted; pagination and acquisition still pending |
| GitHub company | 20 | 7 | Posts collected and content persisted; pagination and acquisition still pending |
| Bill Gates profile | 0 | 0 | Actor succeeded, but its retained dataset response was an empty array |

The external quota rejection no longer prevented these actor submissions. This establishes recovery from the earlier monthly-limit failure, not complete acquisition of every available post. Bill Gates remains an unresolved empty-result case; a successful actor status does not establish that the profile was scraped correctly. Its current retained status response reports SUCCEEDED, finished at 2026-10-23T10:46:42.191Z, and the dataset is empty.

## Procedure and limits

The three existing QA dataset feeds were resumed, and ordinary feed-control jobs were requested. Their other enabled sources could also run during this interval: this was not an isolated three-source cost experiment. Existing eligible LinkedIn jobs and their continuations were manually dispatched through the collection queue. Frozen historical failures, original actor identities, accounting and unknown-outcome fences were preserved. One local wake-evidence write encountered an existing filename after dispatch; subsequent status reads confirmed the submitted jobs, and later wake evidence used a distinct filename.

All three feeds were verified paused after restoration. No briefing was manually triggered. Pending jobs and collected evidence were retained. Counts came from remote D1 read-back and may differ across queries because in-flight work could finish during cleanup. Remaining pagination and content acquisition were not labelled complete.

## Accounting and evidence

The three LinkedIn sources each added $0.250002 in conservative provider reservations, totaling $0.750006. These are reserved ceilings, not confirmed Apify invoices. The shared daily ledger increased by $1.190006 across all activity during the interval and ended at $8.280018 against its unchanged $15 limit. Other enabled sources and existing work contribute to that shared total.

Local evidence is retained in `.local-reports/linkedin-after-apify-increase-20261023/`: the manifest, before/final-active/after-restoration snapshots, wake records, Bill Gates response references and downloaded retained responses. The downloaded status records include an older October 21 run; the October 23 status and empty dataset distinguish the current outcome.

## Bill Gates follow-up diagnosis

The stored request used `https://www.linkedin.com/in/billgates/`, an item limit of 20 and empty date bounds. Thus a reporting-date filter did not remove these posts. LinkedIn's indexed public profile identifies Bill Gates of the Gates Foundation at [linkedin.com/in/williamhgates](https://www.linkedin.com/in/williamhgates), with visible recent activity. The configured demo locator is wrong for the intended person; this is the strongest explanation for the empty actor result. A corrected-locator acquisition has not yet been tested.

The incorrect locator appears in both demo feeds 11 and 40 and their source catalog. Earlier retained evidence already recorded HTTP 404 and advised revalidating it in `documentation/DEMO_SOURCE_COLLECTION_CHECK_2026_10_21.md`. Historical reports should retain the original URL as evidence. The existing dataset is empty before application normalization; this was not a local post-parsing loss. The actor reported `no-result: 1` and `usageTotalUsd: 0.00105`. That reported run cost is separate from the conservative $0.25 submission reservation.

The [actor input schema](https://apify.com/harvestapi/linkedin-profile-posts/input-schema) accepts the fields used by this adapter. Direct run-log and INPUT reads were attempted without starting a new actor, but the local Apify credential received HTTP 401/403. No live source settings or application code were changed during this diagnosis.
