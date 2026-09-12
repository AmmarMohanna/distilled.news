# Distilled.news — Acquisition Benchmark Runbook (VPS)

**Status:** Evaluation runbook under architecture v1.2. It does not change any frozen contract.
**Version:** 1.2
**Depends on:** `ARCHITECTURE_BASELINE_v1.2.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.2.md`, `IMPLEMENTATION_PLAN_v1.2.md`
**Owners:** Workstream B (Acquisition) with Workstream G (Evaluation)
**Produces:** measured `AcquisitionRouteStats`, the Acquisition Router v1 routing policy, connector decisions for Telegram/X/RSS/GDELT, and raw captures that seed the M0 replay dataset.

---

## Contents

0. Read this first
1. What gets tested
2. Decisions to make before starting
3. Accounts and keys
4. Rent and prepare the VPS
5. Benchmark harness layout
6. Common records
7. Route and extractor specifications
8. Test set and gold labels
9. Scoring rules
10. Pilot
11. Full seven-day website run
12. Failure and robustness suite
13. Real-world robustness
14. Experiment B and C — platform connectors and discovery
15. Analysis and the decision
16. Integrating the winners
17. Data handling, legal, and ethics
18. Backups
19. Timeline and roles
20. Definition of done
Appendix A — `benchmark.yaml`
Appendix B — `thresholds.yaml`
Appendix C — Error and block signatures

---

## 0. Read this first

### 0.1 The question

We are not looking for one scraper that handles everything. The benchmark answers:

> For each kind of source, what is the cheapest acquisition method that retrieves complete, correct content reliably?

That is the same question the Contracts give the Acquisition Router (§10): *"What is the cheapest sufficiently reliable acquisition route for this candidate right now?"*

The result is a **routing policy**, not a winner:

```text
Direct HTTP wins for these domains.
Zyte (or another WebFetch provider) wins for these cases.
The browser is needed for this small category.
Telegram and X need their specialised connectors.
```

### 0.2 Rules that apply everywhere

1. **Same inputs, same limits** for every route (URLs, deadline, size cap, redirect cap, headers, server).
2. **Fetch once, extract many.** Every raw response is saved. Extractors run offline over the saved bytes, so adding an extractor costs nothing and every result can be reproduced.
3. **Decide with minimum bars, then cost.** A route must clear quality gates; among the routes that clear them, the cheapest wins.
4. **Thresholds are frozen before the full run** and tagged in git. Nobody tunes them after seeing results.
5. **Scoring is automatic.** Humans verify samples and edge cases, not every attempt.
6. **No bypassing access controls.** No login bypass, paywall bypass, or CAPTCHA solving. robots.txt and terms are reviewed and recorded per domain.
7. **Everything is versioned:** harness git commit, extractor versions, thresholds version, and policy version (v1.2 provenance rules, Contracts §44).

### 0.3 Where this sits in v1.2

| v1.2 reference | What this runbook provides |
|---|---|
| Plan M2 (§6): "one fallback route… WebFetch provider OR Zyte HTTP" | The measurement that picks that one fallback |
| Contracts §10–§12: Acquisition Router, `AcquisitionRouteStats`, `AcquiredContent` | Per-domain route stats in that exact shape |
| Plan M10 (§14): real connectors, checkpoint invariant | Telegram, X, RSS, GDELT connector tests |
| Plan M12 (§16): reliability, load, cost | Fault injection, billing reconciliation, cost per article |
| Plan §25: "parallel multiscraper validation" (experimental scope) | This whole benchmark |
| Plan M0 (§4): frozen replay dataset | Gold labels and raw captures exported for M0 |

This work runs **in parallel with M0**, not instead of it. Plan §25 warns against sacrificing the core vertical slice for integrations.

### 0.4 What changed from the team's draft plan

| Draft | This runbook | Why |
|---|---|---|
| Weighted score, cost = 5% | Minimum bars first, then cheapest | Cost at 5% can never move a result more than 5 points, which contradicts the stated objective |
| 30 fixed URLs re-fetched 21 times | 45 gold articles for correctness **plus** a daily set of new articles per domain | 30 URLs is about one article per domain, which can't estimate a domain's success rate |
| Extraction inside each route | Raw saved, extractors run offline; Trafilatura **and** Mozilla Readability | Reproducible; Readability is what a JS Cloudflare Worker could run in production |
| Manual labelling | Automatic labels; human sample checks | 6,000+ attempts can't be hand-labelled |
| No baselines | The current `t.me/s/` scraper, Apify X actor, and Google News RSS are included | Otherwise we can't show the new routes beat what's live |
| Failure site only | Plus provider-side faults, billing checks, request-rate ramp, content edge cases, canaries | The failure site mostly tests our wrapper, not real-world robustness |

---

## 1. What gets tested

| Experiment | Question | Contenders | When |
|---|---|---|---|
| **A. Website acquisition** | Given an article URL, which route gets complete, correct text most cheaply? | Direct HTTP · Zyte HTTP · Bright Data Web Unlocker · Playwright browser. Optional: Zyte browser mode · Anthropic web fetch · direct HTTP from a Cloudflare Worker | Weeks 2–4 |
| **B. Platform connectors** | Does the connector see every post, incrementally, with no loss or duplication? | RSS (current parser vs reference) · Telegram (Telethon vs current `t.me/s/` scraper) · X (official API vs Bright Data vs current Apify actor) | Weeks 2–5, overlapping A |
| **C. News discovery** | Which important articles does each source add that the others missed, per dollar? | GDELT · Google News RSS (current). Later: MediaStack · NewsData · SearchAPI · a WebDiscoveryProvider | Weeks 3–6 |

Experiment A is the scraper benchmark. B and C are not scraper comparisons: Telegram and X are specialised platform connectors (Baseline §25), and discovery sources return pointers, not necessarily full content.

---

## 2. Decisions to make before starting (Day 0)

