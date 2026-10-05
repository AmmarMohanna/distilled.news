# Distilled.news — Acquisition Benchmark Runbook v1.3 (VPS Test Environment)

**Status:** Planned evaluation on a VPS for testing APIs and scrapers. No benchmark has been executed by this document review.
**Version:** 1.3
**Depends on:** `ARCHITECTURE_BASELINE_v1.3.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.3.md`, `IMPLEMENTATION_PLAN_v1.3.md`
**Owners:** Workstream B (Acquisition) with Workstream G (Evaluation)
**Produces:** measured `AcquisitionRouteStats`, the Acquisition Router v1 routing policy, connector decisions for Telegram/X/LinkedIn/RSS/Google News/GDELT, and raw captures that seed the M0 replay dataset.


## Version 1.3 authority and status

Read [the decision register](README.md) and [the change log](REVIEW_AND_CHANGELOG_v1.3.md) with this document. This is a target plan, not a claim that its services already exist. Confirmed product direction and explicit user requests override older contradictory assumptions; non-conflicting v1.2 intelligence and delivery ambitions are retained. New schemas, providers, thresholds and schedules are proposed implementation details until accepted through measurement. Commands in this document are future runbook instructions, not authorization to execute them during a document review.


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

1. **Matched inputs and measured constraints** for every route. Match requested URLs, deadline and local caps; record provider-controlled egress, headers, redirects and limits that cannot be made identical.
2. **Fetch once per route attempt, extract many.** Save permitted raw results. Offline extractors avoid another provider fetch but still consume compute. A text-only provider cannot be treated as a raw-HTML route.
3. **Decide with minimum bars, then cost.** A route must clear quality gates; among the routes that clear them, the cheapest wins.
4. **Thresholds are frozen before the full run** and tagged in git. Nobody tunes them after seeing results.
5. **Scoring against gold is automated; gold labels are human-reviewed.** Live heuristics are proxy signals, not complete-content ground truth. Humans verify stratified samples and edge cases.
6. **No bypassing access controls.** No login bypass, paywall bypass, or CAPTCHA solving. robots.txt and terms are reviewed and recorded per domain.
7. **Everything is versioned:** harness git commit, extractor versions, thresholds version, and policy version (v1.3 provenance rules, Contracts §44).

### 0.3 Where this sits in v1.3

| v1.3 reference | What this runbook provides |
|---|---|
| Plan M2 (§6): "one fallback route… WebFetch provider OR Zyte HTTP" | The measurement that picks that one fallback |
| Contracts §10–§12: Acquisition Router, `AcquisitionRouteStats`, `AcquiredContent` | Per-domain route stats in that exact shape |
| Plan M10 (§14): real connectors, checkpoint invariant | Telegram, X, LinkedIn, RSS, Google News and GDELT connector tests |
| Plan M12 (§16): reliability, load, cost | Fault injection, billing reconciliation, cost per article |
| Plan §25: "parallel multiscraper validation" (experimental scope) | This whole benchmark |
| Plan M0 (§4): frozen replay dataset | Gold labels and raw captures exported for M0 |

This work runs **in parallel with M0**, not instead of it. Plan §25 warns against sacrificing the core vertical slice for integrations.

### 0.4 What changed from the team's draft plan

| Draft | This runbook | Why |
|---|---|---|
| Weighted score, cost = 5% | Minimum bars first, then cheapest | Cost at 5% can never move a result more than 5 points, which contradicts the stated objective |
| 30 fixed URLs re-fetched 21 times | 45 gold articles for correctness **plus** a daily set of new articles per domain | 30 URLs is about one article per domain, which can't estimate a domain's success rate |
| Extraction inside each route | Raw saved, extractors run offline; Trafilatura **and** Mozilla Readability | Reproducible; a JS extractor is a portability candidate; Worker compatibility and resource use must be tested |
| Manual labelling | Human gold labels; automated scoring; human-audited live proxies | 6,000+ attempts can't be hand-labelled |
| No baselines | The current `t.me/s/` scraper, Apify X actor, and Google News RSS are included | Otherwise we can't show contenders improve on the captured baseline under the same fixtures; no route is presumed production-validated |
| Failure site only | Plus provider-side faults, billing checks, request-rate ramp, content edge cases, canaries | The failure site mostly tests our wrapper, not real-world robustness |

