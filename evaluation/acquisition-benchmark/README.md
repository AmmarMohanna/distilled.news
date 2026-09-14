# Distilled.news Acquisition Benchmark

This isolated Python/Node package implements the scraper/API testing infrastructure for the [three-stage plan](../../documentation/SCRAPER_TESTING_STEPS.md). It collects raw evidence, resumes known remote jobs, calls the application's source parsers, extracts articles, scores independent references, and writes JSON, Markdown and CSV reports. It does not deploy or change the Cloudflare application.

**Status:** Offline tests and synthetic end-to-end runs exercise the harness. Real account settings, independent labels and VPS/browser validation are still needed before declaring a provider winner. All live candidates in the stage templates are disabled. The fixtures are invented test data, not evidence of provider performance.

## Implementation map

`adapters.py` dispatches website requests to `routes/zyte_http.py`, `routes/brightdata_unlocker.py`, and `routes/browser_playwright.py`; these share the existing runner, HTTP client, credentials, evidence, and budgets. Direct HTTP/RSS collection stays in `adapters.py`. The standalone `routes/direct_http.py`, `records.py`, and `storage.py` remain an earlier API with separate tests; CLI runs use `runner.py` and `state.py`.

`extractors/` runs Trafilatura and Readability over saved bytes and adds explicit HTML metadata with field provenance. Original extractor title/date values remain in `extractor_metadata`; publication and modification dates are separate. `validator.py` contains response-only article acceptance, `score.py` compares independent references, and `reporting.py` writes the reports. `processing.py` keeps source normalization and compatible imports for existing callers. The CLI commands and saved run structure remain compatible.

Managed-route tests exercise the real dispatcher with mock provider responses, including invalid Zyte envelopes, target errors, rate limits, missing credentials, and byte limits. Zyte envelope and target-body evidence stay separate; Unlocker leaves unobserved target status unknown. Browser tests use a mocked Playwright interface to check both variants' context settings, request guards, final URL recording, network limits, and cleanup after setup/navigation failures. They do not establish that Linux namespaces or Chromium work on the VPS; `server-check` does.

Four controls decide whether a comparison can pick a winner:

- **Browser variants.** `browser_playwright` has `settings.network`: `isolated` (no Chromium network, GET-only, response cookies stripped, pinned client) and `standard` (ordinary Chromium networking, cookies within a fresh context, all methods). They are separate routes and separately scored, so isolation restrictions cannot be mistaken for browser failure. `standard` requires `host_egress_firewall_confirmed: true` in live mode, because its per-request address check does not cover redirects or DNS changes.
- **Window-matched references.** A `complete_window` source reference must declare a `window` equal to the target's collection window, or it is scored as a sample with unknown recall (`reference_window_missing` / `reference_window_mismatch`). Schedules load `references_dir/round-NNN/<target_id>.json`, and `attach-reference` prints each run's `collection_window`.
- **Actual cost.** Reports separate reconciled provider charges, unreconciled reservations and slot-time server allocation from `costs.server_monthly_usd`. `cost_per_usable_result_usd` appears only when `cost_status` is `RECONCILED`.
- **Resources.** On Linux, samples include the dispatcher's whole process tree (Python, Node, Chromium). Live runs stop new dispatch after sustained low memory or high CPU (`capacity_stop`).

## Install and run offline

Start with [SERVER_START_HERE.md](SERVER_START_HERE.md) for the separate-checkout workflow and the exact files to edit/open.

