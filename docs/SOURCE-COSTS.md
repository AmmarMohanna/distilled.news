# Source and model cost controls

Last reviewed: 29 July 2026

Provider prices and actor behavior can change without a code change. Values
below are configuration assumptions and safety limits, not a price quote.
Verify the provider account before enabling a source in production.

| Source | Network path | Configured cost assumption | Default hosted state |
| --- | --- | --- | --- |
| RSS | Direct public fetch | No provider fee; Worker and storage usage apply | Enabled |
| Public Telegram | Direct public channel fetch | No Telegram API fee; Worker and storage usage apply | Enabled |
| Google News | Apify `groupoject/google-news-scraper`, build `1.1.1` | `$0.50 / 1,000` results plus actor minimums | Enabled |
| Google News fallback | Apify `solidcode/google-news-scraper`, build `1.0.10` | Production Bronze: `$1.20 / 1,000`; staging Free: `$1.50 / 1,000`, plus actor minimums | Used only after eligible failure |
| X | Apify `xquik/x-tweet-scraper`, build `1.1.3` | Production Bronze: `$0.15 / 1,000`; staging Free: `$15 / 1,000`, plus actor minimums | Enabled |
| LinkedIn | Configured Apify actors | Verify live pricing before use | Disabled |
| Generic Apify | User-selected actor | Unknown until reviewed | Disabled |
| Brave Search | Brave News API | Code assumption `$0.005` per request | Disabled; storage rights must be confirmed |
| OpenAI | Through Cloudflare AI Gateway | Token rates from runtime configuration | Optional |

Hosted global hard ceilings are `$5/day` and `$25/month` for collection,
`$5/day` and `$150/month` for model use, and `$175/month` total. The collection
ceiling intentionally does not let all 50 accounts consume their full
account-level allowance at once; the shared ledger applies aggregate
backpressure first. Backend
collection controls cap each hosted account at `$0.25/day` and `$5/month`.
Model controls cap each hosted account at `$0.10/day` and `$2/month`.
Staging is capped at `$0.50/day` and `$4/month` for collection,
`$38/day` and `$150/month` for model use, and `$154/month` total. Staging model
controls use separate `$0.75/day` and `$3/month` account caps; production
remains at `$0.10/day` and `$2/month`. The staging model cap is a reviewed
canary exception, not the public product allowance.

Staging also pins request bounds for every model purpose: item summaries use
2,304 input / 160 output tokens, importance reviews 2,048 / 80,
event-equivalence reviews 3,072 / 80, and edition synthesis 19,500 / 400.
Reservations use the UTF-8 input-byte upper bound plus chat framing and the
full output maximum. The 50-account canary's designed worst case is
`$29.810200/day`, including every bounded ingestion review and a primary plus
fallback edition attempt, leaving more than 25% below both the `$0.75` account
and `$38` global daily caps. The monthly ceilings provide four designed canary
days with the same 25% headroom, so a late failed window does not make a fresh
24-hour run impossible while the append-only ledger retains prior spend.
Production retains its existing 300-token summary,
80-token review, and 1,600-token edition output limits.

Google News collection follows the feed cadence instead of treating every
subscription as hourly: hourly feeds are eligible every hour, daily feeds every
six hours, and weekly or monthly feeds every 24 hours. Retries remain separately
bounded. The launch canary places Google News and X on different accounts so
each paid path has an independent account-level budget.
Both request one result every six hours. The X reservation is at most
`$0.08/day`; Google News is at most `$0.16/day` even if each primary start is
followed by a fallback start. Both include the `$0.02` minimum run reservation,
and the release gate fails on primary, fallback, or Actor-start price drift.

The hosted paid-source beta is additionally limited to four distinct account
seats across X and Google News. One account claims one seat when its first paid
source is added and may use both providers within its per-account limits. Its
seat is released when its last paid source is removed. The capacity is shared,
reported by `/api/capabilities`, and enforced atomically in D1 before source
creation. RSS and Telegram remain available when all four seats are claimed.
Self-hosted deployments do not set this hosted seat policy and are uncapped.

The append-only spend ledger reserves estimated cost before a paid action,
settles the difference after completion, and releases reservations on eligible
failures. Provider calls must fail closed when a reservation is denied. Actor
build tags are immutable configuration; `latest`, `main`, and `master` are not
acceptable in hosted mode.

Before a release deploy or registration preflight, the protected operator gate
uses `APIFY_READINESS_TOKEN` when present, otherwise the existing
`APIFY_API_TOKEN`, to read the current Apify account and Actor APIs. The
readiness credential is CI-only and is never written into Worker bindings.
Production pins user `RXAjmHtQRbA38IAbw`, the Bronze tier, and the current exact
`$29` monthly account limit while retaining a lower `$25` collection cap.
Staging pins the isolated `distilled-news-staging` user
`5clcKRgkjN3Q9GnDB`, the Free tier, and an exact `$5` monthly account limit,
while keeping its collection cap at `$4`. The gate requires the exact user,
tier, and account limit plus enough remaining monthly headroom for the full
environment collection cap. It also verifies each enabled Actor's pinned
succeeded build and tier-specific live primary-result price against the
reviewed Wrangler configuration. Missing credentials, identity or tier drift,
stale builds, pricing changes, insufficient headroom, or an unsupported hosted
Actor block the operation. The check is read-only and never changes the Apify
billing plan or usage limit.

The release retention check reports spend-ledger growth. Review aggregation
before 250,000 rows or when a UTC day exceeds 10,000 new rows; 1,000,000 rows is
a release-blocking ceiling. Append-only detail is intentional for launch audit,
not an indefinite storage strategy. Before the review threshold, add
account/category/provider daily aggregates, export and checksum settled detail,
retain compact idempotency tombstones, and only then delete fully settled raw
events older than the approved finance/security retention period.

Operational reviews must compare reservations, settlements, releases, provider
invoices, AI Gateway usage, D1 growth, R2 growth, and queue activity. A provider
kill switch should be used before changing a global cap during an incident.