---

## 1. What gets tested

| Experiment | Question | Contenders | When |
|---|---|---|---|
| **A. Website acquisition** | Given an article URL, which route gets complete, correct text most cheaply? | Direct HTTP · Zyte HTTP · Bright Data Web Unlocker · Playwright browser. Optional: Zyte browser mode · Anthropic web fetch · direct HTTP from a Cloudflare Worker | Weeks 2–4 |
| **B. Platform connectors** | Does the connector see every post, incrementally, with no loss or duplication? | RSS (project parser vs reference) · Telegram (Telethon vs public web adapter) · X (official API vs Bright Data vs Apify) · LinkedIn (Apify company/profile adapters and any eligible comparator) | Weeks 2–5, overlapping A |
| **C. News discovery** | Which important articles does each source add that the others missed, per dollar? | GDELT · Google News RSS (current). Later: MediaStack · NewsData · SearchAPI · a WebDiscoveryProvider | Weeks 3–6 |

Experiment A is the scraper benchmark. B and C are not scraper comparisons: Telegram and X are specialised platform connectors (Baseline §25), and discovery sources return pointers, not necessarily full content.

---

## 2. Decisions to make before starting (Day 0)

| # | Decision | Recommended default |
|---|---|---|
| 1 | Alternative WebFetch provider | Bright Data Web Unlocker is a proposed contender, not a selected winner. Verify permitted behavior, raw-output support and cost before enabling. Anthropic web fetch is optional (§7.2 R6). |
| 2 | Where production acquisition will run | The VPS tests APIs and scrapers (explicit user clarification). It is not presumed to host production acquisition. Production remains Cloudflare-first. A Worker-egress portability test is required before promoting any direct-fetch/extractor result to production. |
| 3 | User-Agent | Honest and identifying: `DistilledBenchmark/0.1 (+https://distilled.news/bot; <contact email>)` |
| 4 | Accept-Language | `ar,en;q=0.9,fr;q=0.8` for every route, so multilingual sites serve the same language version |
| 5 | Budget cap per paid provider | Set a hard cap in each provider's dashboard before the pilot |
| 6 | Pass thresholds | Starting values in §9 and Appendix B; freeze at the end of the pilot |
| 7 | LinkedIn and Apify | LinkedIn company/profile and Apify-backed sources are in product scope. Include their platform-specific tests; provider selection remains evidence-driven. |

Record the decisions in `data/reports/DECISIONS.md` on the server.

---

## 3. Accounts and keys

Prepare only the accounts needed for enabled experiments. This is a future execution checklist; it does not authorize purchases or account changes during document review:

| Account | Used for | Notes |
|---|---|---|
| VPS provider | The benchmark server | Any provider works (e.g. VPSServer.com, Hetzner, DigitalOcean) |
| DNS for `distilled.news` | `bench.distilled.news` and `faults.bench.distilled.news` → VPS IP | In Cloudflare DNS set these records to **DNS only** (grey cloud) so Cloudflare's proxy doesn't alter traffic |
| Zyte API | Routes R2 and R3 | API key |
| Bright Data | Web Unlocker zone (R4) and the X scraper product (Experiment B) | Zone credentials and API token |
| Anthropic API | Optional route R6 | API key |
| Telegram | Telethon (Experiment B) | Get `api_id` / `api_hash` at my.telegram.org using a **dedicated phone number**, never a personal account |
| X developer account | Official X API | Plus one team-controlled test X account |
| Apify | X/LinkedIn/selected actor baselines | Token needed if these routes are enabled; do not assume an existing valid token |
| healthchecks.io (optional; check current plan) | Email alert when a scheduled job doesn't run | One check per scheduled job |
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

