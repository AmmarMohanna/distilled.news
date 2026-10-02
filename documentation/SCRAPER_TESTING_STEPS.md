# Scraper and API Testing on the University VPS

**Updated:** 2026-09-13.  
**Status:** Three-stage execution plan; no live provider winners have been established.  
**Scope:** Every current source type and each specific scraper/API candidate listed below.

## Summary: what we are going to do

Prepare the professor's server, compare specific scrapers/APIs on matching inputs, and select a primary route and fallback for each source. Measure content correctness, completeness, missed items, freshness, failures, speed, server resources and actual cost.

| Part | What we do | Deliverable |
|---|---|---|
| Preparation | Establish server access, install dependencies, set access/budgets, configure the implemented adapters and pass offline checks. | A reproducible environment and a working comparison tool. |
| **Stage 1: small pilots** | Run small matched datasets through every enabled candidate twice; inspect every result. | Proof that collection, evidence, normalization and cost recording work. |
| **Stage 2: controlled comparison** | Compare larger datasets with manually checked reference content; test pagination, errors and restart recovery. | Quality/reliability tables for each specific scraper and a frozen live configuration. |
| **Stage 3: seven-day live testing and selection** | Collect new content, repeat fixed inputs, monitor resources/costs, test actual fallbacks and check shortlisted runtime behavior. | A justified primary/fallback decision for each source, with evidence and limitations. |

These stages extend the pilot, labelled evaluation and new daily data sequence in the [detailed evaluation plan](SCRAPER_AND_API_EVALUATION_PLAN.md). Each required source goes through all three stages. Server preparation comes first.

**Coverage:** article websites; RSS/Atom; Google News; Telegram channels; X account posts; X search; LinkedIn company posts; LinkedIn profile posts; other explicitly configured Apify actors. A website-body result, a discovered article link and a collected social post are different outputs and need separate scores.

**Implementation status:** The [benchmark package](../evaluation/acquisition-benchmark/README.md) now implements the CLI, durable jobs/budgets, all candidate adapters, parser bridge, extractors, scoring, reports and scheduler. Its README is the executable command/configuration reference; this guide supplies the detailed experiment. Real provider/VPS tests have not been run. Synthetic tests do not establish a winner.

## Navigation