| # | Decision | Recommended default |
|---|---|---|
| 1 | Alternative WebFetch provider | **Bright Data Web Unlocker**: returns raw HTML, so it compares like-for-like, and v1.2 names Bright Data. Anthropic web fetch is an optional extra route (§7.2 R6). |
| 2 | Where production acquisition will run | Assume the VPS (or a successor) runs extraction, the browser, and Telethon, while the Cloudflare Worker stays the API. Add the optional Worker-egress route (R7) to check whether direct HTTP behaves differently from a Worker. |
| 3 | User-Agent | Honest and identifying: `DistilledBenchmark/0.1 (+https://distilled.news/bot; <contact email>)` |
| 4 | Accept-Language | `ar,en;q=0.9,fr;q=0.8` for every route, so multilingual sites serve the same language version |
| 5 | Budget cap per paid provider | Set a hard cap in each provider's dashboard before the pilot |
| 6 | Pass thresholds | Starting values in §9 and Appendix B; freeze at the end of the pilot |
| 7 | LinkedIn and Apify | LinkedIn is out of scope (v1.2 doesn't include it). Apify appears only as the current X baseline. |

Record the decisions in `data/reports/DECISIONS.md` on the server.

---

## 3. Accounts and keys

Create these before renting the server:

| Account | Used for | Notes |
|---|---|---|
| VPS provider | The benchmark server | Any provider works (e.g. VPSServer.com, Hetzner, DigitalOcean) |
| DNS for `distilled.news` | `bench.distilled.news` and `faults.bench.distilled.news` → VPS IP | In Cloudflare DNS set these records to **DNS only** (grey cloud) so Cloudflare's proxy doesn't alter traffic |
| Zyte API | Routes R2 and R3 | API key |
| Bright Data | Web Unlocker zone (R4) and the X scraper product (Experiment B) | Zone credentials and API token |
| Anthropic API | Optional route R6 | API key |
| Telegram | Telethon (Experiment B) | Get `api_id` / `api_hash` at my.telegram.org using a **dedicated phone number**, never a personal account |
| X developer account | Official X API | Plus one team-controlled test X account |
| Apify | Current X baseline | Existing token |
| healthchecks.io (free) | Email alert when a scheduled job doesn't run | One check per scheduled job |
| GitHub | Read-only deploy key for the VPS | Never push from the server |

Secrets live **only** in `/opt/bench/.env` (permissions `600`) and `/opt/bench/secrets/`. The Telegram session file gives full access to that Telegram account, so treat it like a password.

---

## 4. Rent and prepare the VPS

### 4.1 Server

| Item | Value |
|---|---|
| CPU / RAM / disk | 4 vCPU · 8 GB · 80 GB SSD (prefer dedicated vCPU; shared CPUs make latency noisy) |
| OS | Ubuntu 24.04 LTS |
| Network | Public IPv4 |
| Region | Europe (e.g. Frankfurt or Amsterdam), close to MENA |
| Extras | Enable provider snapshots if cheap |

### 4.2 SSH key (on each teammate's Windows laptop, PowerShell)

```powershell
ssh-keygen -t ed25519 -C "distilled-bench"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Paste the public key into the provider panel when you create the server. Each teammate adds their own key.

### 4.3 First login and a non-root user

```bash
ssh root@<VPS_IP>
adduser bench
usermod -aG sudo bench
rsync --archive --chown=bench:bench ~/.ssh /home/bench
```

Open a **second** terminal and confirm `ssh bench@<VPS_IP>` works before continuing.

### 4.4 Harden SSH

```bash
sudo tee /etc/ssh/sshd_config.d/99-bench.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo systemctl restart ssh
```

Confirm again from a second terminal that `bench` can still log in.

### 4.5 Updates, firewall, and basics

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades git curl jq htop zstd ca-certificates
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo dpkg-reconfigure -plow unattended-upgrades
sudo timedatectl set-timezone UTC
```

### 4.6 Swap (Chromium memory spikes)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 4.7 Docker (official repository)

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker bench
# log out and back in, then:
docker run --rm hello-world
```

> **Docker bypasses UFW for published ports.** Publish only Caddy on 80/443. Bind anything else to `127.0.0.1` (for example `"127.0.0.1:8000:8000"`) or don't publish it at all.

### 4.8 Project directory

```bash
sudo mkdir -p /opt/bench && sudo chown bench:bench /opt/bench
cd /opt/bench
git clone <repo-url> repo
mkdir -p bin secrets data/{raw,fetches,extractions,labels,connectors,reports,logs}
cp repo/evaluation/acquisition-benchmark/.env.example .env
chmod 600 .env
chmod 700 secrets
```

Job wrapper, used by cron and by hand:

```bash
cat > /opt/bench/bin/job <<'EOF'
#!/usr/bin/env bash
# usage: job <name> [args...]   e.g.  job gold   |  job score --date today
set -euo pipefail
cd /opt/bench/repo/evaluation/acquisition-benchmark
name="$1"; shift
exec flock -n "/tmp/bench-$name.lock" docker compose run --rm runner "$name" "$@"
EOF
chmod +x /opt/bench/bin/job
```

`flock -n` stops two copies of the same job overlapping. If a job is still running, the new one exits without running, and the missing healthcheck ping alerts you.

### 4.9 Record the environment

Write `data/reports/ENVIRONMENT.md` with: provider, region, plan, public IP, `lsb_release -a`, `docker --version`, and the start date. The server's IP reputation affects blocking results, so this is part of the experiment record.

---

## 5. Benchmark harness layout

The harness lives in the repo at `evaluation/acquisition-benchmark/` (Plan §4 suggests an `evaluation/` directory). It uses **Python 3.12**, because Telethon, Trafilatura, Playwright, and the provider clients are Python-first, plus a small **Node** step for Mozilla Readability.

```text
evaluation/acquisition-benchmark/
├── README.md
├── docker-compose.yml          # services: runner, faultsite, caddy
├── Dockerfile                  # FROM mcr.microsoft.com/playwright/python:<pinned>-noble, + nodejs for Readability
├── pyproject.toml              # every dependency pinned
├── .env.example
├── config/
│   ├── benchmark.yaml          # routes, limits, schedule, budgets (Appendix A)
│   ├── thresholds.yaml         # scoring and decision rules (Appendix B), frozen after pilot
│   ├── domains.csv             # target domains + robots/terms review
│   ├── telegram_channels.csv
│   ├── x_accounts.csv
│   └── discovery_queries.csv
├── gold/
│   ├── LABELING_GUIDE.md
│   ├── gold_articles.jsonl
│   └── snapshots/              # saved copy of each gold page on the day it was labelled
├── bench/
│   ├── records.py              # FetchAttempt / Extraction / Label models (§6)
│   ├── safety.py               # URL validation, private-IP guard, size and time limits
│   ├── validator.py            # production-style "did extraction succeed?" check, no gold (§7.4)
│   ├── routes/
│   │   ├── direct_http.py
│   │   ├── zyte_http.py
│   │   ├── zyte_browser.py         # optional
│   │   ├── brightdata_unlocker.py
│   │   ├── browser_playwright.py
│   │   ├── anthropic_web_fetch.py  # optional
│   │   └── worker_direct.py        # optional
│   ├── extractors/
│   │   ├── trafilatura_ex.py
│   │   ├── readability_ex.mjs      # @mozilla/readability + linkedom
│   │   └── metadata.py             # JSON-LD, OpenGraph, canonical link, <html lang>
│   ├── jobs/                   # gold, live, extract, score, report, faults, chaos, ramp, check-keys
│   ├── score.py
│   └── report.py
├── connectors/
│   ├── rss_poll.py
│   ├── telegram_poll.py        # Telethon + current t.me/s/ parser side by side
│   ├── x_poll.py
│   ├── gdelt_poll.py
│   └── gnews_poll.py
└── faultsite/
    ├── app.py                  # controlled failure website (§12.1) + provider mocks (§12.2)
    └── Caddyfile               # TLS for faults.bench.distilled.news
```

Compose services:

| Service | Role | Network exposure |
|---|---|---|
| `runner` | Runs one job and exits (`docker compose run --rm runner <job>`). Mounts `/opt/bench/data` and `/opt/bench/secrets`; loads `/opt/bench/.env` via `env_file`. | none |
| `faultsite` | FastAPI app for §12 | internal only |
| `caddy` | Public HTTPS for `faults.bench.distilled.news` → `faultsite` | 80/443 |

Data on disk:

```text
/opt/bench/data/
├── raw/<date>/<fetchId>.<ext>.zst       # exact bytes received, zstd-compressed
├── fetches/<date>.jsonl                 # one line per fetch attempt
├── extractions/<date>.jsonl             # one line per (fetch × extractor)
├── labels/<date>.jsonl                  # scorer output
├── connectors/<connector>/<date>.jsonl
├── reports/
└── logs/
```

JSONL files are append-only, easy to back up, load directly into DuckDB or pandas, and match the file style M0 expects (`acquired_content.jsonl`).

---

## 6. Common records

Every route produces the same records. Provider-specific output is converted before it is written.

### 6.1 FetchAttempt (one per route call)

```json
{
  "fetchId": "f_20260920_083012_7c1e",
  "runId": "gold-2026-09-20T08:30Z",
  "runKind": "gold",
  "route": "zyte_http",
  "acquisitionMethod": "zyte_http",
  "acquisitionProvider": "zyte",
  "inputUrl": "https://example.com/news/123",
  "domain": "example.com",
  "goldId": "g_023",
  "liveOracle": null,
  "startedAt": "2026-09-20T08:30:12.114Z",
  "finishedAt": "2026-09-20T08:30:14.902Z",
  "latencyMs": 2788,
  "transport": {
    "ok": true,
    "httpStatus": 200,
    "resolvedUrl": "https://example.com/news/123-title",
    "redirects": 1,
    "bytes": 184233,
    "contentType": "text/html; charset=utf-8",
    "errorType": null
  },
  "cost": { "estimatedUsd": 0.0, "billedUnits": 1, "cpuSeconds": 0.21 },
  "rawPayloadRef": "raw/2026-09-20/f_20260920_083012_7c1e.html.zst",
  "versions": { "harness": "git:abc1234", "route": "zyte_http@1", "benchmarkConfig": "bench-v1" }
}
```

For live-set attempts, `goldId` is null and `liveOracle` holds the RSS item's `title` and `description` (§9.4).

`errorType` is one of: `timeout`, `dns`, `connect`, `tls`, `too_many_redirects`, `too_large`, `rate_limited`, `blocked`, `server_error`, `client_error`, `unsafe_target`, `provider_unavailable`, `provider_auth`, `provider_quota`, `other`.

### 6.2 Extraction (one per fetch × extractor)

```json
{
  "extractionId": "x_f_20260920_083012_7c1e_trafilatura",
  "fetchId": "f_20260920_083012_7c1e",
  "extractor": "trafilatura",
  "extractorVersion": "<pinned version>",
  "title": "…",
  "canonicalUrl": "https://example.com/news/123-title",
  "publisher": "Example News",
  "author": "…",
  "publishedAt": "2026-09-20T07:55:00+03:00",
  "language": "ar",
  "text": "…",
  "textChars": 4312,
  "quality": {
    "transportSuccess": true,
    "extractionSuccess": true,
    "extractionComplete": true,
    "confidence": null,
    "validatorVersion": "validator-v1",
    "validatorReasons": []
  }
}
```

### 6.3 Label (one per extraction, written by the scorer)

```json
{
  "extractionId": "x_f_20260920_083012_7c1e_trafilatura",
  "label": "PASS",
  "bodyPrecision": 0.97,
  "bodyRecall": 0.95,
  "bodyF1": 0.96,
  "mustContainFound": 3,
  "mustNotContainFound": 0,
  "titleSimilarity": 1.0,
  "canonicalOk": true,
  "dateOk": true,
  "thresholdsVersion": "thresholds-v1"
}
```

### 6.4 Mapping to the v1.2 `AcquiredContent` contract (Contracts §12)

| `AcquiredContent` field | Comes from |
|---|---|
| `candidateId` | `goldId`, or the live-set item id |
| `resolvedUrl` | `transport.resolvedUrl` |
| `title`, `text`, `publishedAt`, `author` | Extraction |
| `acquisitionMethod` | Route → v1.2 enum (table below) |
| `acquisitionProvider` | `self`, `zyte`, `brightdata`, `anthropic`, `cloudflare` |
| `rawPayloadRef` | `rawPayloadRef` |
| `acquiredAt` | `finishedAt` |
| `quality.transportSuccess / extractionSuccess / extractionComplete / confidence` | Extraction `quality` |

| Route | `acquisitionMethod` | `acquisitionProvider` |
|---|---|---|
| `direct_http` | `direct_http` | `self` |
| `zyte_http` | `zyte_http` | `zyte` |
| `zyte_browser` | `browser` | `zyte` |
| `brightdata_unlocker` | `web_fetch` | `brightdata` |
| `browser_playwright` | `browser` | `self` |
| `anthropic_web_fetch` | `web_fetch` | `anthropic` |
| `worker_direct` | `direct_http` | `cloudflare` |

The publisher is always the evidence source. The provider is only how we retrieved it (Baseline §6.3, Contracts §12).

---

## 7. Route and extractor specifications

### 7.1 Shared limits (identical for every route)

| Limit | Value |
|---|---|
| Total deadline per attempt | 45 s wall clock, including redirects and rendering |
| Maximum redirects | 5 |
| Maximum response size | 10 MB **after** decompression |
| Retries inside the benchmark | 0 (retry behaviour is tested separately in §12.2) |
| User-Agent | The honest string from §2 |
| Accept-Language | `ar,en;q=0.9,fr;q=0.8` |
| Global concurrency | At most 4 attempts at once |
| Per-domain concurrency | 1 |
| Per-domain spacing | At least 10 s between requests to the same domain, more if robots.txt `Crawl-delay` requires it |
| Order | Route order randomised per URL per run |

Providers send requests from their own IP addresses; that is part of what they sell. Record any provider option you change (such as geolocation) as a separate route variant.

### 7.2 Routes

**R1 — `direct_http` (baseline, near-zero cost).**
- Validate the URL with `safety.py` before the first request and again at every redirect hop. Allow only `http`/`https`. Resolve the host and refuse loopback, private (RFC 1918), link-local (including `169.254.169.254`), CGNAT, and IPv6 private ranges.
- Follow redirects yourself, up to 5.
- Stream the body with the size cap, and enforce the cap on the *decompressed* size (protects against gzip bombs).
- Decode the charset in this order: HTTP header, then `<meta charset>`, then detection.
- Save the raw bytes and record status, headers, and bytes.

**R2 — `zyte_http`.**
- Zyte API extract endpoint with `httpResponseBody: true` and `httpResponseHeaders: true`. Decode the body and save the raw bytes.
- Record Zyte's status and error fields.
- Cost: take it from Zyte's usage data. Prices can differ by site, so reconcile daily with the dashboard (§12.3).

**R3 — `zyte_browser` (optional).**
- Same as R2 but with `browserHtml: true`.
- It is a **separate route**, never merged with R2, so ordinary retrieval and browser rendering are measured separately.

**R4 — `brightdata_unlocker`.**
- A Web Unlocker zone, called for raw HTML using the request example in the zone's dashboard.
- Record Bright Data's status and error fields.
- Cost: take it from usage data and reconcile daily.

**R5 — `browser_playwright` (last resort).**
- Headless Chromium with a new browser context per attempt.
- Block images, fonts, and media to save bandwidth, and record that setting.
- Wait for `domcontentloaded`, then up to 5 s for the article body or for network quiet. **Never wait for `networkidle` without a cap.** Stop hard at the 45 s deadline.
- Save `page.content()`. Take screenshots during the pilot only.
- Apply the private-IP guard to **every** request the page makes, using a request interceptor, not just the top-level URL.
- Don't click consent buttons in v1. If that turns out to matter, test it later as a separate variant.
- Record CPU seconds and peak memory, so the browser cost can be priced for any host.

**R6 — `anthropic_web_fetch` (optional; the v1.2 docs' example WebFetch provider).**
- Messages API with the web fetch server tool: `{"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 1, "allowed_domains": ["<article domain>"], "max_content_tokens": <cap>}`.
- The URL must appear in the user message; the tool only fetches URLs already present in the conversation.
- Model: `claude-opus-5` with `output_config: {"effort": "low"}`, and Anthropic's server-side refusal fallback enabled (`fallbacks: "default"` with its beta header). Record `response.model` in case a fallback model served the request.
- A cheaper model is a team decision. If you switch, record it; older models use the `web_fetch_20250910` tool version.
- **Score the document inside the `web_fetch_tool_result` block, never Claude's written reply.** Otherwise you are measuring summarisation, which breaks the "does not modify content" rule.
- **Fetch errors come back as HTTP 200 with an error object inside the tool result.** The adapter must turn that into a failure, or it will show up as a false success.
- The current tool version can filter fetched content with code before Claude sees it. In the pilot, check whether the returned document is the whole page.
- The tool returns text, not raw HTML, so the offline extractors can't run on it. Score it as its own extractor (`provider`).
- Cost: tokens from `usage` × the model price, plus any web-fetch fee listed on Anthropic's current pricing page.

**R7 — `worker_direct` (optional).**
- A tiny Cloudflare Worker, `GET /fetch?url=…`, protected by a secret header, that returns the raw bytes and status. The harness calls it.
- It shows whether publishers treat Cloudflare's network differently from the VPS.
- Only needed if production direct HTTP might run inside a Worker.

### 7.3 Extractors (run offline on every saved raw HTML)

| Extractor | Why |
|---|---|
| `trafilatura` (Python) | v1.2 names it ("Trafilatura or equivalent") |
| `readability` (Node: `@mozilla/readability` + `linkedom`) | What a JS Cloudflare Worker could run in production |
| `metadata` (applied to both) | JSON-LD `NewsArticle` (`headline`, `datePublished`, `author`, `publisher`), OpenGraph, `<link rel="canonical">`, `<html lang>`, plus language detection on the text (`py3langid`) |

Fixed precedence (write it in `benchmark.yaml` and don't change it mid-run):
- **title:** JSON-LD `headline` → `og:title` → extractor title
- **date:** JSON-LD `datePublished` → `article:published_time` → extractor date
- **canonical URL:** `<link rel="canonical">` → `og:url` → resolved URL

### 7.4 The production-style validator

`validator.py` decides `extractionSuccess` and `extractionComplete` **without** the gold answer, exactly as the production router would have to:

- transport OK: 2xx status and an HTML content type;
- at least 250 characters of text. Exception: if metadata says `NewsArticle`, accept 80 or more characters as a short news item;
- no error, consent, or block signature (Appendix C);
- a title is present and a language is detected;
- `extractionComplete` additionally requires that the text doesn't end mid-sentence and contains no truncation marker ("read more", "continue reading", "اقرأ المزيد", "lire la suite").

The benchmark's **false-success rate measures how often this validator is fooled.** After the routing table, it is the most important output for production.

---

## 8. Test set and gold labels

### 8.1 Choose the domains (Week 1)

Pick **16–20 domains Distilled will actually follow.** Starting candidates to *review* (none is approved until its review passes):

- **Lebanese:** National News Agency (nna-leb.gov.lb), Naharnet, L'Orient Today / L'Orient-Le Jour, Annahar, Al Akhbar, LBCI, Al Jadeed, MTV Lebanon, The961
- **Regional/international:** Al Jazeera (Arabic and English), BBC Arabic, Asharq Al-Awsat, Arab News, The National, Reuters, AP News

`config/domains.csv` columns:

```text
domain, languages, rss_url, news_sitemap_url, robots_allows_articles (yes/no),
robots_checked_on, crawl_delay_s, terms_notes, paywall (none/metered/hard),
js_required (after test), include (yes/no), reviewer
```

Exclude a domain, or an article, if it needs a login, paywall bypass, or CAPTCHA solving, if robots.txt disallows article paths, or if the terms prohibit automated access.

**How to prove an article needs JavaScript:** copy a distinctive sentence from the visible article, then run:

```bash
curl -sL -A "<the benchmark UA>" "<url>" | grep -c "<distinctive sentence>"
```

`0` from curl while the sentence is visible in a browser means `js_required = yes`.

### 8.2 Gold set — 45 articles

An article can count toward more than one category.

| Category | Count | Notes |
|---|---:|---|
| Simple English | 8 | |
| Arabic | 10 | |
| French / multilingual | 5 | |
| JavaScript-rendered | 5 | Proven with the curl test |
| Redirect / canonical cases | 4 | Google News links, AMP pages, shortened links, tracking parameters |
| Difficult but permitted | 4 | Bot-protected or very heavy pages; no bypassing |
| Live blog / continuously updated | 2 | |
| Short breaking-news item (under 80 words) | 3 | Tests the validator's short-item rule |
| Multi-page article | 2 | |
| Arabic page with legacy or wrong encoding | 2 | e.g. windows-1256 |
| **Total** | **45** | |

The pilot uses 5 of these: one English, one Arabic, one French, one JS-rendered, and one redirect case.

### 8.3 Labelling guide (`gold/LABELING_GUIDE.md`)

Record for each article:

```json
{
  "goldId": "g_023",
  "inputUrl": "…",
  "domain": "…",
  "categories": ["arabic", "js_rendered"],
  "canonicalUrl": "…",
  "publisher": "…",
  "title": "…",
  "author": null,
  "publishedAt": "2026-09-14T09:12:00+03:00",
  "publishedAtPrecision": "minute",
  "language": "ar",
  "body": "…",
  "mustContain": ["…", "…", "…"],
  "mustNotContain": ["…", "…", "…"],
  "minBodyChars": 1200,
  "jsRequired": true,
  "snapshot": "snapshots/g_023.mhtml",
  "labeledBy": ["A"],
  "labeledAt": "2026-09-14T12:00:00Z"
}
```

How to fill each field:

- **title:** the headline as shown on the page, not the `<title>` tag with the site name.
- **canonicalUrl:** `<link rel="canonical">` from the page source. If there is none, the final URL after redirects, with tracking parameters removed.
- **publisher:** the site's name as it presents itself.
- **author:** the byline, or `null`.
- **publishedAt:** ISO 8601 with timezone. Use the visible dateline first and JSON-LD `datePublished` as a cross-check. Set `publishedAtPrecision` to `minute`, `hour`, or `day`.
- **body:** article paragraphs in order, including subheadings and quotes inside the article. **Exclude** the headline, byline, dateline, photo captions, related/read-more blocks, share buttons, ads, newsletter boxes, embedded-post text, and comments.
- **mustContain:** three exact sentences: the first sentence of the first paragraph, one from the middle, and the first sentence of the last paragraph.
- **mustNotContain:** three strings visible on the page that are not article text (a menu item, the "Related articles" heading, footer text, cookie text).
- **minBodyChars:** 60% of the gold body length.
- **snapshot:** save the page (browser "Save page as" MHTML, or print to PDF). Pages get edited; if an article's scores suddenly change mid-run, compare against the snapshot before blaming the route.
- **Double labelling:** 10 articles are labelled independently by two people. Compute body F1 between the two labels; if it is below 0.95, tighten the guide and relabel.

---

## 9. Scoring rules

### 9.1 Normalisation before comparing text

Apply Unicode NFKC, then:
- lowercase Latin characters;
- remove Arabic diacritics and tatweel (ـ);
- unify alef forms (أ إ آ → ا);
- strip punctuation and collapse whitespace;
- split tokens on whitespace.

### 9.2 Body score

Token-level **precision**, **recall**, and **F1** between the extracted text and the gold body, counting repeated tokens.
- **Recall:** how much of the article we got.
- **Precision:** how much of what we got is article text rather than boilerplate.

### 9.3 Labels (checked in this order)

1. **BLOCKED_CORRECTLY:** the route refused, and refusal was the expected outcome (unsafe target, robots-disallowed, fault cases marked "refuse").
2. **FAIL:** the route honestly reported failure (transport error, timeout, or the validator rejected the content).
3. **FALSE_SUCCESS:** the route reported success, but an error, consent, soft-404, or block signature matched, **or** body F1 < 0.50, **or** none of the `mustContain` sentences was found.
4. **PARTIAL:** reported success with body F1 between 0.50 and 0.90, **or** body F1 ≥ 0.90 but a `mustNotContain` string leaked in, or the title, canonical URL, or date is wrong.
5. **PASS:** reported success, body F1 ≥ 0.90, all `mustContain` found, no `mustNotContain` found, title similarity ≥ 0.90, canonical URL equal after normalisation, and date within tolerance.

Canonical URL normalisation: lowercase the scheme and host, remove default ports, the trailing slash, and tracking parameters (`utm_*`, `fbclid`, `gclid`).

Date tolerance: ±5 minutes for minute precision; the same hour for hour precision; the same calendar day in the publisher's timezone for day precision.

`FALSE_SUCCESS` carries the heaviest weight. An honest failure is much better than wrong content marked as success.

### 9.4 Scoring the live set (no gold answer)

The oracle is the RSS item's title and description:
- title similarity (extracted vs RSS title) ≥ 0.80;
- when the RSS description has 15 or more words, at least 60% of its tokens appear in the extracted text;
- the validator passes.

If all three hold, the label is `AUTO_PASS`. If the route reported success and the oracle fails, it is `AUTO_FALSE_SUCCESS`. Otherwise it is `AUTO_FAIL`.

**Human check:** every day, one teammate hand-labels 20 random live results. Report how often the automatic labels agree with the human ones. If agreement is below 90%, fix the oracle before trusting the live-set numbers.

### 9.5 Consistency

For each gold URL × route over the 21 runs:
- **consistency:** the share of runs whose body F1 stays within 0.05 of that route's median for that URL;
- **label flips:** how many times the label changes between consecutive runs.

Live blogs are excluded from consistency, because they change legitimately.

---

## 10. Pilot (Week 2)

**Scope:** 5 gold URLs × the 4 core routes × 2 repetitions = 40 fetches (plus the optional routes if enabled), plus the `/soft-404` and `/ok/en` fault URLs.

```bash
cd /opt/bench/repo/evaluation/acquisition-benchmark
docker compose build
docker compose up -d caddy faultsite
/opt/bench/bin/job check-keys                  # one known-good URL per provider
/opt/bench/bin/job gold --subset pilot --repeat 2
/opt/bench/bin/job extract --date today
/opt/bench/bin/job score --date today
/opt/bench/bin/job report --date today
```

Manual checklist for **every** pilot attempt:

- [ ] the raw file exists, opens, and its size matches `bytes`
- [ ] the resolved URL and redirect count are right
- [ ] latency is plausible
- [ ] cost is recorded, and non-zero for paid routes
- [ ] both extractors produced output
- [ ] the label agrees with your own judgement
- [ ] no error page was labelled PASS
- [ ] `/soft-404` is FAIL or FALSE_SUCCESS, never PASS
- [ ] R6 only: the fetched document is the full page, not a filtered or summarised version

**Exit criteria:**
- 100% of attempts produce complete records;
- the scorer agrees with manual review on at least 38 of 40;
- every harness bug found is fixed;
- `thresholds.yaml` is committed and tagged `thresholds-v1`.

---

## 11. Full seven-day website run (Week 3)

### 11.1 Schedule (UTC)

| Job | When | What |
|---|---|---|
| `gold` | 00:30, 08:30, 16:30 | All 45 gold URLs × all enabled routes, random order |
| `live` | 06:00 | Harvest up to 5 new articles per domain (published in the last 24 h, never seen before) from its RSS feed or news sitemap, and run every route on them |
| `extract` + `score` | 23:00 | Run the extractors and scorer on the day's fetches |
| `report` | 23:30 | Daily report, provider cost reconciliation (§12.3) |
| `faults` | Day 1 and Day 7, 12:00 | Full fault suite (§12.1) |
| `ramp` | Day 4, 12:00 | Request-rate ramp on 3 domains (§13.2) |
| Connector pollers | Continuous | Experiment B, if running in parallel (§14) |

At these volumes each domain gets roughly 30–50 requests a day across all routes, which is polite.

### 11.2 Crontab (`crontab -e` as `bench`)

```cron
# m  h        dom mon dow  command
30 0,8,16 * * *  /opt/bench/bin/job gold    >> /opt/bench/data/logs/gold.log 2>&1   && curl -fsS -m 10 https://hc-ping.com/<GOLD_UUID>   >/dev/null
0  6      * * *  /opt/bench/bin/job live    >> /opt/bench/data/logs/live.log 2>&1   && curl -fsS -m 10 https://hc-ping.com/<LIVE_UUID>   >/dev/null
0  23     * * *  /opt/bench/bin/job extract --date today >> /opt/bench/data/logs/extract.log 2>&1 && /opt/bench/bin/job score --date today >> /opt/bench/data/logs/score.log 2>&1 && curl -fsS -m 10 https://hc-ping.com/<SCORE_UUID> >/dev/null
30 23     * * *  /opt/bench/bin/job report --date today >> /opt/bench/data/logs/report.log 2>&1 && curl -fsS -m 10 https://hc-ping.com/<REPORT_UUID> >/dev/null
```

Take a VPS snapshot before Day 1.

### 11.3 Daily operator checklist (about 5 minutes; rotate)

- [ ] All healthchecks green
- [ ] `df -h` below 70%
- [ ] The daily report shows the expected attempt counts, and no route is at 0%
- [ ] Provider dashboards: spend within budget
- [ ] The 20-item human check for the live set is done (§9.4)

**During the seven days, change no code, config, or thresholds.** If you find a harness bug, fix it, log it in `data/reports/INCIDENTS.md`, and re-run or extend the affected day.

### 11.4 Volume and cost

| Part | Fetches |
|---|---:|
| Gold: 45 × 4 routes × 3 runs × 7 days | 3,780 |
| Live: 18 domains × 5 articles × 4 routes × 7 days | 2,520 |
| **Total (core routes)** | **≈ 6,300** |

About half go to paid routes (Zyte, Bright Data): roughly 3,150 paid requests, plus the optional routes. Check each provider's **current** per-request price and set the dashboard caps to match. Compressed raw storage stays well under 10 GB.

---

## 12. Failure and robustness suite

### 12.1 Controlled failure website (`faults.bench.distilled.news`)

It must be public, or Zyte, Bright Data, and Anthropic can't reach it. It needs a hostname, not a bare IP. Its `robots.txt` allows everything.

| Endpoint | Simulates | Expected — direct HTTP and browser | Expected — providers |
|---|---|---|---|
| `/ok/en`, `/ok/ar` | Normal article (control) | PASS | PASS |
| `/slow?s=60` | Server answers too late | FAIL `timeout` within 45 s | FAIL within 45 s |
| `/drip` | Body trickles 1 byte/s | FAIL at the total deadline, not just the connect timeout | Same |
| `/status/429` (`Retry-After: 120`) | Rate limited | FAIL `rate_limited`, one attempt only | FAIL, reason recorded |
| `/status/503` | Server error | FAIL `server_error` | Same |
| `/redirect-loop` | A → B → A | FAIL `too_many_redirects` after 5 hops | FAIL |
| `/redirect-chain/8` | Too many hops | FAIL after 5 | FAIL or provider limit; record |
| `/redirect-private` | 302 → `169.254.169.254` / `127.0.0.1` | **BLOCKED_CORRECTLY**, no connection made | Informational (runs on the provider's network); the harness must not store the result as an article |
| `internal.faults.bench.distilled.news` | DNS record pointing at `10.0.0.1` | **BLOCKED_CORRECTLY** | Informational |
| `/huge` | 50 MB HTML | FAIL `too_large` at 10 MB | FAIL, or truncated content that doesn't PASS |
| `/gzip-bomb` | ~100 KB gzip that expands to 2 GB | FAIL `too_large`, memory stays low | Record the provider's behaviour |
| `/malformed` | Broken tags | PASS or PARTIAL, no crash | Same |
| `/no-metadata` | Article with no meta tags or JSON-LD | PARTIAL (metadata missing), not FAIL | Same |
| `/js-only` | Text injected by JS after 2 s | Direct: FAIL (validator). Browser: PASS | HTTP modes likely FAIL; browser modes PASS |
| `/js-never` | Page keeps the network busy forever | Browser returns at the deadline with what's loaded; no hang | Same |
| `/cookie-overlay` | Consent banner over content that is in the DOM | PASS | PASS |
| `/cookie-gate` | Content only appears after a consent click | FAIL (honest), not FALSE_SUCCESS | Same |
| `/soft-404` | HTTP 200 "page not found" | FAIL | FAIL; PASS here counts as FALSE_SUCCESS |
| `/error-200` | HTTP 200 "access denied / enable JavaScript" | FAIL | FAIL |
| `/layout/v1`, `/layout/v2` | Same article, two different markups | PASS on both | PASS on both |
| `/charset/1256-header` | Arabic in windows-1256, correct header | PASS, correct text | Same |
| `/charset/1256-meta-only` | Charset only in `<meta>` | PASS | Same |
| `/charset/wrong-header` | Header says UTF-8, bytes are windows-1256 | Garbled text must score FALSE_SUCCESS, never PASS | Same |
| `/paginated/1` | Article continues on `/2` and `/3` | PARTIAL (page 1 only); record it | Same |
| `/liveblog` | Content changes every request | PASS against the latest version | Same |
| `/amp` | AMP page whose canonical is `/ok/en` | Canonical recorded as `/ok/en` | Same |
| `/canonical-elsewhere` | Canonical points to another URL | Declared canonical recorded | Same |

Run with `/opt/bench/bin/job faults`. It writes `reports/faults-<date>.md`, a matrix of expected vs actual. **Any mismatch on a safety row (private IP, size, deadline) is a bug to fix before trusting the run.**

### 12.2 Provider-side failures (`/opt/bench/bin/job chaos`)

In chaos mode, each provider adapter points at a mock on the fault site (`/mock/zyte/…`, `/mock/brightdata/…`, `/mock/anthropic/…`):

| Case | Mock returns | Expected |
|---|---|---|
| Provider down | Connection refused | FAIL `provider_unavailable`; other routes unaffected |
| Provider slow | 60 s delay | FAIL at the deadline |
| Provider 5xx | 500 / 503 | FAIL; with the retry policy on, at most 2 retries with backoff |
| Bad key | 401 | FAIL `provider_auth`; no retry; route disabled for the run; alert |
| Quota exhausted | 402 / 429 with a quota message | FAIL `provider_quota`; route paused; other routes continue |
| Success wrapping an error page | 200 + soft-404 HTML | FAIL via the validator, never PASS |

The retry policy the router will need, tested here with the mocks:
- retry only transient failures (timeouts, 5xx, 429 whose `Retry-After` fits within the deadline);
- never retry 4xx;
- at most 3 attempts in total, and the total time stays within the deadline.

One real check: rotate a provider key in its dashboard and confirm the 401 path.

### 12.3 Billing reconciliation (nightly)

Compare our request log with each provider's usage page:
- request counts;
- **requests that failed or timed out but were still billed.**

Record `billedOnFailure` per provider. It changes the real cost per successful article.

---

## 13. Real-world robustness

### 13.1 Blocking over time

From the live set, compute a daily **block rate** per domain × route: 403, 429, or a challenge page matched by Appendix C. Plot it over the seven days to see whether direct HTTP gets blocked more as the server's IP builds a history.

### 13.2 Request-rate ramp (Day 4)

The goal is to find a **safe polling ceiling** for direct HTTP, not to stress anyone's site.

- Pick 3 domains whose robots.txt has no crawl-delay (or one of 10 s or less) and which have plenty of recent article URLs.
- Use direct HTTP only, on different articles each time.
- Steps: 1 request / 60 s for 10 min → 1 / 20 s for 10 min → 1 / 10 s for 10 min.
- **Stop at the first 429, 403, or challenge page.** Never go faster than 1 request / 10 s or the robots crawl-delay.
- Record the step where the first block appeared, or "none up to 1 / 10 s".

This sets each domain's production polling rate and tells the router when to switch to a provider.

### 13.3 Long-term canaries (after the benchmark)

Keep a small daily job running: 1 gold article and 3 live articles per domain through the chosen route and its fallback. Alert if a domain's PASS rate stays below the threshold for 2 consecutive days. This catches real layout changes and new bot protection, which a seven-day run won't.

---

## 14. Experiment B and C — platform connectors and discovery

These can start in Week 2 on the same VPS; they don't depend on Experiment A. Every connector writes `CandidateProposal`-shaped JSONL (Contracts §6) to `data/connectors/<name>/`.

### 14.1 RSS

**Inputs:** the RSS feed of every domain in `domains.csv`, plus 5 Google News RSS queries (English, Arabic, French).

**Method:** poll every 10 minutes for 7 days with two parsers: the current repo parser (`packages/connectors/src/rss.ts`, run through Node) and Python `feedparser` as a reference.

| Test | How | Pass criterion |
|---|---|---|
| Format coverage | RSS 2.0, Atom, RDF feeds, plus fault-site feeds with bad XML, a BOM, wrong encoding, HTML entities, missing dates | Parsers agree on ≥ 99% of items; no crash |
| GUID stability | The same item keeps the same GUID across polls; items without a GUID fall back to the canonical link | 0 duplicate items |
| Conditional GET | Send `If-None-Match` / `If-Modified-Since`; record which feeds return 304 | Report % of feeds that support it (decides polling cost) |
| Full text vs excerpt | Compare the RSS content length with the extracted body | Per feed, `supplies_full_text` yes/no. If yes, the route is `supplied_payload` and no fetch is needed |
| Feed-window loss | Compare RSS items with the domain's news sitemap over 7 days | Items in the sitemap that never appeared in RSS = RSS misses |
| Appearance latency | RSS `pubDate` vs first seen | p50 / p95 |
| Dates | Missing, invalid, and timezone-less dates | 0 wrong dates in a sample of 50; poll time is never presented as publication time |
| Checkpoint safety (Contracts §34) | Kill the poller between fetch and store, then restart | 0 items lost, 0 duplicated; the cursor advances only after the items are stored |

### 14.2 Telegram — Telethon vs the current `t.me/s/` scraper

**Setup:**
- a dedicated Telegram account on its own SIM;
- `api_id` / `api_hash`;
- the Telethon session file in `/opt/bench/secrets` (permissions `600`).

Public channels can be read by username without joining.

**A. Controlled channel (correctness, Day 1).** Create a public test channel the team owns. A script posts a known sequence of 40 events:
- 20 text messages (Arabic, English, French, emoji, links);
- 5 photos with captions, 2 albums, 1 video, 1 document;
- 3 forwards and 1 reply;
- 2 edits (1 minute and 1 hour after posting);
- 2 deletions;
- 1 long message (about 4,000 characters) and 1 pinned message.

| Check | Expected |
|---|---|
| Resolve the channel by username | Channel ID recorded |
| Backfill history | Every event seen (deleted ones excepted) |
| Store the last message ID | The cursor equals the newest ID after each poll |
| Incremental fetch | A second poll (`min_id`) returns only new messages |
| Edits | Detected through `edit_date`; produce a new version, not a duplicate item |
| Deletions | Detected by re-checking recent IDs (`get_messages` returns `None`) and marked deleted |
| Albums | Grouped media (`grouped_id`) treated as one post |
| Duplicate replay | Re-running the same poll creates 0 new items |
| Crash safety | Kill between fetch and store, then restart: 0 lost, 0 duplicated |
| Original reference | Every item keeps `https://t.me/<channel>/<id>` |

**B. Real channels side by side (7 days).**
- **Channels:** 15–20 public Lebanese and regional channels in `telegram_channels.csv`, including at least 3 very high-volume ones.
- **Polling:** every 5 minutes, poll with Telethon (`min_id`) **and** the current `t.me/s/<channel>` parser (`packages/connectors/src/telegram.ts`).
- **Reference list:** Telethon's message-ID sequence. Message IDs increase one at a time within a channel, so a gap means a missed message, a deletion, or a service message. Fetch the missing IDs to tell which.
- **Metrics:**
  - recall of `t.me/s/` vs Telethon;
  - recall of Telethon vs the verified ID sequence;
  - freshness (post time → seen);
  - text and media completeness;
  - FloodWait count and total wait time;
  - errors.
- **Account safety:**
  - one request per channel per poll;
  - wait out FloodWait for exactly the required time;
  - don't join channels;
  - use the account for nothing else.

### 14.3 X — official API vs Bright Data vs the current Apify actor

**Setup:** 15–20 accounts in `x_accounts.csv` (journalists, ministries, outlets; mixed volume) plus the team's test account. Poll hourly, to keep costs bounded, for 7 days; the same accounts for all three providers.

**A. Controlled account.** Post a known sequence:
- a short post and a long post (over 280 characters; request the official API's long-post field, `note_tweet`, or long text comes back cut);
- an image post, a quote, a reply, and a repost;
- an edit, if the account supports it;
- a deletion after 10 minutes.

Check:
- every post is seen, and long text is complete;
- post IDs and cursors (`since_id`) advance incrementally;
- the deleted post is removed or flagged on the next poll;
- edits produce new versions.

**B. Real accounts (7 days).**
- **Reference list:** the union of all three providers by post ID, plus a daily manual check of 3 accounts' timelines.
- **Metrics:**
  - recall and freshness;
  - long-post completeness and media;
  - reply/repost handling (the config decides what counts);
  - rate-limit hits and errors;
  - **cost per 1,000 posts** and **cost per useful post** (relevance judged on a 100-post sample);
  - compliance with each provider's terms on storage and deletion.

### 14.4 GDELT

- **API:** DOC 2.0 (`https://api.gdeltproject.org/api/v2/doc/doc`) with `mode=ArtList&format=json&maxrecords=250`, windows set by `startdatetime` / `enddatetime`.
- **Queries:** the 10 in `discovery_queries.csv`, in English and Arabic (`sourcelang:arabic`), with a country filter where useful (e.g. `sourcecountry:lebanon`).
- **Cadence:** every 15 minutes, covering the last 20 minutes (5 minutes of overlap for late items). If a query returns the full 250 results, the window is saturated, so split it.
- **Metrics:**
  - unique URLs not found by RSS;
  - lag from publication to GDELT `seendate`;
  - Arabic coverage;
  - relevance (manual sample of 100);
  - duplicates against RSS (same canonical URL);
  - attribution: the publisher is recorded as the source and GDELT only as the discovery provider.
- **Outage isolation:** point the GDELT client at the fault mock (timeouts, 5xx) for an hour. The RSS and Telegram pollers must be unaffected.

### 14.5 Google News RSS (current system)

- **Queries:** the same as GDELT, via `https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=LB&ceid=LB:<lang>`.
- **Metrics:**
  - % of Google News redirect links resolved to the publisher's URL, and the time it takes;
  - 429 frequency;
  - overlap with GDELT and RSS;
  - unique useful articles.

### 14.6 Later — MediaStack, NewsData, SearchAPI, a WebDiscoveryProvider

Start these only after Experiment A, Telegram/RSS/X, and GDELT are done (Plan M10, §25).

- Run for 7 days on the same 10 queries. Pool everything and deduplicate by canonical URL.
- For each provider, measure:
  - **unique useful articles** (confirmed relevant, not found by RSS + GDELT + Telegram);
  - duplicate %;
  - freshness;
  - Arabic and French coverage;
  - **cost per unique useful article**.
- For web discovery (SearchAPI, Anthropic web search, or similar), test only on coverage-gap cases. Take 20 gold events where our sources had at most one independent source, and check whether the provider finds more independent sources, at what cost per useful discovery.

**Rule:** add a provider only if it contributes unique, important evidence at an acceptable cost, never because it returns many results.

---

## 15. Analysis and the decision

### 15.1 Per domain × route × extractor statistics

Write `reports/route_stats.csv` in the `AcquisitionRouteStats` shape (Contracts §11), plus benchmark extras:

```text
domainOrSourceId, route, extractor,
successRate            = PASS / attempts
usableRate             = (PASS + PARTIAL) / attempts
completenessRate       = share with extractionComplete = true
falseSuccessRate
blockRate
p50LatencyMs, p95LatencyMs,
estimatedCostPerRequest, costPerSuccessfulArticle, billedOnFailureRate,
consistency, sampleCount, ciLower95, ciUpper95, updatedAt
```

Report every rate with its `sampleCount` and a 95% Wilson confidence interval. For example, 35 successes out of 35 proves only that the true rate is at least about 90%.

### 15.2 Decision rule, per domain (starting values; frozen with the thresholds)

1. Drop any route that hits a hard disqualification:
   - it loses the publisher URL;
   - it invents or modifies content;
   - it can't enforce the deadline or cost limit;
   - it reaches prohibited targets;
   - it depends on bypassing access controls;
   - it has excessive false successes.
2. A route is **eligible** if:
   - the lower bound of its usable-rate CI is at least 0.85;
   - its PASS rate is at least 0.80;
   - its FALSE_SUCCESS rate is at most 1% (and 0 on the gold set);
   - its p95 latency is at most 30 s.
3. Choose the eligible route with the **lowest cost per successful article**.
4. If two routes are within 10% on cost, choose the one with lower p95 latency.
5. If no route is eligible, mark the domain `browser-or-drop` for manual review.
6. Choose the extractor for each route the same way (Trafilatura vs Readability).

The draft's weighted score may appear in the report as a secondary summary, but it doesn't decide anything.

### 15.3 Choosing the single fallback (Plan M2)

Look at the attempts where direct HTTP failed. The provider route that rescues the most of them at the lowest cost becomes the **one** v1 fallback. The browser stays the last resort for the domains that need it.

### 15.4 Outputs

- `reports/route_stats.csv`
- `reports/routing_policy.yaml` (the values below are **examples**; the benchmark fills them in):

```yaml
policyVersion: acq-router-v1
thresholdsVersion: thresholds-v1
default:
  primary: direct_http
  fallback: zyte_http          # example: whichever wins §15.3
  lastResort: browser_playwright
  extractor: trafilatura       # example
domains:
  nna-leb.gov.lb:        { primary: direct_http }
  example-js-site.com:   { primary: browser_playwright }
connectors:
  rss: supplied_payload_when_full_text
  telegram: telethon
  x: official_x                # example: whichever wins §14.3
discovery:
  broad: gdelt
  coverage_gap: <web discovery provider, if any passed §14.6>
```

- `reports/faults.md`, `reports/chaos.md`, `reports/connectors.md`, `reports/cost.md`
- A final report covering method, environment, results with confidence intervals, failure examples, cost, the routing policy, and limitations.

---

## 16. Integrating the winners

Follow Plan M2:

1. supplied payload (RSS feeds that carry full text);
2. direct HTTP;
3. **one** measured fallback (§15.3);
4. the browser as last resort, only for domains that need it.

Implement these behind the router and `WebFetchProvider` interfaces (Contracts §10, §33.2) and deploy to staging. Keep the canaries from §13.3 running. Add another provider only when measurements show a concrete need.

Where extraction, the browser, and Telethon run in production is still an open platform decision. This VPS can serve as the acquisition worker for staging.

---

## 17. Data handling, legal, and ethics

- Public pages only. No login, paywall, or CAPTCHA bypass. robots.txt and terms are reviewed and recorded per domain (§8.1).
- An honest User-Agent with contact details.
- Raw payloads are private research data. Don't publish them. Keep them for the benchmark plus 90 days, then delete them (v1.2 makes raw-payload TTL configurable, Baseline §27). Keep gold snapshots for reproducibility.
- Telegram and X: store only what's needed (text, ID, time, channel/account). Honour deletions and follow each platform's terms.
- Secrets never leave the server, except inside an encrypted backup.
- A spend cap is set in every provider dashboard.

---

## 18. Backups

Nightly, from a teammate's machine (Windows: run inside WSL, or use `scp -r`):

```bash
rsync -az bench@<VPS_IP>:/opt/bench/data/ ./distilled-bench-data/
```

This deliberately has no `--delete`, so a wiped server can't wipe the backup. Secrets are not included. Take a provider snapshot before the seven-day run and after it ends.

---

## 19. Timeline and roles (3 students)

| Week | Student 1 — infra and routes | Student 2 — gold and scoring | Student 3 — connectors |
|---|---|---|---|
| 1 | Accounts, VPS (§3–4), harness skeleton, `safety.py` | Domain review (§8.1), start gold labelling | Telegram account + controlled-channel script; RSS poller |
| 2 | Routes, fault site, pilot | Finish 45 gold articles, scorer, thresholds, pilot review | Start the 7-day Telegram and RSS side-by-side runs |
| 3 | Operate the 7-day website run | Daily human checks; live-oracle agreement | X controlled test + 7-day X run; GDELT poller |
| 4 | Fault suite, chaos, ramp, billing reconciliation | Analysis, routing policy | Connector analysis; Google News |
| 5 | Final report, integration plan | Final report; export gold and captures to `evaluation/` for M0 | Optional: news APIs and discovery (§14.6) |

Each week ends with one implementation increment, one measured result, and a short engineering note (Plan §26).

---

## 20. Definition of done

- [ ] `ENVIRONMENT.md` and `DECISIONS.md` recorded
- [ ] 45 gold articles labelled, double-labelling agreement reported
- [ ] `thresholds.yaml` frozen and tagged before the full run
- [ ] 7-day run complete, with at least 95% of scheduled jobs executed (healthchecks history)
- [ ] Fault matrix: every safety row matches expected
- [ ] Chaos results: retries bounded, isolation holds
- [ ] `route_stats.csv` with sample counts and confidence intervals
- [ ] `routing_policy.yaml` (`acq-router-v1`) with the one fallback justified by data
- [ ] Telegram, RSS, X, and GDELT connector reports
- [ ] Cost report reconciled with provider invoices, including billed-on-failure
- [ ] Gold labels and raw captures exported to `evaluation/` for M0
- [ ] Canaries running after the benchmark

---

## Appendix A — `config/benchmark.yaml` (starting point)

```yaml
version: bench-v1
timezone: UTC

limits:
  deadline_seconds: 45
  max_redirects: 5
  max_bytes_decompressed: 10485760
  retries: 0
  global_concurrency: 4
  per_domain_concurrency: 1
  per_domain_min_interval_seconds: 10   # raised automatically to robots Crawl-delay

headers:
  user_agent: "DistilledBenchmark/0.1 (+https://distilled.news/bot; <contact email>)"
  accept_language: "ar,en;q=0.9,fr;q=0.8"

routes:
  direct_http:         { enabled: true }
  zyte_http:           { enabled: true,  daily_budget_usd: <set> }
  brightdata_unlocker: { enabled: true,  daily_budget_usd: <set> }
  browser_playwright:  { enabled: true,  block_resources: [image, media, font] }
  zyte_browser:        { enabled: false, daily_budget_usd: <set> }
  anthropic_web_fetch: { enabled: false, model: claude-opus-5, effort: low, max_content_tokens: <set>, daily_budget_usd: <set> }
  worker_direct:       { enabled: false }

extractors: [trafilatura, readability]

metadata_precedence:
  title: [jsonld.headline, og:title, extractor]
  published_at: [jsonld.datePublished, article:published_time, extractor]
  canonical_url: [link.canonical, og:url, resolved_url]

live_set:
  max_articles_per_domain: 5
  lookback_hours: 24
  sources: [rss, news_sitemap]
```

## Appendix B — `config/thresholds.yaml` (freeze and tag after the pilot)

```yaml
version: thresholds-v1

normalization: [nfkc, lowercase_latin, strip_arabic_diacritics, strip_tatweel, unify_alef, strip_punctuation, collapse_whitespace]

labels:
  pass:
    body_f1_min: 0.90
    must_contain: all
    must_not_contain_max: 0
    title_similarity_min: 0.90
    canonical_url: equal_after_normalization
    date_tolerance: { minute: 5m, hour: same_hour, day: same_day_publisher_tz }
  partial:
    body_f1_min: 0.50
  false_success:
    body_f1_below: 0.50
    must_contain_found_below: 1
    signatures: config/signatures.txt

validator:
  min_chars: 250
  short_news_item_min_chars: 80
  truncation_markers: ["read more", "continue reading", "اقرأ المزيد", "lire la suite"]

live_oracle:
  title_similarity_min: 0.80
  snippet_min_words: 15
  snippet_token_coverage_min: 0.60
  human_agreement_min: 0.90

decision:
  usable_rate_ci_lower_min: 0.85
  pass_rate_min: 0.80
  false_success_rate_max: 0.01
  false_success_on_gold_max: 0
  p95_latency_ms_max: 30000
  cost_tie_band: 0.10
```

## Appendix C — Error and block signatures (starting list for `config/signatures.txt`)

Matched case-insensitively against the extracted text and the page `<title>`. Extend the list during the pilot.

```text
# not found / soft-404
page not found
404 not found
the page you requested
الصفحة غير موجودة
خطأ 404
page introuvable

# access / JavaScript walls
access denied
please enable javascript
you need to enable javascript
enable cookies

# bot challenges (used to measure blocking, never to bypass it)
just a moment...
attention required
verify you are human
are you a robot
captcha
cf-chl
px-captcha
datadome
```