The proposed harness is to be built at `evaluation/acquisition-benchmark/` (Plan §4 suggests an `evaluation/` directory). It uses **Python 3.12**, because Telethon, Trafilatura, Playwright, and the provider clients are Python-first, plus a **Node** step for Mozilla Readability. These paths and commands describe planned harness deliverables; verify their existence and pinned dependencies before execution.

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
│   ├── linkedin_poll.py        # company/profile actor modes and pagination
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
  "acquisitionMethod": "web_fetch",
  "acquisitionProvider": "zyte",
  "inputUrl": "https://example.com/news/123",
  "domain": "example.com",
  "goldId": "g_023",
  "liveReference": null,
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
  "cost": { "estimatedUsd": null, "billedUnits": 1, "cpuSeconds": 0.21 },
  "rawPayloadRef": "raw/2026-09-20/f_20260920_083012_7c1e.html.zst",
  "versions": { "harness": "git:abc1234", "route": "zyte_http@1", "benchmarkConfig": "bench-v1" }
}
```

For live-set attempts, `goldId` is null and `liveReference` holds the RSS item's `title` and `description` (§9.4).

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

### 6.4 Mapping to the v1.3 `AcquiredContent` contract (Contracts §12)

| `AcquiredContent` field | Comes from |
|---|---|
| `candidateId` | Canonical ID returned by Candidate Intake; maintain a separate `goldId`/fixture-to-candidate mapping, never substitute a gold-label ID |
| `resolvedUrl` | `transport.resolvedUrl` |
| `title`, `text`, `publishedAt`, `author` | Extraction |
| `acquisitionMethod` | Provider-neutral method enum (table below); keep the route/provider variant separately |
| `acquisitionProvider` | `self`, `zyte`, `brightdata`, `anthropic`, `cloudflare` |
| `rawPayloadRef` | `rawPayloadRef` |
| `acquiredAt` | `finishedAt` |
| `quality.transportSuccess / extractionSuccess / extractionComplete / confidence` | Extraction `quality` |

| Route | `acquisitionMethod` | `acquisitionProvider` |
|---|---|---|
| `direct_http` | `direct_http` | `self` |
| `zyte_http` | `web_fetch` | `zyte` |
| `zyte_browser` | `browser` | `zyte` |
| `brightdata_unlocker` | `web_fetch` | `brightdata` |
| `browser_playwright` | `browser` | `self` |
| `anthropic_web_fetch` | `web_fetch` | `anthropic` |
| `worker_direct` | `direct_http` | `cloudflare` |

The publisher/platform account is the evidence source; the provider is how content was retrieved. Create a canonical CandidateItem through intake before exporting AcquiredContent. Failed attempts remain FetchAttempt records and must not be exported as successful content.

---

## 7. Route and extractor specifications

### 7.1 Requested shared limits (record provider-enforcement differences)

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

**R1 — `direct_http` (VPS baseline; compute, bandwidth and host allocation still count).**
- Validate the URL with `safety.py` before the first request and again at every redirect hop. Prevent DNS-rebinding/time-of-check gaps with an enforced network/connection policy, not only a one-time DNS lookup. Allow only `http`/`https`. Resolve the host and refuse loopback, private (RFC 1918), link-local (including `169.254.169.254`), CGNAT, and IPv6 private ranges.
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
- Apply destination restrictions to every page request, redirect and subresource, backed by network isolation. A request interceptor alone is not proof against DNS rebinding or browser network paths; test those cases.
- Don't click consent buttons in v1. If that turns out to matter, test it later as a separate variant.
- Record CPU seconds and peak memory, so the browser cost can be priced for any host.

**R6 — `anthropic_web_fetch` (optional provider-managed text retrieval).**
- Before enabling, verify current official provider documentation, available model IDs, tool schema/version, domain limits, output semantics, fallback behavior and prices; pin the exact tested configuration in the run manifest.
- Do not assume a hardcoded model name, tool date or beta header from an old document is available. This revision intentionally removes the earlier unverified model/tool/fallback recipe.
- Score the actual retrieved document/tool result, never the assistant's generated prose. Reject empty, filtered, summarized or truncated responses as full-text acquisition unless their limitations are explicitly scored.
- Inspect tool-level errors even when the HTTP response is 200. Record provider-controlled behavior that cannot honor the shared limits; separate text-only output from the HTML/extractor comparison.
- Use an end-to-end deadline, provider call cap and cost reservation. Treat unknown billed usage as unknown until reconciliation.

**R7 — `worker_direct` (production portability validation).**
- Run a small isolated test Worker against the same permitted fixtures, with a domain allowlist, authentication, rate/budget limits and no unrestricted public proxy endpoint.
- Match the tested extraction path and record compatibility date, dependencies, CPU/wall time, memory/size behavior and egress differences from the VPS. A successful Node run of Readability/linkedom does not establish Worker compatibility.
- This route is not required to begin the VPS experiment, but is required before adopting a direct-fetch/extractor route for the Cloudflare production runtime.
- Provider selection on the VPS is provisional until this gate passes or a separate runtime change is explicitly decided.

---

### 7.3 Extractors (run offline on every saved raw HTML)

| Extractor | Why |
|---|---|
| `trafilatura` (Python) | v1.3 names it ("Trafilatura or equivalent") |
| `readability` (Node: `@mozilla/readability` + `linkedom`) | JavaScript portability candidate; verify inside the target Worker runtime |
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
- record `completenessHeuristic` and its reasons separately. Sentence endings and truncation markers can suggest incompleteness but cannot prove full coverage; `extractionComplete` remains false/unknown until supported by gold or trustworthy structural evidence. Brief real posts must not inherit website article-length thresholds.

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

**How to investigate JavaScript dependence:** copy a distinctive sentence from the visible article, then run:

```bash
curl -sL -A "<the benchmark UA>" "<url>" | grep -c "<distinctive sentence>"
```

`0` is only a diagnostic lead. First compare status, headers, charset, redirects, locale, consent and block responses. Confirm that JavaScript actually inserts the missing body before setting `js_required = yes`; otherwise record `unknown` or the observed cause.

### 8.2 Gold set — 45 articles

Select 45 distinct articles. Assign one primary stratum per article for sample counts; optional secondary tags may overlap without inflating the denominator.

| Category | Count | Notes |
|---|---:|---|
| Simple English | 8 | |
| Arabic | 10 | |
| French / multilingual | 5 | |
| JavaScript-rendered | 5 | Confirmed by the rendering comparison |
| Redirect / canonical cases | 4 | Google News links, AMP pages, shortened links, tracking parameters |
| Difficult but permitted | 4 | Bot-protected or very heavy pages; no bypassing |
| Live blog / continuously updated | 2 | |
| Short breaking-news item (under 80 words) | 3 | Tests the validator's short-item rule |
| Multi-page article | 2 | |
| Arabic page with legacy or wrong encoding | 2 | e.g. windows-1256 |
| **Total** | **45** | |

The four-route pilot assumes both paid comparison routes have passed configuration checks; otherwise recalculate volume and document disabled routes. The pilot uses 5 of these: one English, one Arabic, one French, one JS-rendered, and one redirect case.

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
- **canonicalUrl:** a reviewed identity URL. Keep declared canonical, final URL and normalized identity separately; a cross-domain or malicious canonical tag must not overwrite publisher identity without verification.
- **publisher:** the site's name as it presents itself.
- **author:** the byline, or `null`.
- **publishedAt:** ISO 8601 with timezone. Use the visible dateline first and JSON-LD `datePublished` as a cross-check. Set `publishedAtPrecision` to `minute`, `hour`, or `day`.
- **body:** article paragraphs in order, subheadings and editorially quoted/embedded material that is part of the report. Separately label captions/embeds and document inclusion rules. Exclude navigation, related-content blocks, share controls, ads, newsletter boxes and reader comments; do not remove an embedded statement when it is the article’s evidence.
- **mustContain:** distinct first/middle/last anchors when available. For very short items use all available distinct anchors and record their count; do not demand three sentences from a one-sentence update.
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

Token-multiset **precision**, **recall**, and **F1** between extracted text and gold body, counting repeated tokens. Define title similarity explicitly with the same token-F1 normalization. Also test paragraph/anchor order and duplicated paragraphs: token counts alone cannot prove correct order or intact quotations.
- **Recall:** how much of the article we got.
- **Precision:** how much of what we got is article text rather than boilerplate.

### 9.3 Gold labels (total decision rule)

Evaluate in order and emit exactly one label:

1. `BLOCKED_CORRECTLY`: a fixture required refusal and the route refused without making a prohibited request. Report in the safety suite, outside normal article-success denominators.
2. `FAIL`: transport/extraction honestly failed or the production validator rejected the result.
3. `FALSE_SUCCESS`: the validator claimed success but human/gold evidence identifies an error page, wrong article, corrupted text, severe truncation (body F1 < 0.50), or zero required anchors. Contextualize error signatures: an article quoting “access denied” is not automatically a block page.
4. `PASS`: body F1 >= 0.90, all available required anchors in valid order, no labeled boilerplate leakage, title token-F1 >= 0.90, verified canonical identity, and correct publication metadata where known.
5. `PARTIAL`: every other non-failing extraction, including F1 >= 0.90 with only some anchors, missing metadata, boilerplate or invalid ordering. There is no unlabeled fall-through.

Unknown publication dates are not invented from fetch time; report body quality and metadata completeness separately. Timestamp tolerance is +/-5 minutes at minute precision, the same hour at hour precision, or the same publisher-local day at day precision. Missing gold dates are not scored as wrong dates.

URL normalization removes only known tracking components and normalizes safe host/scheme/port syntax. Do not universally strip trailing slashes or meaningful query parameters. Keep redirects, declared canonicals and reviewed equivalences for audit.

### 9.4 Live-set proxy scoring (not gold)

RSS titles/descriptions and sitemap hints are weak references. Record title similarity, snippet overlap and validator reasons as `PROXY_PASS`, `PROXY_SUSPECT` or `PROXY_FAIL`; a snippet match does not prove full article completeness. Missing/short snippets produce `INSUFFICIENT_REFERENCE`, not an invented failure or pass. Never mix these proxy labels into the gold PASS-rate denominator.

Human-review at least 20 live results/day, stratified across route, language, source and proxy outcome, with a reproducible sample seed. Report proxy/human agreement and uncertainty by stratum. If agreement falls below the predeclared gate, mark the affected estimate unreliable. Fix the proxy only in a new version and rescore saved outputs consistently; do not change thresholds halfway through a frozen run.

---

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

Compute actual requests per domain, including retries and provider fan-out. No request count is automatically appropriate: use reviewed source limits, shared scheduling and backoff.

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

About half go to paid routes (Zyte, Bright Data): roughly 3,150 paid requests, plus the optional routes. Check each provider's **current** per-request price and set the dashboard caps to match. Measure storage in the pilot. A 10 MiB response cap across 6,300 attempts allows over 60 GiB before compression and does not justify a guaranteed under-10-GB claim; budget raw, extracted, browser and backup artifacts separately.

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
- do not retry permanent 4xx/auth/quota failures; 429 is an explicit exception only for transient rate limiting when Retry-After fits the remaining deadline;
- at most 3 attempts in total, and the total time stays within the deadline.

Use a dedicated disposable test credential to test revocation; never rotate a shared or production key as a benchmark side effect.

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

- Use team-controlled domains or sources with explicit permission for rate experiments; an absent crawl-delay does not establish permission for a ramp. Other sources remain at their reviewed normal collection rate.
- Use direct HTTP only, on different articles each time.
- Steps: 1 request / 60 s for 10 min → 1 / 20 s for 10 min → 1 / 10 s for 10 min.
- **Stop at the first 429, 403, or challenge page.** Never go faster than 1 request / 10 s or the robots crawl-delay.
- Record the step where the first block appeared, or "none up to 1 / 10 s".

This estimates behavior only under the tested conditions. Do not present it as a permanent production ceiling or respond to access denial by automatically escalating to an access-bypassing provider.

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
| Feed-window loss | Compare RSS items with the domain's news sitemap over 7 days | Audited sitemap articles absent from RSS = observed RSS coverage gaps; sitemap completeness is not assumed |
| Appearance latency | RSS `pubDate` vs first seen | p50 / p95 |
| Dates | Missing, invalid, and timezone-less dates | 0 wrong dates in a sample of 50; poll time is never presented as publication time |
| Checkpoint safety (Contracts §34) | Kill the poller between fetch and store, then restart | 0 items lost, 0 duplicated; the cursor advances only after the items are stored |

### 14.2 Telegram — Telethon vs the current `t.me/s/` scraper

**Setup:**
- a dedicated Telegram account on its own SIM;
- `api_id` / `api_hash`;
- the Telethon session file in `/opt/bench/secrets` (permissions `600`).

Test the actual access behavior of each permitted public channel. Do not assume every channel is readable without joining or special access.

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
| Store the last message ID | The cursor equals the highest durably processed ID after all accepted pages are committed |
| Incremental fetch | A second poll (`min_id`) returns only new messages |
| Edits | Detected in an explicit recent-ID recheck pass using edit metadata; new-ID polling alone cannot find old edits |
| Deletions | Recheck known recent IDs; distinguish confirmed deletion from access loss, transient failure and an unknown ID. Record uncertainty rather than declaring every missing result deleted |
| Albums | Preserve each message ID and the group ID; optionally display one album without losing per-message checkpoint/provenance |
| Duplicate replay | Re-running the same poll creates 0 new items |
| Crash safety | Kill between fetch and store, then restart: 0 lost, 0 duplicated |
| Original reference | Every item keeps `https://t.me/<channel>/<id>` |

