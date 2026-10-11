# Bitcoin feed live collection check — 2026-10-10

Follow-up: the Telegram bootstrap, Google publisher-link resolution and
multi-source scheduling fixes are deployed to QA. See
[the freshness fix report](TELEGRAM_GOOGLE_FRESHNESS_FIX_2026_10_10.md)
for the later verification; the initial findings below are preserved as history.

Checked the owner's newly created QA feed, “Bitcoin ETF flows and US crypto
regulation.” Two bounded manual maintenance ticks collected its free sources;
a separate bounded provider probe collected CoinDesk X. These are live backend
results, not a claim of exhaustive recall or a verified published briefing.

| Source | Distinct accepted item keys | Result |
| --- | ---: | --- |
| Cointelegraph RSS | 30 | Fetched and accepted into intake on the retry. |
| Google News query | 30 | Listings accepted; all 30 canonical links still point to Google News. Publisher resolution remains unverified. |
| Cointelegraph Telegram | 3 | Access and intake succeeded, but the items were message IDs 1–3 from 2016-08-25. New-feed bootstrap is collecting historical backfill, so current-news freshness fails this check. |
| CoinDesk X | 20 | Provider probe returned `HANDED_OFF`; accepted timestamps span 2026-10-08T19:00:01Z to 2026-10-10T15:06:37Z. |

The first RSS and Google batches were rejected at intake with `SCOPE_DENIED`
while later synchronization advanced the feed/scope configuration revision.
Their next collection under revision 10 was accepted. Review multi-source
enrollment/scheduling order; do not count the first fetched batches as accepted.

The X probe had a $0.25 reservation ceiling. The aggregate existing X reservation
increased from $0.50 to $0.75 and paid operation count increased from 10 to 11.
Replaying the exact same probe returned its saved result without increasing
either count. Actual invoiced cost was not reported by the provider response.
Temporary X funding was removed and QA restored to Worker version
`2c55caee-ce7f-4d3c-bc49-80f516c0d871`; all provider budgets are zero again.

Sources remain owner-approved and enabled; regular cron remains disabled.
The final scheduler audit retained two pending provider continuations, one done
provider job and one cancelled provider job. The two initial stale-revision jobs
remain blocked for investigation; the accepted retry RSS job is done.
The direct X probe did not exhaust its continuation or prove complete profile
recall. Telegram backfill and Google link resolution require fixes before these
sources can be described as providing complete fresh articles for this feed.

Ignored local evidence: `.review-tmp/user-feed-check.json`,
`.review-tmp/user-feed-evidence.json`, `.review-tmp/user-feed-final.json` and
`.review-tmp/user-x-check.json`. The free-check script's final metrics query hit
an intermittent Cloudflare API connection error after the second tick; subsequent
successful read-only audits established the final accepted counts above.