- [Server preparation](#server-preparation)
- [Access, budgets and common test controls](#access-budgets-and-common-test-controls)
- [Specific scrapers and APIs for every source](#specific-scrapers-and-apis-for-every-source)
- [Stage 1: small pilots](#stage-1-small-pilots)
- [Stage 2: controlled comparison](#stage-2-controlled-comparison)
- [Stage 3: seven-day live testing and selection](#stage-3-seven-day-live-testing-and-selection)
- [Final deliverables](#final-deliverables)

## Server preparation

### P1. Record and verify the supplied server

| Setting | Screenshot value | Test implication |
|---|---|---|
| Location | Germany, Frankfurt | Record local egress; managed providers can retrieve from elsewhere. |
| Plan / CPU | KVM 2 / 2 CPU cores | Start with two concurrent collection jobs overall, including at most one browser. |
| OS | Ubuntu 26.04 LTS | Verify the installed OS and compatibility of the chosen library versions. |
| Memory | 8 GB | Monitor available memory, swap and browser growth. |
| Disk | 100 GB | Bound captures and keep a free-space reserve. |
| Bandwidth | 8 TB | Track transfer; this is separate from paid API allowances. |
| Initial SSH user | `root` | Use a regular benchmark account for routine experiments. |
| Backup schedule | Weekly | Add a daily verified private evidence backup during the experiment. |
| Listed expiry | 2026-10-11; auto-renew on | Verify continued access/funding before scheduling beyond this date. |

The password, hostname and IP are redacted. Use the professor's private handoff for those values. Keep credentials out of Git, command history, shared reports and screenshots.

For multiple servers, assign aliases such as `vps-01` and `vps-02`, record their configurations, and use the same commit/configuration. Run matched provider comparisons on the same host; otherwise host differences confound provider results. Coordinate account-level spending/rate limits across servers.

### P2. Connect from Windows and create the benchmark account

**Windows PowerShell:**

```powershell
$BenchServer = Read-Host 'Server IP or hostname from the private handoff'
ssh "root@$BenchServer"
```

Verify the SSH host fingerprint against the professor/provider console before accepting it. Enter the password at the SSH prompt.

**Initial server root shell:**

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
timedatectl status
id bench
```

If `bench` does not exist, create it:

```bash
adduser bench
usermod -aG sudo bench
```

If the server already has a suitable benchmark user, use it and substitute its home path throughout this guide.

**Second Windows PowerShell terminal:** create a dedicated key if the path does not already exist; choose a passphrase.

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE/.ssh/distilled_bench"
Get-Content "$env:USERPROFILE/.ssh/distilled_bench.pub"
```

**Root server shell:** install the displayed public key, preserving existing keys.

```bash
install -d -m 700 -o bench -g bench /home/bench/.ssh
touch /home/bench/.ssh/authorized_keys
nano /home/bench/.ssh/authorized_keys
chown bench:bench /home/bench/.ssh/authorized_keys
chmod 600 /home/bench/.ssh/authorized_keys
```

Append the public key on its own line. Keep the root session open while testing a second connection.

**Windows PowerShell:**

```powershell
$BenchServer = Read-Host 'Server IP or hostname'
ssh -i "$env:USERPROFILE/.ssh/distilled_bench" "bench@$BenchServer"
```

**New server shell:**

```bash
whoami
sudo -v
```

Proceed after key login and sudo work. Preserve the professor's access when making any later SSH changes, and verify another login before closing an existing session. [Ubuntu OpenSSH reference](https://ubuntu.com/server/docs/how-to/security/openssh-server/).

### P3. Install utilities, synchronize time and check networking

**Server Bash, as `bench`:**

```bash
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install -y git curl ca-certificates jq tmux htop sysstat \
  python3 python3-venv build-essential pkg-config nodejs npm ufw
sudo timedatectl set-timezone UTC
timedatectl status
sudo ss -lntp
sudo ufw status verbose
```

Confirm clock synchronization. Complete any required reboot during setup, reconnect and record it before measurement.

On a fresh server, allow the **actual SSH port** before enabling the firewall. This example assumes TCP 22. Preserve required rules on an existing/shared server.

```bash
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status verbose
```

Verify another SSH connection. Outbound scraping needs no public dashboard port. A later public fault-fixture site requires separate setup. An inbound firewall does not prevent scraper requests to private/metadata addresses. [Ubuntu firewall reference](https://ubuntu.com/server/docs/how-to/security/firewalls/).

### P4. Put the exact experiment code and private data on the server

**Server Bash:** enter a clone URL without embedded credentials, using the team's existing repository authentication.

```bash
mkdir -p /home/bench/work
cd /home/bench/work
read -r -p 'Repository clone URL: ' BENCH_REPO_URL
git clone "$BENCH_REPO_URL" distilled.news
cd /home/bench/work/distilled.news
git rev-parse HEAD
git status --short
```

Use the branch/commit containing the benchmark implementation and this guide. A clone cannot include uncommitted laptop changes; transfer reviewed changes through the team's normal Git workflow. Record exact patches/hashes if the experiment includes necessary uncommitted work.

```bash
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
umask 077
mkdir -p data/{config,gold,raw,normalized,records,checkpoints,reports,logs}
mkdir -p /home/bench/.config/distilled-benchmark
mkdir -p /home/bench/.local/state/distilled-benchmark
chmod 700 /home/bench/.config/distilled-benchmark
chmod 700 /home/bench/.local/state/distilled-benchmark
git check-ignore data/reports/ENVIRONMENT.md
```

The final command must identify the ignored path. Use this layout:

| Location | Content |
|---|---|
| `data/config/` | Target lists, frozen nonsecret inputs/settings and job manifests. |
| `data/gold/` | Checked article/post references and dated snapshots. |
| `data/raw/` | Original provider responses with credential fields redacted. |
| `data/normalized/` | Extracted articles and normalized source records. |
| `data/records/` | Attempts, jobs, failures, billing and artifact hashes. |
| `data/checkpoints/` | Durable source progress and resumable job state. |
| `data/reports/` | Environment, comparisons, daily reviews and decisions. |
| `data/logs/` | Operational logs and server-resource samples. |
| `/home/bench/.config/distilled-benchmark/` | Private credential file, outside the repository. |
| `/home/bench/.local/state/distilled-benchmark/` | Private Telegram session and sidecar files. |

### P5. Install Python and run existing offline tests

Use **Python 3.12** as the initial benchmark environment, matching the earlier harness plan, and record the exact patch version. Keep Ubuntu's system interpreter intact. The package's pinned dependencies are in [pyproject.toml](../evaluation/acquisition-benchmark/pyproject.toml).

```bash
python3 -m venv /home/bench/.local/share/distilled-bootstrap
/home/bench/.local/share/distilled-bootstrap/bin/python -m pip install uv
/home/bench/.local/share/distilled-bootstrap/bin/uv --version
/home/bench/.local/share/distilled-bootstrap/bin/uv python install 3.12
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
/home/bench/.local/share/distilled-bootstrap/bin/uv venv --python 3.12 --seed .venv
source .venv/bin/activate
python --version
python -m pip install -e '.[dev]'
python -m pip check
python -m pytest --junitxml=data/reports/offline-python.xml
```

These commands run the **existing offline Python tests**. They do not call paid providers or establish a winner. Resolve failures before trusting this environment. Record uv/Python versions and use the same versions on additional servers. [uv installation](https://docs.astral.sh/uv/getting-started/installation/), [managed Python](https://docs.astral.sh/uv/guides/install-python/).

### P6. Install the current TypeScript baseline and candidate libraries

The current RSS/Telegram parsers and Apify normalizers are TypeScript. Exercise those functions on saved inputs to measure Distilled's actual baseline; a Python rewrite is a different candidate.

**Server Bash, repository root:**

```bash
cd /home/bench/work/distilled.news
node --version
npm --version
npx --yes pnpm@10.12.1 install --frozen-lockfile
npx --yes pnpm@10.12.1 --filter @distilled/connectors test
```

Check Node compatibility with the installed dependencies. Resolve incompatibilities during setup without silently changing the lockfile. These connector tests use fixtures.

**Benchmark environment:**

```bash
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
source .venv/bin/activate
python -m pip install playwright trafilatura feedparser telethon
sudo /home/bench/work/distilled.news/evaluation/acquisition-benchmark/.venv/bin/python \
  -m playwright install-deps chromium
python -m playwright install chromium
python -m pip check
```

Current Playwright documentation lists Ubuntu 26.04; confirm support for the version actually installed. Record its Chromium revision. This Python dependency is separate from the app's JavaScript Playwright package. [Requirements](https://playwright.dev/python/docs/intro), [browser installation](https://playwright.dev/python/docs/browsers).

Test a local browser launch without an external request:

```bash
python - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content('<html><title>Benchmark ready</title><body>Local check</body></html>')
    assert page.title() == 'Benchmark ready'
    print('Chromium:', browser.version)
    browser.close()
PY
```

The package now includes `node/transform.mjs` with pinned Readability/jsdom dependencies and a lockfile; install with `npm ci --prefix node`. Keep scripts in saved untrusted HTML disabled. Both extractors must read saved content without refetching.

After preparation, pin candidate dependencies in the implementation's dependency files and save an environment snapshot:

```bash
python -m pip freeze > data/reports/python-environment.txt
git rev-parse HEAD > data/reports/code-commit.txt
node --version > data/reports/node-version.txt
uname -a > data/reports/kernel.txt
cp /etc/os-release data/reports/os-release.txt
```

Review snapshots for private package URLs before sharing. Freeze software during measured stages; changes require a new version/run ID.

**Server checkpoint:** Key login, synchronized clock, reproducible Python/Node environment, recorded offline results, local browser launch and private artifact storage work.

## Access, budgets and common test controls

### P7. Store credentials privately

```bash
umask 077
touch /home/bench/.config/distilled-benchmark/credentials.env
chmod 600 /home/bench/.config/distilled-benchmark/credentials.env
nano /home/bench/.config/distilled-benchmark/credentials.env
```

Use these **proposed benchmark variable names**; adapters must explicitly read them. They do not automatically configure the production Worker. Fill values only in the private file.

```dotenv
ZYTE_API_KEY=
BRIGHTDATA_API_TOKEN=
BRIGHTDATA_UNLOCKER_ZONE=
APIFY_TOKEN=
X_BEARER_TOKEN=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_PATH=/home/bench/.local/state/distilled-benchmark/telegram.session
# Optional, only for eligible authorized LinkedIn API targets:
LINKEDIN_ACCESS_TOKEN=
```

The implemented runner loads the file without printing its contents. Keep tokens out of command-line flags, URL query strings, trace logs and provider input snapshots. Redact authorization/cookie fields before storing envelopes. Telegram sessions and their sidecar files are credentials too.

### P8. Freeze access and spending controls

Create `data/reports/ACCESS_AND_BUDGET.md` with a separate row for **each product/actor**, including separate Bright Data social products and separate Apify actors:

| Candidate ID | Account/product access | Stage cap | Maximum jobs/pages/items | Conservative charge bound | Actual spend | Owner |
|---|---|---|---|---|---|---|
| Use IDs from the roster below | Pending/ready/unavailable | Unset until filled | Explicit | Account-specific | Unmeasured | Assign |

Record dated pricing evidence, billing units, minimum charges, credits, failure/timeout billing, compute/storage costs and subscription allocation. An item limit bounds cost only when the product enforces it; also bound runtime/jobs and use account spending controls. Do not infer prices from actor names.

Set total, per-product and per-stage caps. **Unset caps keep paid candidates disabled.** Reserve conservative maximum cost before submission and retain the reservation while remote completion/billing is uncertain. Share limits across servers. Credential probes, faults, retries and fallback trials need explicit allocations too.

Use `READY`, `NOT_TESTED_ACCESS` and `DISABLED_BUDGET` status. An unavailable candidate is not a measured loser. Local HTTP/browser/feed work has runtime/storage cost even without a provider fee.

### P9. Implement the missing comparison components

Work inside the isolated [benchmark package](../evaluation/acquisition-benchmark/README.md):

| Component | Required implementation |
|---|---|
| Runner/config | Frozen inputs/seed, exact nonbillable plan, budget reservations, and planned/started/completed/failed/skipped accounting. |
| Website adapters | Existing direct HTTP plus Zyte HTTP, Bright Data Unlocker and Playwright. |
| Source adapters | Current RSS/Telegram paths, feedparser, Telethon, Apify lifecycle, X API and specific Bright Data social products. |
| TypeScript replay bridge | Call current exported parsers/normalizers on captured bytes/JSON; save dropped-record reasons and normalization versions. |
| Extraction/validation | Offline Trafilatura/Readability and a response-only acceptance validator. |
| Independent scoring | Human reference bodies/IDs, quality labels and evidence-linked reports. Reference answers must not drive acceptance or fallback. |
| Records/storage | Source-job/item records in addition to website `FetchAttempt`; bounded payloads, hashes and durable checkpoints. |
| Scheduler/recovery | One scheduler per host, global limits, remote job reconciliation, stop-dispatch control and restart-safe progress. |

The runner stores version-1 experiment/job records in SQLite, preserving the legacy website record schema. OS dispatcher locking, durable remote IDs, cumulative spend reservations and content-addressed artifacts cover source jobs and recovery. The full dataset and item checks remain in JSON reports.

Every result needs these fields:

| Record | Minimum evidence |
|---|---|
| Experiment | Stage/run ID, UTC window, server alias, commit, dependency/config/dataset hashes and seed. |
| Attempt/job | Target/candidate IDs, product/build/input hash, queue/start/end times, provider and target status separately, error, pages, remote run/snapshot ID, completion/censoring status. |
| Payload | Private path/hash, decoded length, content type, final URL, relevant redacted headers and provider envelope. |
| Article | Title/body/paragraph order, language, publisher/reference, dates and extractor/validator version. |
| Source item | Original source/item ID and URL, text/caption, media references, dates, edit/deletion observation and raw-record link. |
| Evaluation | Reference version, expected/missing/extra IDs, precision/recall/F1, label, metadata errors, reviewer and exclusions. |
| Cost/resources | Estimated/reserved/reconciled charges, billed units, CPU allocation, peak memory, transfer and disk growth. |

Keep publication, update, first-seen and fetch times distinct. Preserve raw provider output and normalized output separately so acquisition loss and normalization loss can be compared. Unknown publication dates remain unknown, even where the application's schema needs a separate change to represent them.

### P10. Use limits that fit the two-core server

These are initial experiment settings. Calibrate in Stage 1 and freeze before Stage 2.

| Setting | Initial rule |
|---|---|
| Active collection | At most 2 jobs/attempts overall, including at most 1 browser. Serialize CPU-heavy extraction during acquisition timing. |
| Website pacing | One top-level request per domain at a time; at least 10 seconds between starts, or stricter provider/site limits. |
| Website deadline | 45 seconds including redirects, body download and rendering. |
| Website size | 10 MiB decompressed payload; separately cap provider JSON/base64 envelopes with allowance for encoding overhead. |
| Local redirects | At most 5, with every destination revalidated. |
| API exchange | Start at 45 seconds per HTTP exchange, within the total job deadline. |
| Source collection job | Start at 10 minutes total, including queueing, polling, pages, download and validation; calibrate per product. |
| API page/job size | Start at 10 MiB decoded per page, 50 MiB per job, and explicit item/page limits. Hitting a cap means incomplete output. |
| Main-comparison retries | Zero harness retries. Record invisible provider-internal behavior as unknown. |
| Managed async work | Initially one active job per paid product, within the overall cap. Status polling does not create another job. |
| Resource samples | Every 60 seconds: CPU, memory, swap, I/O, disk and queue lag. |
| Stop new dispatch | Disk free below 20 GiB; available RAM below 1 GiB for 5 minutes; OOM/crashes; corrupt evidence; uncontrolled spending; safety/deadline defects. |
| Capacity review | CPU above 90% for 5 minutes, sustained swap or growing backlog: pause dispatch and reassess. |

Enforce limits across manual and scheduled runs together. Record queue delay separately and within end-to-end measurements. Browser subresources use a frozen resource/egress policy; the website start interval is not a claim that every browser resource has ten-second spacing.

### P11. Test failures before trusting live output

Start with local mocks. A managed provider needs a bounded publicly reachable fixture endpoint to test target responses; it cannot fetch this server's `localhost`. Keep fixtures deterministic, without arbitrary URL forwarding. A narrow fixture-only loopback exception must be disabled in live mode.

| Fixture/failure | Expected behavior |
|---|---|
| Valid English/Arabic/French content | Correct text, references and metadata. |
| Slow headers, stalled/dripping body | Whole attempt ends at the deadline. |
| Redirect loop/excess chain | Bounded explicit failure. |
| Private, loopback, metadata/link-local, multicast, IPv4/IPv6, unsafe redirect or changed DNS | Refuse forbidden connections at the actual connection boundary. |
| Oversized response; 20-30 MiB compressed expansion | Bounded failure and measured peak memory. |
| 429 / 403 / 404 / 503 | Correct error category, preserved Retry-After, no main-comparison retry loop. |
| HTTP 200 challenge/consent/error page | Reject; never a correct article or a successful empty feed. |
| Malformed HTML/XML/JSON or `&#99999999;` | No whole-job crash; explicit rejection or justified partial output. |
| Missing dates, short/media-only posts | Explicit missingness and source-appropriate validation; no fabricated publication time. |
| Endless JS activity | Hard rendering stop. |
| Pending/failed/partial actor or snapshot | No premature success; remote job identity and evidence retained. |
| Repeated pages, cursor loop, cap hit | Bounded paging and visible incomplete results. |
| Process exit after submission/write/checkpoint | Resume/reconcile without duplicate paid work or lost durable items. |
| Overlapping jobs/writers; budget exhausted | Valid records and enforced shared controls. |

Reproduce and address the review's known gaps: multicast URL validation, numeric-entity parser crash, undated Google News normalization, access-denied HTML accepted as an empty feed, and Telegram timeout ending before body consumption. Preserve regression evidence. [Known findings](SCRAPER_AND_API_EVALUATION_PLAN.md#known-cases-to-turn-into-regression-tests).

DNS checking alone does not pin a connection to the validated address. Test the local HTTP/browser connection or egress boundary, including subrequests. Use controlled mocks for refusal tests; do not send test requests to real metadata/private services. Document managed-provider internals that cannot be observed.

**Readiness checkpoint:** Every enabled adapter has inspectable records, bounded costs and passing relevant fault/deadline controls.

## Specific scrapers and APIs for every source

### Complete candidate roster

The labels below identify the comparison candidates. Their adapters are implemented; real account access and settings still require validation. For executable route IDs such as `direct`, `zyte`, `unlocker`, and `browser`, use the configuration templates and the [benchmark README](../evaluation/acquisition-benchmark/README.md). Every row must receive a result or an explicit not-tested reason in every stage.

| ID | Source/task | Specific scraper/API | Baseline or alternative |
|---|---|---|---|
| `direct_http` | Article bodies | Existing Python direct HTTP route | Baseline. |
| `zyte_http` | Article bodies | Zyte API, HTTP-response mode | Alternative. |
| `brightdata_unlocker` | Article bodies | Bright Data **Web Unlocker**, selected zone | Alternative. |
| `browser_playwright` | Article bodies | Local Playwright + Chromium | Alternative. |
| `rss_distilled` | RSS/Atom | Current Distilled TypeScript parser | Baseline. |
| `rss_feedparser` | RSS/Atom | Python **feedparser** | Parser alternative on identical bytes. |
| `gnews_rss` | Google News | Google News RSS via current app path | Baseline. |
| `gnews_apify` | Google News | Apify **`groupoject/google-news-scraper`** | Configured fallback, tested independently too. |
| `telegram_public` | Telegram channels | Current **`t.me/s/<channel>`** page scraper/parser | Baseline. |
| `telegram_telethon` | Telegram channels | Telegram API through **Telethon** | Alternative using a dedicated test account. |
| `x_profile_apify` | X account posts | Apify **`kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`**, profile mode | Baseline. |
| `x_profile_official` | X account posts | Official X **user-post/timeline API** | Alternative. |
| `x_profile_brightdata` | X account posts | Bright Data **Posts - Discover by Profile URL** | Alternative. |
| `x_search_apify` | X search | Same configured X Apify actor, **search mode** | Separate baseline experiment. |
| `x_search_official` | X search | Official X **search API**, eligible history window | Alternative. |
| `linkedin_company_apify` | LinkedIn company posts | Apify **`harvestapi/linkedin-company-posts`** | Baseline. |
| `linkedin_company_brightdata` | LinkedIn company posts | Bright Data **LinkedIn posts - Discover by Company URL** | Alternative. |
| `linkedin_profile_apify` | LinkedIn profile posts | Apify **`harvestapi/linkedin-profile-posts`** | Baseline. |
| `linkedin_profile_brightdata` | LinkedIn profile posts | Bright Data **LinkedIn posts - Discover by Profile URL** | Alternative. |
| `linkedin_official_authorized` | Eligible LinkedIn members/organizations | Official LinkedIn **Posts API** with required read permissions | Conditional extra cohort only. |
| `apify_<task>_<actor>` | Other configured `apify:` sources | Exact actor ID selected for that source | One separately versioned candidate per actual actor/task. |

Use current per-source/environment overrides. Actor defaults were inspected in [wrangler.toml](../apps/worker/wrangler.toml) and [source detection](../packages/connectors/src/sources.ts). Their names do not verify current access, capabilities or quality. A replacement actor/build gets its own candidate/version.

### W. Website scraper instructions

Use the same article URLs, source versions, language and comparable region settings. Preserve title/body/date reference snapshots before evaluating outputs.

| Specific route | Setup and request | Inspect for every response |
|---|---|---|
| Direct HTTP | CLI path in `bench/adapters.py` and `bench/network.py`, fixed headers, VPS egress, no harness retries. | Original bytes, target status, final URL, captured headers, streaming deadline/size and local resource observations. |
| Zyte HTTP | API key; `POST https://api.zyte.com/v1/extract`, request `httpResponseBody` and `httpResponseHeaders`. | Decode base64; preserve outer provider status separately from target `statusCode`, body and observable metadata. |
| Bright Data Web Unlocker | Token + configured Unlocker zone; `POST https://api.brightdata.com/request` with `zone`, `url`, `format: raw`. | Returned body, exact zone/settings and provider-versus-target error semantics established during the pilot. |
| Playwright/Chromium | Fresh context per attempt; fixed viewport/locale, block images/media/fonts, disable service workers, bounded navigation/rendering. | Rendered DOM, target navigation status, browser version, time, memory and resource/egress policy. |

References: [Zyte API](https://docs.zyte.com/zyte-api/usage/reference.html), [Bright Data Unlocker](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website), [Playwright networking](https://playwright.dev/python/docs/network).

Run **Trafilatura and Mozilla Readability** on each saved response. Report extraction quality/time separately from acquisition and avoid billing the same fetch twice for two extractors. Keep failed attempts visible even when no extraction is possible. A provider's automatic article extractor, Zyte browser mode or another browser service would be an additional explicitly named variant, with its own output/task and budget.

### R. RSS/Atom: Distilled parser and feedparser

1. Create `data/config/rss.csv`: `source_id,feed_url,language,format,expected_body_kind,poll_seconds`.
2. Capture each feed once per observation. Replay **the same bytes** through the current TypeScript parser and [Python feedparser](https://feedparser.readthedocs.io/en/latest/introduction/).
3. Compare native GUID/ID, URL, title, body/snippet, author/date where present, enclosures, encoding and order. Preserve native and derived IDs separately.
4. Test RSS 2.0, Atom, RDF where needed, broken entities, relative links, missing/changed dates, duplicate/changed GUIDs and legitimate empty feeds versus denied HTML.
5. Test ETag/Last-Modified and 304 handling. A 304 means unchanged content; retain the previous snapshot instead of scoring an empty feed.
6. Simulate an outage long enough for entries to fall out of the feed window, and count known missed items.

Separate network-fetch reliability from parser quality. Feedparser does not rescue an unreachable feed merely by parsing differently. Summary feeds need a separate website-body fetch when full articles are required.

### G. Google News: RSS and the specific Apify actor

1. Create `data/config/google-news.csv`: `query_id,query,language,region,window_start_utc,window_end_utc,max_items`. Each language/region variation is a distinct query configuration.
2. Save the app-generated RSS URL and exact input for **`groupoject/google-news-scraper`**. Current new-source defaults use US/en; select needed language/region deliberately.
3. Run both close together in randomized order, matching supported filters/windows. Record unsupported differences.
4. Preserve Google result URL, publisher URL/name, title/snippet, ranking and date evidence. Apply the shared bounded redirect/identity policy.
5. Compare useful unique publisher articles, relevance, stale/off-topic results, duplicates, date errors and collection delay. A provider's list is not ground truth.
6. Test RSS-to-Apify fallback on controlled errors/incompleteness, with a cooldown. A valid empty query must not cause uncontrolled repeated paid jobs.
7. Keep discovery costs separate from fetching the resulting publisher article bodies.

Test the current undated-item normalization explicitly. A missing publication time remains missing in evaluation.

### T. Telegram: public-page scraper and Telethon

1. Create `data/config/telegram.csv`: `source_id,username,language,volume_band,poll_seconds` for accessible public channels.
2. For **`telegram_public`**, capture `https://t.me/s/<username>` and invoke Distilled's existing parser. Record visible ID range, any paging actually supported, and full-body completion time.
3. For **`telegram_telethon`**, obtain API ID/hash, sign in interactively with a dedicated test account, and save the session outside Git at the P7 path. Complete login/code/two-step-password prompts before unattended runs. [Telethon sign-in](https://docs.telethon.dev/en/stable/basic/signing-in.html).
4. Implement read-only channel resolution and message-history collection. Respect flood-wait responses; defer if waiting exceeds the bounded job deadline.
5. Compare native channel/message IDs, text, captions, photo/video references, albums, links, forwards, dates and edits at matched polling cadence.
6. Use a controlled channel with owner authorization or synthetic replay events for known posts, edits, deletion, long text, media and bursts during an outage. Reading a public channel does not authorize publishing test posts.
7. Restart from durable checkpoints and measure missing/duplicate IDs. Verify deletion independently; absence from the newest public page is not proof of deletion.

Report unsupported history/edit/deletion capabilities. A Telegram Bot API trial would be a separate authorized-channel scenario; it does not replace the public-channel history comparison.

### A0. Lifecycle required for every named Apify actor

1. Freeze actor ID/build, input schema, nonsecret input, account entitlement and supported item/page/runtime limits.
2. Submit once through the [Actor-run API](https://docs.apify.com/api/v2/actors-runs-post), persisting its run ID immediately.
3. Poll that run to completion within the total deadline. Reconcile an uncertain submission before starting another potentially billable run.
4. Download the dataset with explicit [pagination](https://docs.apify.com/api/v2/dataset-items-get). Preserve pages and detect caps/demo limits, repeated pages and malformed rows.
5. Save raw items and normalized items with rejected-record reasons. Reconcile raw, rejected, duplicate and useful unique counts. A successful run status is not a content-quality result.
6. Reconcile usage, including failures and applicable compute/storage charges. When stopping a run, attempt supported abort and record whether billable work actually stopped.

Use this lifecycle separately for the Google News actor, X profile/search actor variants, both LinkedIn actors and each generic actor.

### B0. Lifecycle required for Bright Data social scrapers

Use the exact source-specific **post-discovery product**, account dataset/product identifier, input schema and synchronous/asynchronous mode. Save these nonsecret settings in the manifest. These products are separate from Web Unlocker.

Preserve returned records or snapshot/job ID; poll if needed, download every available result segment, and retain partial/error rows. Handle uncertain remote completion after a client timeout. Measure submission-to-validated-results time, including waiting/downloading, and reconcile billable units.

Confirm required selection settings using the actual product documentation/dashboard before one tiny Stage 1 request. Fetching supplied post URLs measures retrieval, not account discovery completeness.

### X1. X account posts: three specific candidates

1. Create `data/config/x-accounts.csv`: `source_id,username,user_id,language,volume_band,include_replies,include_reposts`.
2. Run **`kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest` in profile mode**, **official X user-post retrieval**, and **Bright Data Posts - Discover by Profile URL** on the same accounts/window.
3. Official API: verify read access and freeze requested fields/expansions, page size, time/ID bounds and exclusions. Preserve pagination tokens. [User-post API](https://docs.x.com/x-api/users/get-posts).
4. Bright Data: use profile discovery, not profile metadata or known-post retrieval. [Specific product](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-posts-discover-by-profile-url).
5. Compare original post IDs, authors, full long-form text where available, replies/reposts/quotes, media, links, dates, revisions, paging caps and freshness.
6. Repeat windows, interrupt/resume, and check whether deduplication/checkpoints preserve all known eligible IDs.

Report raw provider coverage separately from normalized content. Use an independent event ledger/manual checks for recall; the union of three providers cannot prove they all missed nothing.

### X2. X search: two specific candidates

1. Create `data/config/x-search.csv`: `query_id,query,language,window_start_utc,window_end_utc,include_replies,include_reposts,max_items`.
2. Run the configured **X Apify actor in search mode** and **official X search**, matching supported operators/windows. Confirm the account's history access. [Search API](https://docs.x.com/x-api/posts/search/introduction).
3. Include multilingual keywords, a phrase, account restriction and high-volume query. Save pages/cursors, result caps, empty results and exact filters.
4. Compare relevant unique posts, false matches, duplicates, completeness and delay. Exercise overlapping windows, late arrivals and missed-poll recovery.

Bright Data's profile-discovery endpoint is not an X keyword-search candidate. Add a search product only after verifying its specific query capability/access.

### L1. LinkedIn companies: two specific scrapers

1. Create `data/config/linkedin-companies.csv`: `source_id,company_url,language,volume_band,window_start_utc,window_end_utc,max_items`.
2. Compare **`harvestapi/linkedin-company-posts`** with **Bright Data LinkedIn posts - Discover by Company URL**. [Bright Data product](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-company-url).
3. Match company URLs/windows. Confirm both collect company posts, not only company metadata.
4. Check original post ID/URL, company identity, full text, image/video/document references, repost attribution, date precision, duplicates and pagination.
5. Test inaccessible companies, empty/partial datasets, relative dates, repeated runs and independently verified changes.

### L2. LinkedIn profiles: two specific scrapers

1. Create `data/config/linkedin-profiles.csv` with the same fields as company inputs but `profile_url` instead of `company_url`.
2. Compare **`harvestapi/linkedin-profile-posts`** with **Bright Data LinkedIn posts - Discover by Profile URL**. [Bright Data product](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url).
3. Match accessible profiles/windows and authored-versus-reposted policy.
4. Verify author/post identity, full text/media, time precision, pagination, duplicates and updates. Separate provider omissions from normalization omissions.

Keep company and profile results separate. **Official LinkedIn Posts API** is a conditional extra candidate for authorized members/organizations with required read permissions. Record its restricted eligible cohort independently; it is not assumed to cover arbitrary public companies/profiles. [Official permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03).

### A1. Other explicitly configured Apify actors

Inventory actual `apify:` sources. Give **each exact actor ID/task** a row recording build, schema, inputs, dates/identity requirements, cost model and access. Prepare two pilot targets, an expanded checked set and a bounded live schedule for each required actor. Compare only task-equivalent alternatives.

Test absent fields, malformed/partial datasets, limits, ordering changes and duplicate records. Detect IDs based on row position that change when output is reordered. Generic actors cannot inherit the score of the X or Google News actor.

GDELT and other search/news services are optional additional discovery experiments. Add an exact service, query/task and budget if a source requirement calls for it; website-body scores cannot choose a discovery service.

## Stage 1: small pilots

### 1.1 Prepare matched pilot inputs

Use real intended sources, plus controlled fixtures where needed. Record exact collection windows, filters and original content before inspecting candidate results.

| Source | Pilot input | Volume for two rounds with all listed candidates enabled |
|---|---|---|
| Websites | 5 articles: English, Arabic, French, JS-rendered body, redirect/canonical case. | 5 x 4 routes x 2 = **40 acquisition attempts**, up to 80 extractor outputs. |
| RSS | 6 feeds covering formats/languages and summary/full body. | 12 fetches; replay each through both parsers = 24 parser results. |
| Google News | 2 fully specified query/language/region configurations. | 2 x 2 candidates x 2 = 8 target collections. |
| Telegram | 2 channels with different volume. | 2 x 2 x 2 = 8 target collections. |
| X accounts | 2 accounts with different volume. | 2 x 3 x 2 = 12 target collections. |
| X search | 2 fully specified queries. | 2 x 2 x 2 = 8 target collections. |
| LinkedIn companies | 2 company URLs. | 2 x 2 x 2 = 8 target collections. |
| LinkedIn profiles | 2 profile URLs. | 2 x 2 x 2 = 8 target collections. |
| LinkedIn official, if eligible | 2 authorized targets, paired with eligible scraper outputs. | 2 x 1 extra API candidate x 2 = 4 extra target collections. |
| Other required actors | 2 targets for each actor/task. | 2 x enabled task-equivalent candidates x 2. |

**A target collection is not necessarily one HTTP call or one billable job.** Count submissions, lookups, pages, polling, result downloads and batching explicitly. The website 40-attempt figure excludes social/feed work and credential/fault requests.

For website references, save title/body, original/canonical URL, language, publication-date evidence, dated snapshot and hash. For source windows, save independently checked expected IDs/fields where possible and flag unknown coverage.

Use these starting source limits, then freeze any calibrated change before Stage 2:

| Control | Stage 1 starting rule |
|---|---|
| Account/channel window | A fixed recent 24-hour window when supported; record the exact start/end. Record a source's latest visible window when no date filtering exists. |
| Search/discovery window | Same explicit window per query across candidates; do not claim equivalence when unsupported. |
| Output limit | Up to 20 items per target per round, with a finite page limit recorded for each product. |
| Page limit | Start at 3 pages for paginated API datasets; smaller if access/cost requires. A capped output is marked partial/censored. |
| Batch size | One target per paid job initially, unless the product requires another input form. |
| Remote completion | P10's bounded total job deadline, with explicit pending/unknown outcome. |

Freeze equivalent requested limits when possible, but also report what each provider actually enforces. A cap-limited pilot proves output handling, not full recall.

### 1.2 Execute and inspect every pilot result

1. Finish the input files, reference snapshots, candidate access, versions and spending caps.
2. Produce a **nonbillable plan** with every target/candidate, maximum expanded requests/items, deadline and cost reservation. Record disabled routes.
3. Run one round through every enabled candidate for a source, randomizing the order with a saved seed.
4. Save raw responses/job states before extracting or normalizing.
5. Repeat the round. Record new content arriving between observations instead of treating it automatically as scraper disagreement.
6. Extract/normalize and score offline; manually inspect all results and rejected records.
7. Reconcile costs and compare observed workload/resource usage with the plan.

**Implemented CLI example** (after configuring the local stage template):

```text
python -m bench preflight --config data/config/stage1.yaml
python -m bench plan --config data/config/stage1.yaml --output data/reports/stage1-plan.json
python -m bench faults --output data/stage1-faults.json
python -m bench fetch --config data/config/stage1.yaml --run-id stage1-web-001
python -m bench collect --config data/config/stage1.yaml --run-id stage1-sources-001
python -m bench extract --data-dir data/live --run-id stage1-web-001
python -m bench normalize --data-dir data/live --run-id stage1-sources-001
python -m bench score --data-dir data/live --run-id stage1-web-001
python -m bench score --data-dir data/live --run-id stage1-sources-001
python -m bench report --data-dir data/live --run-id stage1-web-001
python -m bench report --data-dir data/live --run-id stage1-sources-001
```

Use the supplied version-1 templates and commands in the benchmark README. `fetch` runs website routes; `collect` runs source adapters; extraction/normalization/scoring/reporting must not refetch. `preflight` and `plan` must not probe paid endpoints. `faults` must separate local fixtures from explicitly enabled/budgeted managed-provider cases. Reused output IDs must not silently overwrite evidence or resubmit work.

The proposed stage configuration must specify inputs/references, enabled candidate IDs, product/build/input settings, credentials-file **path**, windows/filters, output/page/job caps, concurrency, deadlines, rate limits, budget reservations, seed, artifact root and scoring versions. The package supplies `configs/stage1-pilot.json`, `stage2-controlled.json`, and `stage3-soak.json`. Copy a template and replace its disabled placeholders; JSON and YAML are supported.

### 1.3 Deliver the pilot report

Create `data/reports/STAGE_1_PILOT.md`:

| Target/window | Specific candidate + version | Raw output | Useful normalized output | Quality/issues | Time | Cost status | Evidence |
|---|---|---|---|---|---|---|---|
| Actual input | Actual product/actor | Measured | Verified | Missing text/date/item, partial dataset, error, etc. | Measured | Reconciled/estimated/unknown | Private artifact link |

Label harness defects separately from provider failures. Preserve the original failed experiment and use a new run/version for fixes.

**Stage 1 is complete when:**

- Every planned unit is completed, failed, interrupted or explicitly skipped; every attempt has a record.
- Artifacts open and match their hashes/lengths.
- Relevant failure/deadline/spend controls work for each enabled candidate.
- Automatic website labels agree with adjudicated pilot labels at least 95%, reporting the denominator separately per extractor.
- No known wrong page or source record is silently accepted; findings have an owner/fix or exclusion.
- Source ID mapping, page limits and raw-to-normalized losses are understood.
- Actual usage is reconciled sufficiently to bound Stage 2.

The pilot validates the tool and exposes obvious differences. Its small sample does not establish a provider winner.

## Stage 2: controlled comparison

### 2.1 Expand the reference datasets and freeze the evaluation

“Gold” means manually checked expected content or records with dated evidence. Keep calibration data separate from unseen evaluation inputs.

| Source | Initial controlled dataset | Expected evidence |
|---|---|---|
| Websites | **45 articles total: 5 calibration + at least 40 unseen**, covering required domains/languages and difficult page types. | Ordered body, title, original/canonical URL, date precision, body anchors, excluded boilerplate and snapshot/hash. |
| RSS | 10 real feeds plus synthetic change/fault snapshots. | Expected IDs/fields on identical bytes; ETag, 304, update and retained-window sequences. |
| Google News | 5 fully specified query/language/region configurations. | Human-reviewed relevance, publisher identity, duplicates and dates in matched windows. |
| Telegram | 6 channels across volume/language; authorized controlled or synthetic event ledger. | Known post IDs/text/media/events and independently inspected real-source gaps. |
| X accounts | 10 accounts across volume/language; controlled/replay events where available. | Matched account windows and checked IDs/fields. |
| X search | 5 query configurations. | Checked relevance, query semantics and independently known expected IDs where feasible. |
| LinkedIn companies | 5 companies with accessible recent posts. | Company/post identity, full text/media and time precision. |
| LinkedIn profiles | 5 profiles with accessible recent posts. | Profile/post identity, authored/reposted policy and required fields. |
| LinkedIn official, if eligible | Authorized subset of the above or a separately declared controlled cohort. | Permissions/eligible targets recorded; paired outputs without implying broader coverage. |
| Other actors | An expanded set justified per exact actor/task. | Task-specific checked IDs, fields and errors. |

For websites, double-label 10 articles independently. Body F1 of at least 0.95 is an initial annotation-consistency requirement; resolve disagreements before scoring providers. Preserve beginning/middle/end anchors and paragraph order. Freeze multilingual normalization rules and preserve original text.

For social sources, initially aim for at least **30 distinct independently checked eligible IDs per shortlisted source/candidate category**. This is an evidence target, not proof of complete platform coverage or 95% recall. Extend low-volume windows or label the decision `INSUFFICIENT_EVIDENCE`.

Raise Stage 1's small item/page limits enough to cover the frozen controlled windows within the budget. Record exact caps per candidate before dispatch. Separately run deliberately capped fixtures to confirm truncation detection. A result stopped at an imposed cap cannot establish unrestricted collection recall.

### 2.2 What to test for each specific scraper in all three stages

Use this table as the individual candidate checklist; save one result row per candidate, not a single vendor score.

| Specific candidate | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| **Direct HTTP** | 5 URLs twice; save bounded raw responses. | 45 articles; redirects, DNS/egress, body limits and errors. | Daily/fixed articles; measure domain blocking, cost and Worker-egress differences. |
| **Zyte HTTP** | Same 5 URLs twice; check base64 and target/API status. | Same 45; managed recovery, metadata and paid faults. | Stability, actual charges and direct-to-Zyte chains. |
| **Bright Data Web Unlocker** | Same 5 URLs twice; verify zone/raw/error semantics. | Same 45; content quality and target/provider failure distinctions. | Stability, charges and direct-to-Unlocker chains. |
| **Playwright + Chromium** | Same 5 URLs twice; verify DOM and hard stop. | Same 45; JS behavior, subrequests, memory and extraction. | Resource growth, crashes, throughput and browser fallback chains. |
| **Distilled RSS parser** | Same 12 captures as feedparser. | 10 feeds plus XML/304/date/GUID faults. | Every captured feed update; missed windows and normalized duplicates. |
| **Python feedparser** | Replay those same 12 captures. | Same controlled bytes and expected fields. | Replay identical captured updates; quantify improvement and integration cost. |
| **Google News RSS** | 2 query configurations twice. | 5 configurations; publisher resolution, dates, relevance and errors. | Matched polling, freshness and controlled fallback activation. |
| **Apify `groupoject/google-news-scraper`** | Same 2 configurations twice; inspect dataset. | Same 5; schema, partial results, dates and lifecycle. | Coverage/cost against RSS; actual fallback cooldown and recovery. |
| **Telegram public-page scraper** | 2 channels twice; record visible IDs. | 6 channels; body stalls, history limits, media and outage ledger. | Fifteen-minute paired polling, missed posts and recovery. |
| **Telegram API / Telethon** | Same 2 channels twice; session/read checks. | Same 6; paging, flood waits, edits/media and restart ledger. | Same cadence; session recovery, freshness and paired fallback. |
| **Configured X Apify actor: profile mode** | 2 accounts twice. | 10 accounts; long text, filters, pages, duplicates and limits. | Paired account windows, cost and actual fallback trials. |
| **Official X user-post API** | Same 2 accounts twice; fields/cursors. | Same 10; expansions, eligible windows, errors and checkpoints. | Same cadence; quota/latency/coverage and fallback trials. |
| **Bright Data X profile-post discovery** | Same 2 accounts twice; product/job result checks. | Same 10; discovery completeness, full fields and limits. | Same cadence; completion time, useful-post cost and fallback trials. |
| **Configured X Apify actor: search mode** | 2 queries twice. | 5 queries; operator equivalence, paging and relevance. | Overlapping windows, late arrivals and search fallback. |
| **Official X search API** | Same 2 queries twice; access/window checks. | Same 5; fields/cursors, eligible history and rate limits. | Same windows/cadence; freshness, cost and recovery. |
| **Apify `harvestapi/linkedin-company-posts`** | 2 companies twice. | 5 companies; identity, text/media, dates, paging and partial jobs. | Paired company polling, cost, duplicates and alternate-product fallback. |
| **Bright Data company-post discovery** | Same 2 companies twice. | Same 5; same expected posts/fields and job-failure cases. | Same cadence/window; freshness, completion and fallback. |
| **Apify `harvestapi/linkedin-profile-posts`** | 2 profiles twice. | 5 profiles; authored/reposted content, dates and paging. | Paired profile polling, cost, duplicates and fallback. |
| **Bright Data profile-post discovery** | Same 2 profiles twice. | Same 5; identity, full fields and partial/error outputs. | Same cadence/window; freshness, completion and fallback. |
| **Official LinkedIn Posts API, if eligible** | 2 authorized targets twice. | Restricted paired cohort; permissions, fields, paging/errors. | Same eligible targets/cadence; report applicability separately. |
| **Each other exact Apify actor** | 2 task targets twice. | Expanded checked task dataset plus lifecycle/schema/ID faults. | Explicit bounded schedule and task-equivalent fallback if available. |

For the X Apify rows, record the full actual actor ID/build from the roster; profile/search mode results must remain separate even when the actor is identical. An unavailable candidate gets a reason in the table, not an invented outcome.

### 2.3 Execute controlled runs and score independently

The first website controlled pass is **45 x 4 = 180 attempts** if all routes are enabled. Run both extractors on available responses. The prespecified first attempt on each of the 40 unseen URLs per route forms the initial independent quality cohort. Calibration and repeated results are separate.

Collect each source/window through all eligible candidates. Then replay raw output through the current normalization bridge and alternative mappings. Preserve what the provider returned, what normalization dropped, and what the application could actually use.

Apply the [detailed website scoring rules](SCRAPER_AND_API_EVALUATION_PLAN.md#9-score-content-independently-of-provider-claims):

| Label | Meaning |
|---|---|
| `BLOCKED_CORRECTLY` | Expected controlled refusal; outside ordinary content-quality rates. |
| `FAIL` | Transport failed or the response-only validator rejected the result. |
| `FALSE_SUCCESS` | Validator accepted a wrong/error page, body F1 below 0.50, or none of the applicable required anchors. |
| `PASS` | Accepted; body F1 and title similarity at least 0.90, anchors in order, no labelled boilerplate, correct identity and applicable date checks. |
| `PARTIAL` | Accepted but neither a full PASS nor a false success under the frozen rules. |

Apply the rules in the detailed plan's order. Verified legitimate changes are `SOURCE_CHANGED`: exclude the changed version from static body scoring and retain its time/cost. Do not use website text-length thresholds for tweets, media-only messages or RSS snippets.

For source outputs measure:

| Metric | Definition |
|---|---|
| Verified recall | Expected eligible original IDs collected / independently known expected IDs. Unknown denominator means unverified recall. |
| Useful-result precision | Correct relevant unique returned IDs / unique returned IDs in the reviewed cohort. |
| Field completeness | Correct required fields, reported separately for identity, text, media and dates. |
| Duplicate rate | Duplicate rows / returned rows; also count duplicates surviving normalized ingestion. |
| Freshness | Publication-to-first-seen delay when publication time is known; include polling cadence. |
| Update/deletion behavior | Known events observed and detection delay; unsupported behavior explicit. |
| Job completion | Complete successful jobs / scheduled jobs, with failed, pending, partial and skipped counts. |
| Pagination completeness | Expected pages/items accounted for, with cursor/cap failures visible. |

Before seeing results, freeze provisional source gates: at least 95% recall on a known controlled ledger, at least 95% required-field completeness, no wrong-source/ID association or fabricated dates, and zero duplicate imports in controlled repeat/restart replay. Tighten where required. Report denominators and uncertainty; these are engineering targets, not population guarantees.

For open-ended query discovery with unknown total relevant posts, evaluate reviewed relevance/precision and documented coverage evidence rather than inventing recall. Human review should hide route names where practical.

### 2.4 Test source-specific faults and persistence

| Source | Additional controlled scenarios |
|---|---|
| RSS | 304, denied HTML, valid empty feed, bad entity, changed GUID/date, item falling out of retained window. |
| Google News | Query encoding/region mismatch, duplicate publisher URL, relative/missing date, RSS error, actor partial/empty output and cooldown. |
| Telegram | Visible page range loss, body stall, album, edit/deletion, burst during outage, inaccessible channel and flood wait. |
| X account/search | Long text, reply/repost policy, missing expansion, overlapping page, expired cursor, late arrival and access restriction. |
| LinkedIn company/profile | Relative dates, author mismatch, truncation, restricted target, mixed success/error rows and repeated posts. |
| Apify/Bright Data jobs | Lost submission response, deadline exceeded, result download interrupted, schema drift, item caps and uncertain abort/billing. |

Use controlled responses for auth/quota/rate-limit cases rather than exhausting a real quota. Test retries separately: at most three total attempts for transient errors, Retry-After respected within one frozen deadline, and no retry loop for bad credentials/exhausted quota.

Terminate only the test job at these boundaries, then restart and inspect expected IDs, artifacts and charges:

```text
planned -> submitted -> remote job ID recorded -> raw payload durable
-> normalized -> items durable -> queue/checkpoint advanced
```

Advance progress only after corresponding data is durable. Reconcile a recorded remote job instead of resubmitting it. File-based benchmark recovery does not prove D1/Queue behavior; retain these cases for the runtime check in Stage 3.

### 2.5 Deliver the controlled report and freeze Stage 3

Create `data/reports/STAGE_2_CONTROLLED.md`, with separate results for every candidate and source/domain. Include raw versus normalized quality, references, faults, costs and exclusions.

Freeze code/dependencies, products/builds, candidate settings, source lists, query operators/windows, sampling, cadence, page/item limits, overlap/checkpoint policy, seed, scorer/validator versions, quality/freshness gates, budgets, deadlines, server assignment and fallback triggers.

**Stage 2 is complete when:** Reference labels and scores are reviewable, relevant regression/recovery checks pass, every required source has evidence or an explicit gap, and the Stage 3 workload fits measured capacity and budget. Resolve/version defects or exclude affected candidates with a reason.

## Stage 3: seven-day live testing and selection

### 3.1 Budget the full schedule

Run seven days **after readiness**. This is a planning profile, not a required purchase. Reduce targets/cadence consistently across candidates if budget requires, and freeze changes before starting.

| Source/workload | Starting schedule in UTC | Seven-day target volume |
|---|---|---|
| Fixed website gold | 45 URLs x 4 routes at 00:30 / 08:30 / 16:30 daily. | **3,780 attempts**. |
| New website articles | Up to 5 unseen URLs per selected domain daily, all 4 routes. | `domains x 5 x 4 x 7`; 6 domains gives **840 attempts**. |
| RSS | 10 feeds every 30 minutes; both parsers on changed captures. | **3,360 fetch opportunities**; parser work depends on 304s/changes. |
| Google News | 5 query configurations x 2 routes, every 4 hours. | **420 target collections**. |
| Telegram | 6 channels x 2 routes, every 15 minutes. | **8,064 target collections**. |
| X accounts | 10 accounts x 3 routes, every 4 hours. | **1,260 target collections**. |
| X search | 5 queries x 2 routes, every 4 hours. | **420 target collections**. |
| LinkedIn companies | 5 companies x 2 routes, twice daily. | **140 target collections**. |
| LinkedIn profiles | 5 profiles x 2 routes, twice daily. | **140 target collections**. |
| LinkedIn official, if eligible | Authorized target subset, same paired cadence. | Additional `eligible targets x 2 x 7` collections. |
| Other exact actors | Explicit per-task targets/cadence. | Calculate and cap before enabling. |

Stagger source jobs and maintain the global two-job cap. Record actual start delays; a schedule that cannot keep up must be recalibrated during readiness. Platform post-volume limits must cover the chosen polling window or be marked censored; do not silently keep the small pilot's 20-item limit.

Include lookups, pagination, status polling, downloads, retries in the separate mode, faults, warm-ups and actual fallback trials in expanded counts/costs. Account batching and recurring charges for repeated items can change billable volume.

```text
target collections = targets x scheduled collections/day x days
expanded requests = submissions + lookups + bounded pages + polls + downloads
spend ceiling = conservative job/call charges + probes + fault/fallback trials
storage ceiling = captures + normalized/reference data + logs + backup copies
```

If a cap stops work, record skipped jobs. Compare matched completed windows and also publish schedule incompletion; do not drop expensive/failing rows to improve a score.

### 3.2 Run one supervised scheduler and monitor the server

Implement the scheduler before enabling cron/systemd automation. It must enforce one active scheduler per host, shared limits, durable remote IDs, heartbeat, planned-versus-completed accounting and restart recovery. Prove a supervised restart before leaving it unattended.

**Existing server commands:**

```bash
tmux new-session -s distilled-benchmark
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
source .venv/bin/activate
```

Start the implemented scheduler in that session. Detach with `Ctrl+B`, then `D`; reconnect with `tmux attach-session -t distilled-benchmark`. Tmux survives an SSH disconnect, but does not restart the workload after a server reboot.

**Proposed interfaces — implement and test before use:**

```text
python -m bench schedule --config data/config/stage3.yaml --run-id stage3-001
python -m bench status --data-dir data/live --run-id stage3-001-r000
python -m bench stop --data-dir data/live --run-id stage3-001-schedule
python -m bench resume --data-dir data/live --run-id stage3-001-schedule
```

`stop` must stop new dispatch, preserve state and reconcile/abort supported remote work. Killing a local process does not stop an actor's billable remote work. `resume` must reconcile existing/uncertain jobs before deciding what to dispatch.

In a separate tmux window, record resources with existing tools:

```bash
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
vmstat -t 60 > data/logs/vmstat.log
```

Check space/memory and the scheduler heartbeat daily:

```bash
df -h /
free -h
du -sh data
```

Apply P10's stop/capacity rules. Keep heavy extraction from distorting acquisition timing; record queue time and active time separately. Record security-update/reboot/backup windows and provider incidents that overlap measurement.

### 3.3 Review quality and costs every day

1. Compare planned/completed work, identify missing heartbeats and reconcile pending/partial jobs.
2. Check provider usage and remaining actual plus reserved spend. Keep unknown charges visible until resolved.
3. Review at least **20 live website results/day**, stratified across route, language and automatic label. Inspect suspected false successes separately from that sample.
4. Review at least **5 new returned items per enabled source-candidate category/day**, or all if fewer exist. Independently inspect selected source windows for missing items; reviewing only returned items cannot estimate recall.
5. Check delayed posts, changes, false dates, missing media, duplicate imports, cap hits and normalization losses.
6. Update `data/reports/DAILY_REVIEW.md` with sample rules/counts, evidence, incidents, costs and uncertainty.

Use `AUTO_PASS`, `AUTO_UNVERIFIED` and `AUTO_FAIL` for website results lacking independent body references. RSS snippet disagreement is not proof of false success. Convert to verified labels only with independent evidence.

Use the first prespecified evaluation attempt per unique unseen URL/route for primary verified website quality. Repeated fixed URLs measure stability, not thousands of independent examples. Initially aim for at least **30 unseen independently verified URLs per shortlisted domain/route**; extend the sample or report insufficient evidence.

### 3.4 Test actual fallback policies

Simulate website chains on matched captures first, then run bounded real chains on ordinary successes and known validator-detected direct failures:

```text
Direct HTTP only
Direct HTTP -> Zyte HTTP
Direct HTTP -> Bright Data Web Unlocker
Direct HTTP -> Playwright
Direct HTTP -> selected managed fallback -> Playwright
```

Use the frozen response-only validator to advance; reference answers must not trigger fallback. A wrong result accepted by the validator stops the chain and receives the appropriate false-success score.

Start with a separately budgeted **90-second end-to-end website-chain deadline**, including extraction/validation. Each route gets the smaller of 45 seconds and remaining chain time. Record activated/skipped fallbacks, final quality, all charges and real latency; simulation cannot prove sequential latency.

| Source | Specific fallback experiment |
|---|---|
| RSS | Other parser on the same bytes for parse failure. Network failure needs a separately tested transport/cache/retry policy. |
| Google News | RSS -> configured Google News Apify actor on frozen failure/incomplete-result triggers; test cooldown/deduplication. |
| Telegram | Selected public-page/Telethon primary -> other eligible collector; reconcile channel/message IDs and overlapping windows. |
| X accounts | Selected account collector -> another of the three eligible account candidates. |
| X search | Selected search candidate -> other search candidate, preserving supported query semantics. |
| LinkedIn companies | Selected company-post scraper -> other company-post scraper on eligible targets. |
| LinkedIn profiles | Selected profile-post scraper -> other profile-post scraper on eligible targets. |
| Other actors | Only the exact task-equivalent fallback actually evaluated. |

An empty source window alone does not prove a missed post. Test errors, incomplete paging and declared freshness/coverage triggers. Measure independently known misses that the fallback policy never detects.

Freeze platform-chain deadlines against their collection budgets and freshness requirements; the website 90-second setting does not apply automatically to ten-minute actor jobs. Test cooldown/recovery after outages and record unsupported fallbacks.

### 3.5 Check shortlisted behavior in the intended application runtime

VPS results measure this server's egress/browser and provider behavior. Distilled uses Cloudflare Workers, D1, R2 and Queues. Include a bounded final check using an **isolated test environment** for the chosen routes; that environment is not already provisioned by this guide.

Use saved replay data first and a small matched live subset where needed. Verify:

- Worker-egress direct fetch on representative domains; a VPS result may not transfer unchanged.
- Correct R2 raw-artifact references and configured retention.
- Stable D1 source/item identity, duplicate prevention and overlapping-window ingestion.
- Queue retry/failure and checkpoint advancement without losing expected items.
- Honest admin health for pending, failed, partial, valid-empty and disabled sources.
- Retention/expiry behavior using actual database semantics, beyond in-memory test doubles.

Record deployment requirements for browser processes and persistent Telethon sessions; they do not automatically fit a Worker. Mark candidates provisional until the intended integration path is validated. The evaluation does not change the application's deployment architecture.

### 3.6 Choose using quality first, then cost and operating effort

Apply the detailed plan's initial website gates per required domain/category:

| Gate | Starting requirement |
|---|---|
| Verified PASS rate | At least 80%. |
| Lower 95% bound of verified usable rate (`PASS + PARTIAL`) | At least 85%. |
| Observed false-success rate | At most 1%; zero observed on gold. |
| Acquisition p95 | At most 30 seconds; also report all-attempt latency and timeout rate. |
| Chains | Frozen end-to-end deadline, quality and budget rules met. |
| Controls | Required safety, cost, persistence and runtime checks demonstrated. |

For source collectors, use the Stage 2 gates plus frozen live completion/freshness targets. Initial targets may be **at least 95% scheduled job completion** and publication-to-first-seen p95 within **two scheduled polling intervals plus one bounded collection time**, where publication times are trustworthy. These are provisional engineering targets; tighten them for sources needing faster delivery. Keep query relevance and authorized-cohort restrictions explicit.

Report denominators and uncertainty. Use 95% Wilson intervals for prespecified independent binary outcomes; use URL/source-window cluster methods for correlated observations. Zero observed false successes in 45 examples does not establish a population rate below 1%. Unknown recall or sparse observations remain `INSUFFICIENT_EVIDENCE`.

```text
Cost per correct article = all costs of a fully verified cohort / distinct PASS results in that cohort
Cost per useful source item = all costs of the evaluated cohort / correct useful unique items in that cohort
Conditional fallback rescue = verified recoveries / detected primary failures where fallback was attempted
```

Include failed requests, partial jobs, pagination/polling, charged timeouts and allocated runtime/storage. Show provider-only marginal cost, actual cash paid and recurring estimates without credits. Avoid double-counting concurrent CPU or shared host costs. Model unique shared upstream resources when projecting application costs, rather than multiplying every fetch by subscriber count.

Do not divide the total cost of an unlabelled live run by only the manually reviewed sample's successes. Use matched fully verified cohorts or a stated sampling estimator with uncertainty; report total live spend separately. With zero correct results, report cost and “no correct results,” not a zero unit cost.

Among candidates meeting quality/operational gates, compare useful-result cost, latency and demonstrated maintenance effort. Show domain/language/source breakdowns so easy high-volume sources do not hide failures on required sources.

### 3.7 Preserve evidence and write the decisions

Create `data/reports/STAGE_3_LIVE.md` and `data/reports/FINAL_SOURCE_DECISIONS.md`:

| Source/domain/task | Primary + version | Fallback + trigger | Verified quality/coverage | Freshness/latency | Useful-result cost | Evidence size/window | Status/limitations |
|---|---|---|---|---|---|---|---|
| Separate required source/task | Measured choice | Tested policy or none | Measured | Measured | Matched/reconciled | Unique examples and repetitions | Adopt/provisional/not tested/insufficient evidence |

Include each website domain/category, both RSS parsers' decision, Google News, Telegram, X accounts, X search, LinkedIn companies, LinkedIn profiles, conditional official LinkedIn and each actual generic actor. Link to references, raw evidence, config/code versions, faults and billing. Record account/session maintenance, integration work and re-evaluation triggers. If no candidate qualifies, document the gap and next experiment instead of forcing a winner.

Make a **daily private backup outside the VPS** using the agreed storage destination. Copy a consistent set of closed artifacts/checkpoints with a checksum manifest and verify a sample restore. The weekly provider backup may miss days of evidence. Credentials and sessions need separate private handling and must not enter ordinary report bundles.

After reviewing reports for secrets/private package URLs, export a report-only bundle:

```bash
cd /home/bench/work/distilled.news/evaluation/acquisition-benchmark
tar -czf data/report-bundle.tar.gz -C data reports
sha256sum data/report-bundle.tar.gz > data/report-bundle.tar.gz.sha256
```

**Windows PowerShell:** retrieve it over SSH.

```powershell
$BenchServer = Read-Host 'Server IP or hostname'
scp -i "$env:USERPROFILE/.ssh/distilled_bench" "bench@${BenchServer}:/home/bench/work/distilled.news/evaluation/acquisition-benchmark/data/report-bundle.tar.gz" .
scp -i "$env:USERPROFILE/.ssh/distilled_bench" "bench@${BenchServer}:/home/bench/work/distilled.news/evaluation/acquisition-benchmark/data/report-bundle.tar.gz.sha256" .
Get-FileHash .\report-bundle.tar.gz -Algorithm SHA256
```

Compare the digest with the server manifest. This bundle is not the raw-evidence backup. Record the private raw-data location, access owner, agreed research retention period and deletion date separately, following source/account requirements.

## Final deliverables

- [ ] Server environment, software/config versions, access roster and budgets recorded.
- [ ] **Stage 1 report:** every enabled named scraper/API inspected; unavailable candidates explicit.
- [ ] **Stage 2 report:** checked references, unseen evaluation, per-candidate quality and fault/recovery results.
- [ ] **Stage 3 report:** seven days of accounted-for work, or an honestly reported shorter/incomplete window.
- [ ] Per-source/per-candidate correctness, completeness, freshness, failure, latency, resources and cost tables.
- [ ] Actual fallback trials and remaining undetected failures documented.
- [ ] Shortlisted application-runtime behavior verified or marked provisional.
- [ ] A justified primary/fallback policy for every required source/task, with uncertainty and unsupported cases.
- [ ] Raw evidence backed up and a sample restore verified; reviewed summaries ready for the professor.

**Start with P1-P6. Live testing starts after the relevant adapters, references, access, caps and readiness checks work.**