**B. Real channels side by side (7 days).**
- **Channels:** 15–20 public Lebanese and regional channels in `telegram_channels.csv`, including at least 3 very high-volume ones.
- **Polling:** every 5 minutes, poll with Telethon (`min_id`) **and** the current `t.me/s/<channel>` parser (`packages/connectors/src/telegram.ts`).
- **Reference list:** Controlled test logs are the correctness oracle. On real channels use the union of observed IDs plus audited histories. ID gaps are investigation leads, not proof of missed visible posts or a complete Telethon ground truth.
- **Metrics:**
  - recall of `t.me/s/` vs Telethon;
  - recall of Telethon vs the verified ID sequence;
  - freshness (post time → seen);
  - text and media completeness;
  - FloodWait count and total wait time;
  - errors.
- **Account safety:**
  - bounded paginated requests per poll until the durable watermark is covered; report saturation and backlog rather than silently truncating high-volume channels;
  - wait at least the provider-required interval; reschedule with bounded backoff and record the outage rather than advancing the cursor;
  - don't join channels;
  - use the account for nothing else.

### 14.3 X — official API vs Bright Data vs the current Apify actor

**Setup:** 15–20 accounts in `x_accounts.csv` (journalists, ministries, outlets; mixed volume) plus the team's test account. Poll hourly, to keep costs bounded, for 7 days; the same accounts for all three providers.

