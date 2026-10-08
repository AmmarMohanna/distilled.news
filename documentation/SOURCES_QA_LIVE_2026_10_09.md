# Source connector QA, 2026-10-09

This is a snapshot of the isolated `distilled-news-sources-qa` Cloudflare Worker, D1 database, R2 bucket, and processing queue. It is not the shared staging deployment. All five QA sources were disabled after the tests. The QA Worker's aggregate and per-operation paid-provider limits were returned to zero.

| Source | Live result | Distinct candidate items | Limitation |
| --- | --- | ---: | --- |
| BBC World RSS | HTTP 200, durable intake and downstream acquisition | 48 | RSS entries are excerpts; collection coverage is not historical completeness. |
| Google News query, “Lebanon electricity” | Free RSS path reached intake and downstream acquisition | 103 | Several later free fetches were transient; the paid Google fallback stayed disabled. |
| NASA X profile | TwitterAPI.io HTTP 200 and 20 items accepted after the envelope parser fix | 20 | Earlier responses were wrongly classified `MALFORMED` because posts appeared under `data.tweets`. The first run completed via Apify fallback. The final primary-path retest stopped after one page. |
| NASA LinkedIn company | Apify run completed and reached intake and downstream acquisition | 19 | This proves the tested actor path, not long-term recall or coverage. |
| NASA JPL RSS | Cloudflare Worker fetch received HTTP 403 | 0 | The publisher blocked this Worker route. Local-machine HTTP 200 did not predict Worker access. |

The X and LinkedIn Apify runs each had one HTTP 201 actor creation and later HTTP 200 status/dataset operations. Final QA reservation totals were $0.20 for TwitterAPI.io, about $0.25 for X Apify, and about $0.25 for LinkedIn Apify. Reservations are conservative ceilings, not provider invoices. Later X polls were blocked by the budget fence. No Google Apify or Zyte call was funded. The configured limit for every provider is now zero; historical reservation totals remain in D1.

The first live X response exposed a parser mismatch: `data.tweets` held 20 posts while the connector only read top-level `tweets`. The connector now accepts both forms and preserves the top-level pagination fields. A subsequent capped live poll produced 20 intake receipts with no new X Apify operation.

Repeated polls generated more intake receipts than distinct candidates: 1,146 BBC receipts for 48 candidates and 2,890 Google News receipts for 103 candidates at the recorded snapshot. Stable identity prevented duplicate candidates, but repeated observation storage merits a D1/storage-cost review before continuous operation.

The QA Cron Trigger initially showed no firings. An isolated one-minute probe later recorded 129 firings, confirming that scheduled execution began after propagation. The authenticated QA maintenance endpoint was used during diagnosis. The temporary probe Worker and its QA-only table were removed afterward.

Telegram is covered by synthetic VPC-binding tests, not a live QA collection. The VPC service binding and `SOURCE_EXECUTION_TOKEN` are present, but no verified Telegram channel identity and live Telethon session were exercised here. Website/Zyte extraction was also not tested from this product QA feed editor.
