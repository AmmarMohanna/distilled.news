# X live QA verification — October 10, 2026

X profile and topic-query acquisition were exercised against real NASA posts in the
isolated `distilled-news-sources-qa` Worker. Both TwitterAPI.io and the configured
Apify actor returned live records. This establishes bounded collection and intake,
not exhaustive recall, continuous polling capacity, or a newly published X edition.

## Results

| Approved source | Provider | Result in this follow-up |
| --- | --- | --- |
| `https://x.com/NASA` | TwitterAPI.io | Three completed page steps: 6, 14 and 20 observations/proposals; 40 total. Further continuation remained available. |
| `https://x.com/NASA` | Apify | One actor start, 20 observations/proposals, then an empty dataset page. |
| `from:NASA lang:en` | TwitterAPI.io | Two page steps, 20 observations/proposals each; all 40 distinct query items have intake receipts. Further continuation remained available. |
| `from:NASA lang:en` | Apify | One actor start; the saved raw dataset contains 20 posts, all authored by NASA. The collector suppressed unchanged records already collected by the primary provider, producing zero new observations/proposals. The next dataset page was empty. |

Every completed page was immediately replayed with the same logical probe request.
The query probes additionally measured provider-operation counts and reserved ceilings
before and after each replay: every replay added zero operations and zero reservations.
Actor continuations reused the original run rather than starting another actor.
All 20 saved Apify query post IDs match accepted primary-provider query inputs;
zero new observations therefore does not mean an empty upstream result.

The first TwitterAPI.io profile attempt returned HTTP 502. Repeating the logical
probe completed successfully, but this follow-up includes four new profile operations
for three completed steps. The cause of the initial error was not established;
do not describe that attempt as proven charge-free recovery. All final operation
records have saved payload references.

Sample accepted query posts retain publisher `x:11348282`, `SOCIAL_POST`
representation, `UNKNOWN` content completeness and publication timestamps:

- <https://x.com/i/status/2108664469756997737> — 2026-10-09 21:02:41 UTC.
- <https://x.com/i/status/2108662426606395572> — 2026-10-09 20:54:34 UTC.
- <https://x.com/i/status/2108634944255742173> — 2026-10-09 19:05:21 UTC.

## Implementation and tests

- `b96605f`: authorized QA probes accept `x_twitterapi_io` and `x_apify` for approved
  X profile/search scopes. Other source families remain rejected.
- `6d9b448`: the single approved Apify topic query is sent in `twitterContent`, with
  bounded item count and charge ceiling regression coverage. The actor's full
  [input schema](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest/input-schema)
  supports both `twitterContent` and the previous `searchTerms` array. This change
  uses a supported alternate format; it is not evidence that the previous field was broken.
- Connector suite: **185 passed**. Relevant Worker suites: **35 passed** across
  source QA, connector runtime and source backend. Connector and Worker typechecks passed.
- The earlier full serial Worker result remains **883 passed, 10 skipped** on
  `0fa2d98`; the entire suite was not rerun for this follow-up.

## Spend and isolation

The user authorized $10 per source. Temporary aggregate fences were only $1 for
TwitterAPI.io and $1 for X Apify, including historical reservations. Per-operation
ceilings were $0.05 and $0.25 respectively; other providers stayed unfunded.

| Provider | Before reserved ceiling | After reserved ceiling | Added |
| --- | ---: | ---: | ---: |
| TwitterAPI.io | $0.20 | $0.50 | $0.30 |
| X Apify | $0.250004 | $0.750012 | $0.500008 |

**Total added reserved ceilings: $0.800008.** These are conservative internal
reservations, not verified provider invoices. There were two intended new Apify actor
starts, one for the profile and one for the query. Final totals, including history,
are 10 TwitterAPI.io operations and 15 Apify operations, with no unsaved payloads.

Both X test sources and their intake scopes were disabled after collection.
Final deployment **`42f17a4b-d7cb-4e38-968a-fa67974b667b`** restores the checked-in
zero-budget configuration and keeps `crons = []`. A subsequent manual maintenance
tick returned HTTP 200; remote audits confirmed zero enabled sources, zero enabled
intake scopes and all five paid-provider budget limits at zero. Retained X operation
totals and reservations did not increase. Production, shared staging, the friend's branch and remote Git branches
were not changed. Raw datasets and authorization material remain in ignored diagnostics.

## Remaining limits

- These bounded samples do not prove all historical or newly posted X content is recalled.
  Empty Apify dataset pagination establishes exhaustion of that actor run, not of X.
- Automatic primary-failure-to-Apify selection was not forced in this follow-up;
  each provider was exercised through its authorized QA probe.
- X edits/deletions and uncertain actor-start responses require separate controlled tests.
- A fresh frontend-to-published-X-edition flow and sustained multi-feed polling study
  remain rollout gates. Query intake has receipts but no new query evidence/edition
  was established in this run.