Run from `evaluation/acquisition-benchmark`. Use Python 3.12+ and Node 24+. Keep the complete repository checkout: the Node bridge imports the actual `packages/connectors/src` files.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -c constraints.txt -e '.[dev,sources,extract]'
npm ci --prefix node --ignore-scripts --no-audit --no-fund
python -m pytest
python -m bench faults
python -m bench server-check --config configs/offline-demo.json
python -m bench preflight --config configs/offline-demo.json
python -m bench run --config configs/offline-demo.json --run-id demo1
python -m bench process --data-dir data/demo --run-id demo1
```

On Windows, use `.venv\Scripts\python.exe` instead of activating, and `npm.cmd` if PowerShell blocks `npm.ps1`. Dependency installation requires internet; demo collection and processing use local fixtures. The demo runs 22 route/target combinations, including five article routes (both browser variants) feeding both real extractors. `server-check` is expected to report NOT_READY on Windows; run it on the Linux VPS. `faults` is a 21-case smoke gate; pytest is the complete offline gate.

Inspect `data/demo/reports/demo1/report.md`, `report.json` and `attempts.csv`. Reusing a run ID is refused; use `resume` or a new ID. A successful HTTP response is only `captured`; quality requires processing and independent labels.

## All source candidates

| Source | Config route IDs | Implementation |
|---|---|---|
| Websites | `direct`, `zyte`, `unlocker`, `browser`, `browser_standard` | Pinned-address HTTP, Zyte HTTP response mode, Bright Data Web Unlocker, isolated Playwright Chromium, standard-network Playwright Chromium behind a host egress firewall; each feeds Trafilatura and Mozilla Readability. |
| RSS / Atom | `rss_baseline`, `rss_feedparser` | Application TypeScript parser versus feedparser on the same captured bytes, including across restart. |
| Google News | `google_rss`, `google_apify` | Google News RSS; Apify `groupoject/google-news-scraper`. Confirm actor availability/schema in your account; its template input is deliberately empty. |
| Telegram | `telegram_public`, `telegram_api` | Public `t.me/s/<channel>` with the application parser; Telethon with an authorized session and explicit window. |
| X profile | `x_profile_apify`, `x_profile_api`, `x_profile_brightdata` | `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest` author mode; official user posts; Bright Data discovery by profile URL. |
| X search | `x_search_apify`, `x_search_api` | Same actor in search mode; official recent/all search. Profile discovery is not a search candidate. |
| LinkedIn company | `linkedin_company_apify`, `linkedin_company_brightdata` | `harvestapi/linkedin-company-posts`; selected Bright Data company-post dataset. |
| LinkedIn profile | `linkedin_profile_apify`, `linkedin_profile_brightdata` | `harvestapi/linkedin-profile-posts`; selected Bright Data profile-post dataset. |
| Authorized LinkedIn | `linkedin_official` | Official Posts API with authorized author URN and pinned version; separate read-permission cohort. |
| Other Apify | `generic_apify` | Each actor/task gets a separate route, input, bounds and reference. Use `settings.task_id` for a saved task or `actor_id` for an actor. |

Input examples follow the published [X actor schema](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest/input-schema), [company schema](https://apify.com/harvestapi/linkedin-company-posts/input-schema) and [profile schema](https://apify.com/harvestapi/linkedin-profile-posts/input-schema). Freeze the actual build/schema used. X's item setting can overshoot, so it is not a monetary cap. Bright Data dataset IDs and discovery fields are product settings: paste the generated request from your account.

## Configure live runs

Copy a stage template to an ignored `configs/*.local.json` or `*.local.yaml`. Paths resolve relative to that file. All configurations in one campaign should share `data_dir` for cumulative budgets and locking.

1. Replace `REPLACE` inputs. Set matching UTC start/end windows, language, region and content filters. Telegram uses a username; X profile uses a username plus `options.profile_url` for Bright Data. Managed actor filters must be supplied in the actor's own input fields: target window options alone do not add remote filters. Templates replace only whole-string `{input}` or `{option_name}` values.
2. Copy `credentials.env.example` outside Git, fill it privately, and set `credentials_file` to its absolute path. Environment variables take precedence. Keep tokens and Telegram sessions out of configs, command-line arguments and reports.
3. Fill actor/task IDs, dataset IDs, zone, input, optional build, and LinkedIn version/authorized permissions. Set `settings.schema_confirmed: true` after reviewing async provider schemas. Non-Apify JSON datasets support `settings.field_map` dotted paths for `id`, `text`, `date`, `url`, `author`, `media`. Apify uses the current application normalizer so incompatibilities remain visible.
4. Set each paid route's conservative `cost_ceiling_usd` for its **whole job**, including polling, pagination and failures. Set `budget.total_usd`, `budget.providers.<provider>`, and `cost_bound_confirmed: true` only after confirming account-side bounds. Local output slicing and timeouts cannot cap remote billing. No prices are assumed by the templates.
5. Set `costs.server_monthly_usd` to the VPS's actual monthly price; live preflight is NOT_READY without it, because unpaid routes would otherwise look free.
6. For `browser_standard`, apply and verify the outbound egress firewall ([A-to-Z guide, Section 4.5](../../documentation/EXTERNAL_TESTING_A_TO_Z.md)), then set `host_egress_firewall_confirmed: true`. For `browser`, `server-check` must show `user_network_namespace` READY.
7. Enable selected candidates, add independent references, and run `server-check`, preflight and plan. All are local and send no acquisition requests. Install the browser prerequisites separately using [server operations](ops/README.md).

Defaults: two jobs, one browser, one request group per input domain, ten seconds between domain starts, 45-second website attempts, ten-minute source jobs, 10 MiB decoded HTTP responses, 50 MiB saved evidence per job invocation, five HTTP redirects, three dataset pages, 50 returned items and no primary-comparison retries. HTTP streaming/decompression and connection-time DNS checks enforce bounds. Browser collection additionally requires Linux network namespaces. Provider internal retries/redirects remain unknown unless returned in evidence.

The ledger reserves full job ceilings before dispatch. Failed and uncertain paid requests keep their reservations. Final billing requires explicit reconciliation; provider-reported usage remains separate. Budgets accumulate across all runs in the data directory.

## Stage 1: pilot

The template contains five article inputs × five routes × two repetitions = 50 article jobs, plus every source candidate. Replace the five URLs and use small controlled source samples.

```bash
cp configs/stage1-pilot.json configs/stage1.local.json
# Edit inputs, credentials path, enabled routes, schemas and caps.
python -m bench preflight --config configs/stage1.local.json
python -m bench plan --config configs/stage1.local.json --output data/stage1-plan.json
python -m bench faults --output data/stage1-faults.json
python -m bench fetch --config configs/stage1.local.json --run-id pilot-web
python -m bench collect --config configs/stage1.local.json --run-id pilot-sources
python -m bench process --data-dir data/live --run-id pilot-web
python -m bench process --data-dir data/live --run-id pilot-sources
```

`fetch` selects articles; `collect` selects sources; `run` selects both. Inspect every pilot result and raw artifact. Disabled candidates remain `not_tested`. Explain empty collections and lost fields even when transport succeeded.

For Telegram, authenticate once with `python -m bench telegram-login --credentials-file /absolute/path/credentials.env`. Collection is noninteractive and sends no posts. Use a public broadcast channel and a fixed window. Compare post IDs, text, dates, URLs and media presence. The public-page collector covers its latest visible page; Telethon can read history within the configured limits.

## Stage 2: controlled comparison

Copy `stage2-controlled.json` to a local config. Replace its five placeholder article inputs with 45 independently labelled URLs: five `calibration: true`, forty unseen. Set `reference` paths. Prepare source references from a complete controlled window or an explicitly incomplete sample.

Article reference example:

```json
{"title":"Publisher title","body":"Independently transcribed body","published_at":"2026-09-01T09:00:00Z",
 "date_precision":"minute","anchors":["first passage","middle passage","final passage"],
 "must_not_contain":["accept all cookies"],"accepted_urls":["https://publisher.example/article"]}
```

Use `published_at: null` for absent dates, `date_precision: day` for date-only evidence, and `source_changed: true` to exclude legitimate changes from static-body scoring. Independently double-label at least ten articles.

Source reference example:

```json
{"complete_window":true,"window":{"start_time":"2026-09-01T00:00:00Z","end_time":"2026-09-02T00:00:00Z"},
 "items":[{"id":"101","text":"Expected text","published_at":"2026-09-01T09:00:00Z",
 "url":"https://t.me/channel/101","has_media":false}]}
```

`window` must equal the target's `options.start_time`/`end_time` (equivalent offsets match). Otherwise the reference is scored as a sample: `reference_window_error` explains why and recall stays unknown. `validate-gold` rejects mismatches, and rejects fixed complete references under a rolling schedule.

Optional item `aliases` map equivalent provider identifiers; `links` lists expected extracted URLs. For a sample, set `complete_window: false`: reports show sample coverage and leave total recall unknown. Out-of-window records and missing dates are reported separately.

ID inventories remain valid coverage references, but cannot earn a content-quality PASS or count toward cost per usable result. Every expected item needs explicit `text` and `published_at` evidence for quality grading; use `published_at: null` when the source is genuinely undated. For a media-only post, use `text: ""` and `has_media: true`. Incomplete references produce `SOURCE_COVERAGE_ONLY`, preserve ID coverage/recall, and list missing fields. `validate-gold` lists these under `coverage_only_source_references`.

```bash
python -m bench validate-gold --config configs/stage2.local.json
python -m bench compare-gold --first /private/gold/a/article1.json --second /private/gold/b/article1.json
python -m pytest --junitxml=data/offline-tests.xml
python -m bench run --config configs/stage2.local.json --run-id controlled
python -m bench process --data-dir data/live --run-id controlled
```

Inspect `stage2_article_sample_ready` as well as validity. The validity exit code alone does not prove the 40/5 sample size. Labels added later can be attached without refetching:

```bash
python -m bench attach-reference --data-dir data/live --run-id controlled --target-id article1 --reference /private/gold/article1.json
python -m bench score --data-dir data/live --run-id controlled
```

Reference changes are audited. `extract`, `normalize`, `score`, `process` and `report` operate on stored data. Processing refuses to run during dispatch. Article scores include token precision/recall/F1, title F1, anchor order, boilerplate, identity and date checks. Numeric gates use unique unseen URLs: ≥80% PASS, ≥85% usable Wilson lower bound, zero observed gold false successes, p95 collection-plus-extraction ≤30 seconds, and at least 30 independent inputs. These gates do not replace the broader plan's live coverage/false-success and operational reviews.

Missing or corrupt raw artifacts invalidate earlier extraction/normalization scores. Reports give processing failures priority over stale PASS results, including older saved records. After restoring verified evidence, rerun `process` to rebuild outputs and scores.

## Stage 3: seven days and fallback chains

```bash
cp configs/stage3-soak.json configs/stage3.local.json
# Transfer validated inputs, candidates and budget settings.
python -m bench preflight --config configs/stage3.local.json
python -m bench schedule --config configs/stage3.local.json --run-id week1
```

The default is eight daily rounds, spanning seven days, with rolling 24-hour windows. Parent ID: `week1-schedule`; rounds: `week1-r000` through `week1-r007`, each with a report. Each round needs its own source references: place them in `schedule.references_dir/round-NNN/<target_id>.json` before the round, or attach them to `week1-rNNN` afterwards. For shorter source cadences use separate staggered configurations sharing the same ledger. Publication age is measured; real detection delay still needs independently observed arrival/discovery times.

Keep repeated article URLs in `targets`. Preselected daily inputs can go in `targets_by_round: {"0": [...], "1": [...]}`. For newly discovered URLs, set `schedule.daily_targets_dir` and place a target array in `round-000.json`, `round-001.json`, etc. before that round. Each file is snapshotted once; missing files are recorded as missing daily samples. Use unique IDs across fixed/daily targets. Existing rounds resume their original inputs.

Generate article candidates from previously normalized RSS/Google News without new requests:

```bash
python -m bench discover --data-dir data/live --run-id week1-r000 --limit 20 --output data/daily/round-001.json
python -m bench chains --config configs/stage3.local.json --run-id fallback1
python -m bench process --data-dir data/live --run-id fallback1
```

Review discovered inputs and independently label them. The chain command measures configured article fallback orders. It uses the first extractor plus a response-only validator, without gold access. Reports include final quality, attempted fallbacks and accumulated costs/time. Chain deadlines include domain/provider/browser waiting and extraction; expiry before dispatch is recorded as `not_tested`. Ordinary request deadlines start after local capacity becomes available. Their JSON/CSV rows record `queue_ms` separately from acquisition and processing latency. A website result does not automatically select source fallback policies.

## Recovery and billing

After processing and reconciling the individual runs, use `campaign-costs` to account for the entire shared data directory, including every repetition, failed job and unresolved reservation:

```bash
python -m bench campaign-costs --data-dir data/live --server-total-usd YOUR_CAMPAIGN_SERVER_ALLOCATION --server-cost-evidence 'Billing period, invoice and allocation including idle time'
```

Replace the amount with a number representing the VPS cost allocated to this campaign, including idle time. This replaces (does not add to) the per-run slot-time estimates. Open `data/live/reports/campaign-costs/report.md` and `report.json`. The overall cost per usable acquisition stays unknown while jobs, billing or captured-result quality remain unresolved. A source acquisition is a collection job, not one post; alternative extractors do not multiply usable acquisitions. Campaign expenditure is separate from the matched provider comparisons.

Processing now samples the Python/Node process tree every 250 ms, with start/final samples even on failure or cancellation. Reports expose separate acquisition and processing resource summaries. These are sampled observations, not guaranteed instantaneous peaks. Official X normalization preserves expanded links and joins media expansions across captured pages; missing expansions retain their media keys and are explicitly marked unresolved.

```bash
python -m bench status --data-dir data/live --run-id week1-r000
python -m bench stop --data-dir data/live --run-id week1-schedule
python -m bench resume --data-dir data/live --run-id pilot-sources
```

Stop prevents new dispatch/polling at checkpoints; it does not cancel or refund provider work. Cancel remotely billed jobs through the provider dashboard as needed. Known Apify/Bright Data IDs resume without resubmission. A crash between submission and saving its ID leaves an `uncertain` job that will not automatically retry.

After finding the original run in the dashboard:

```bash
python -m bench attach-remote --data-dir data/live --job-id pilot-sources-000000 --route-id google_apify --remote-id ACTUAL_RUN_ID --evidence 'Provider run page and timestamp checked'
python -m bench resume --data-dir data/live --run-id pilot-sources
```

If recovery is impossible, confirm remote status/cancellation and billing externally, then use `resolve-job --data-dir ... --job-id ... --evidence '...'` to record a terminal failure. That command does not cancel or resubmit anything. Reconcile terminal jobs using the `spend_id` in their report:

```bash
python -m bench reconcile --data-dir data/live --spend-id pilot-sources-000000__google_apify --actual-usd 0.12 --evidence 'Invoice and run identifiers'
python -m bench report --data-dir data/live --run-id pilot-sources
```

The amount is an example, not a provider price. Overages remain visible and reduce the remaining campaign budget. Never treat an unreconciled timeout as free.

## Structure and practical limits

`config.py` validates inputs; `adapters.py` collects; `network.py` enforces HTTP bounds/address checks; `state.py` stores SQLite jobs, spend, remote IDs, checkpoints and hashed blobs. `runner.py` drives execution. `node/transform.mjs` calls the application parsers and Readability. `processing.py`, `gold.py` and `reporting.py` score and compare. `scripts/build_examples.py` rebuilds the synthetic fixtures and disabled templates.

Runs freeze configuration, references, fixture hashes and code/dependency fingerprints. Replays verify artifact hashes; known credential values are redacted before storage. Reports flag capped outputs, preserve failed/unknown states and provide matched task cohorts with pairwise costs. General route summaries are not automatically fair matched-cost rankings. Server cost is allocated by active slot time when `costs.server_monthly_usd` is set; idle time between runs is not charged to candidates.

Tests cover mocked provider protocols, redirects, stalled bodies, compressed expansion, DNS checks, durable budgets, ambiguous submissions, polling, pagination, actual source parsers/extractors, scores, window-matched references, reconciled cost reporting, process-tree metrics, capacity stops, both browser variants, `server-check`, fallback decisions, restart and scheduling. Real provider permissions/schemas, bills, browser namespace behavior, long-term server resource use and Cloudflare egress still require server validation. The baseline bridge exposes existing connector defects without rewriting production parsers. See [server operations](ops/README.md) for setup and the optional systemd unit.