**A. Controlled account.** Post a known sequence:
- a short post and a long post (over 280 characters; request the official API's long-post field, `note_tweet`, or long text comes back cut);
- an image post, a quote, a reply, and a repost;
- an edit, if the account supports it;
- a deletion only after every compared route has acknowledged the controlled post; test shorter-lived posts separately as expected coverage limitations under hourly polling.

Check:
- every post is seen, and long text is complete;
- post IDs and cursors (`since_id`) advance incrementally;
- a confirmed deletion is reflected within the adapter’s declared recheck window; incremental new-post queries alone do not guarantee deletion detection;
- edits produce new versions.

**B. Real accounts (7 days).**
- **Reference list:** the union of all three providers by post ID, plus a daily manual check of 3 accounts' timelines.
- **Metrics:**
  - observed-union coverage and freshness (not absolute recall unless controlled ground truth exists);
  - long-post completeness and media;
  - reply/repost handling (the config decides what counts);
  - rate-limit hits and errors;
  - **cost per 1,000 posts** and **cost per useful post** (relevance judged on a 100-post sample);
  - compliance with each provider's terms on storage and deletion.

### 14.3a LinkedIn and Apify actor contracts

Test company and profile sources separately with reviewed public test cases. Record actor ID/version, accepted input schema, dataset fields, pagination/cursors, limits, task/run IDs, terminal run state, source timestamps and original post URLs. Include asynchronous completion, empty success, partial dataset, duplicates, 429, bad token, provider quota, crash/retry and billed-failure tests. Validate that an actor launch is not reported as successful content ingestion before a terminal result is imported.

Use owned/authorized controlled fixtures for edits/deletions when feasible; report unsupported observability honestly. Measure cost per unique usable post and per source refresh. Apify is a provider, not the publisher, and must not inflate independent-source counts. Keep actor configurations replaceable; do not assume a token exists or a named actor remains available.

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

- **Queries:** the same as GDELT, using verified supported query/locale combinations for each test language. Do not assume one `gl`/`ceid` combination supports every language; save the exact effective URL and response language.
- **Metrics:**
  - % of Google News redirect links resolved to the publisher's URL, and the time it takes;
  - 429 frequency;
  - overlap with GDELT and RSS;
  - unique useful articles.

### 14.6 Later — MediaStack, NewsData, SearchAPI, a WebDiscoveryProvider

Start these only after Experiment A and the selected Telegram/RSS/X/LinkedIn/Google News/GDELT baseline tests are done (Plan M10, §25).

- Run for 7 days on the same 10 queries. Pool everything and deduplicate by canonical URL.
- For each enabled provider, measure:
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

Report denominators, unique article/domain counts and uncertainty. Wilson intervals apply only to an appropriately independent binomial unit; 21 repeated attempts on one article are not 21 independent articles. Use article/domain clustered bootstrap or a declared repeated-measures analysis for repeated gold runs. Report gold, audited-live, proxy-live and fault results separately. A small sample supports uncertainty, not a guarantee.

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
5. If no route is eligible, mark `no_eligible_route` for review; do not automatically promote a browser that failed the same gates.
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
  telegram: <measured_adapter>
  x: <measured_adapter>
  linkedin: <measured_company_and_profile_adapters>
discovery:
  broad: <measured_google_news_or_optional_discovery_adapter>
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

The VPS is for testing APIs and scrapers. It is not automatically promoted into production or staging acquisition. Export measured policies and fixtures, then validate the chosen adapters in the Cloudflare target runtime. Any external acquisition service would require a separate architecture decision backed by these measurements.

---

## 17. Data handling, legal, and ethics

- Public pages only. No login, paywall, or CAPTCHA bypass. robots.txt and terms are reviewed and recorded per domain (§8.1).
- An honest User-Agent with contact details.
- Raw payloads are private research data. Don't publish them. Set an explicit research retention/expiry policy before collecting. The earlier benchmark-plus-90-days value is a proposed maximum, not an agreed universal rule; source restrictions may require less. Apply deletion/expiry to raw data, gold snapshots and backups, and retain reproducible permitted fixtures/derived metrics as allowed. Do not assume gold snapshots are exempt forever.
- Telegram and X: store only what's needed (text, ID, time, channel/account). Honour deletions and follow each platform's terms.
- Secrets never leave the server, except inside an encrypted backup.
- A spend cap is set in every provider dashboard.

---

## 18. Backups

Nightly, from a teammate's machine (Windows: run inside WSL, or use `scp -r`):

```bash
rsync -az bench@<VPS_IP>:/opt/bench/data/ ./distilled-bench-data/
```

This deliberately has no `--delete`, so an accidental server wipe does not immediately wipe the backup. Separately enforce the retention/deletion schedule on backups; avoiding --delete is not permission to keep expired data forever. Secrets are not included. Take a provider snapshot before the seven-day run and after it ends.

---

## 19. Timeline and roles (3 students)

| Week | Student 1 — infra and routes | Student 2 — gold and scoring | Student 3 — connectors |
|---|---|---|---|
| 1 | Accounts, VPS (§3–4), harness skeleton, `safety.py` | Domain review (§8.1), start gold labelling | Telegram account + controlled-channel script; RSS poller |
| 2 | Routes, fault site, pilot | Finish 45 gold articles, scorer, thresholds, pilot review | Start the 7-day Telegram and RSS side-by-side runs |
| 3 | Operate the 7-day website run | Daily human checks; live-proxy agreement | X controlled test + 7-day X run; GDELT poller |
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
- [ ] Telegram, RSS, X, LinkedIn, Google News, and each enabled discovery-provider report (disabled experiments documented)
- [ ] Cost report reconciled with provider invoices, including billed-on-failure
- [ ] Gold labels and raw captures exported to `evaluation/` for M0
- [ ] Canaries running after the benchmark

---

## Appendix A — `config/benchmark.yaml` (starting point)

```yaml
version: bench-v1.3
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
  zyte_http:           { enabled: false,  daily_budget_usd: null }
  brightdata_unlocker: { enabled: false,  daily_budget_usd: null }
  browser_playwright:  { enabled: true,  block_resources: [image, media, font] }
  zyte_browser:        { enabled: false, daily_budget_usd: null }
  anthropic_web_fetch: { enabled: false, model: null, tool_version: null, max_content_tokens: null, daily_budget_usd: null } # verify and pin before enabling
  worker_direct:       { enabled: false } # required portability gate before production adoption

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

live_proxy:
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


## Appendix D — Execution and Promotion Gates

The user clarified on 2026-09-20 that the VPS is for testing APIs and scrapers. Keep the VPS harness and its operating instructions; do not infer a production hosting change from them. No instruction to rent a server, send test posts, rotate credentials or run paid experiments was executed during this review.

Before execution:

- Implement the proposed harness, schemas, fixtures and jobs; fail configuration validation when an enabled paid route has no verified credential, current pricing basis or positive finite budget cap.
- Verify current official API documentation for enabled providers (model/tool names, actor schema, pagination, errors, storage/deletion behavior, billing). Record date and source URLs with the pinned configuration. Disable unavailable contenders without calling them failed acquisition routes.
- Freeze sample units, seeds, thresholds, route variants, costs and gold labels after the pilot. Labels are human ground truth; live proxy signals are not interchangeable with them.
- Bound decompressed bytes, redirects, DNS/network access, total time and provider calls. If a managed provider cannot expose/enforce a limit, record the limitation and do not claim equivalent enforcement.
- Use a shared domain request scheduler across routes and jobs; a per-job flock alone does not prevent simultaneous jobs exceeding a domain's limit. Read job exit codes and record skipped/overlapping runs.
- Treat rendered DOM, raw HTTP bytes and provider-generated text as different artifact types; preserve hash, acquisition time and representation. Dynamic pages need time-matched gold versions, not stale snapshot labels.
- Apply the VPS setup steps only on a fresh intended test machine after checking existing users, SSH config, swap, Docker and exposed ports. Pin versions; test remote access before disabling an existing login path.

Before production adoption: confirm the adapter meets quality/cost gates; export through Candidate Intake with canonical IDs; prove target-runtime compatibility; verify checkpoints/outbox recovery, source attribution, permitted use and credentials; run staging canaries; document limitations and rollback. The benchmark selects a measured route policy, not a new hosting architecture.

The 45-article/seven-day design, route count, 45-second deadline, 10-MiB cap, numerical thresholds and five-week schedule are retained **proposed experimental defaults**. They are not completed results, guaranteed prices, or user-approved spending limits.
