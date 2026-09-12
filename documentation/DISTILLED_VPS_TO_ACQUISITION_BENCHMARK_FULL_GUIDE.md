# Distilled.news — VPS-to-Benchmark Execution Guide

**Purpose:** Exact step-by-step execution guide starting from the currently provisioned VPS and ending with a completed acquisition benchmark, connector evaluation, routing policy, and integration decision.

**Project:** Distilled.news FYP  
**Architecture baseline:** v1.2  
**Benchmark runbook:** Acquisition Benchmark Runbook v1.2  
**Audience:** Distilled.news FYP team  
**Server starting point:** Hostinger VPS, Frankfurt, Ubuntu 26.04 LTS, 2 vCPU, 8 GB RAM, 100 GB disk, public IPv4

---

# 0. Read This First

This document assumes the VPS already exists and that you can see the server dashboard.

Your current VPS is:

```text
Region:        Germany — Frankfurt
OS:            Ubuntu 26.04 LTS
CPU:           2 vCPU
RAM:           8 GB
Disk:          100 GB
Bandwidth:     8 TB
Public IPv4:   available
Backups:       weekly
```

This machine is sufficient to start the benchmark.

The original runbook preferred:

```text
4 vCPU
8 GB RAM
80 GB disk
```

Your machine has:

```text
2 vCPU
8 GB RAM
100 GB disk
```

That means:

- RAM is sufficient.
- Disk is more than sufficient.
- CPU is lower than the preferred benchmark host.
- Do **not** upgrade immediately.
- Start with this machine.
- Reduce benchmark concurrency from `4` to `2`.
- Record that the benchmark was run on 2 vCPU.
- If Playwright becomes CPU-bound or produces unstable latency, then upgrade before the final seven-day run.

The VPS is not the final production architecture. It is currently:

```text
benchmark machine
+
acquisition worker
+
controlled failure-test host
+
connector test host
```

Do not move the whole Distilled.news product onto this machine yet.

---

# 1. What This Benchmark Must Produce

The objective is **not**:

> Find one scraper that handles every website.

The objective is:

> Determine the cheapest sufficiently reliable acquisition route for each domain/source type.

The benchmark should eventually produce:

```text
reports/
├── ENVIRONMENT.md
├── DECISIONS.md
├── route_stats.csv
├── routing_policy.yaml
├── faults.md
├── chaos.md
├── connectors.md
├── cost.md
├── INCIDENTS.md
└── FINAL_ACQUISITION_REPORT.md
```

The final routing policy should look conceptually like:

```yaml
policyVersion: acq-router-v1

default:
  primary: direct_http
  fallback: <measured winner>
  lastResort: browser_playwright

domains:
  example.com:
    primary: direct_http

  js-heavy-example.com:
    primary: browser_playwright

connectors:
  rss: supplied_payload_when_full_text
  telegram: telethon
  x: <measured winner>

discovery:
  broad: gdelt
  coverage_gap: <optional provider if justified>
```

---

# 2. Important Corrections to Freeze Before Implementation

Before starting the final benchmark, apply these methodological rules.

## 2.1 Repeated fetches are not independent samples

If one article is fetched 21 times:

```text
same article
× 21
```

that does **not** equal 21 independent examples.

Use repeated runs to measure:

```text
temporal consistency
blocking over time
label flips
provider instability
latency variation
```

Use **unique article URLs** as the unit for domain-level reliability.

For confidence intervals:

- aggregate first by unique URL; or
- use cluster bootstrap where URL is the cluster.

Do not claim `n = 42` if those 42 attempts came from only two unique articles.

## 2.2 Evaluate routing chains

The production system will use a chain such as:

```text
direct HTTP
   ↓ failure
managed fallback
   ↓ failure
browser
```

Therefore evaluate both:

```text
standalone route quality
```

and:

```text
routing-policy quality
```

At minimum evaluate:

```text
direct only
direct → Zyte
direct → Bright Data
direct → Playwright
direct → chosen managed fallback → Playwright
```

For each chain measure:

```text
final usable rate
final PASS rate
false-success rate
average cost/correct article
p50 latency
p95 latency
fallback activation rate
browser activation rate
```

## 2.3 RSS mismatch is not automatically FALSE_SUCCESS

For live articles without gold labels:

```text
RSS title/snippet agrees strongly
→ AUTO_PASS
```

If the RSS oracle does not agree:

```text
→ AUTO_UNVERIFIED
```

Do **not** automatically label it `AUTO_FALSE_SUCCESS`.

Only a gold-labelled result or unmistakable block/error signature should establish a true false-success.

## 2.4 Gold pages can change

For the frozen gold set:

- prefer stable articles;
- avoid pages known to rewrite continuously;
- keep page snapshots;
- if the source legitimately changes during the seven-day experiment, mark that attempt:

```text
SOURCE_CHANGED
```

and exclude it from static body-accuracy scoring.

Live blogs belong mainly in robustness testing, not static gold-body scoring.

---

# 3. Phase 1 — Save the VPS Information

Before changing anything, create a local note with:

```text
VPS provider: Hostinger
Plan: KVM 2
Region: Frankfurt, Germany
OS: Ubuntu 26.04 LTS
CPU: 2 vCPU
RAM: 8 GB
Disk: 100 GB
Bandwidth: 8 TB
Backup schedule: weekly
Provisioned date: 2026-09-11
```

Do **not** write the VPS password, API keys, Telegram session, or secret values into your project repository.

Keep the IPv4 private from public documentation.

---

# 4. Phase 2 — Create SSH Keys on Your Windows Laptop

Open PowerShell.

Check whether you already have SSH keys:

```powershell
Get-ChildItem $env:USERPROFILE\.ssh
```

If you already have:

```text
id_ed25519
id_ed25519.pub
```

you may reuse them if they belong to you.

Otherwise create a new key:

```powershell
ssh-keygen -t ed25519 -C "distilled-benchmark"
```

Press Enter to accept:

```text
C:\Users\<YOU>\.ssh\id_ed25519
```

Prefer setting a passphrase.

Display the **public** key:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

It starts with:

```text
ssh-ed25519 ...
```

Only the `.pub` key is safe to copy.

Never send:

```text
id_ed25519
```

to anyone.

---

# 5. Phase 3 — First Login as root

Use the public IPv4 shown by Hostinger:

```powershell
ssh root@<VPS_IP>
```

Example:

```powershell
ssh root@203.0.113.10
```

The first time, SSH may ask:

```text
Are you sure you want to continue connecting?
```

Type:

```text
yes
```

If Hostinger supplied a root password, enter it.

Once logged in:

```bash
whoami
```

Expected:

```text
root
```

Check OS:

```bash
cat /etc/os-release
```

Check CPU:

```bash
nproc
```

Expected approximately:

```text
2
```

Check memory:

```bash
free -h
```

Check disk:

```bash
df -h /
```

Check public time:

```bash
date
```

---

# 6. Phase 4 — Create the `bench` User

Do not operate the benchmark permanently as root.

Create:

```bash
adduser bench
```

Choose a strong password.

Add to sudo:

```bash
usermod -aG sudo bench
```

Copy root's current SSH authorization to the new account:

```bash
rsync --archive --chown=bench:bench ~/.ssh /home/bench
```

Verify:

```bash
ls -la /home/bench/.ssh
```

Expected:

```text
authorized_keys
```

Do **not** disable root SSH yet.

Open a **second PowerShell window** on your laptop:

```powershell
ssh bench@<VPS_IP>
```

Then:

```bash
whoami
```

Expected:

```text
bench
```

Test sudo:

```bash
sudo whoami
```

Expected:

```text
root
```

Only continue after this works.

---

# 7. Phase 5 — Disable Unsafe SSH Login Methods

While logged in as `bench`:

```bash
sudo mkdir -p /etc/ssh/sshd_config.d
```

Create:

```bash
sudo tee /etc/ssh/sshd_config.d/99-bench.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
```

Check SSH configuration:

```bash
sudo sshd -t
```

If this produces no error, restart:

```bash
sudo systemctl restart ssh
```

Keep your current session open.

Open another PowerShell window:

```powershell
ssh bench@<VPS_IP>
```

Confirm it still works.

After this:

```text
root SSH login      disabled
password SSH login  disabled
SSH key login       enabled
```

---

# 8. Phase 6 — Patch the VPS

Run:

```bash
sudo apt update
sudo apt -y upgrade
```

If the system says a reboot is required:

```bash
test -f /var/run/reboot-required && echo "REBOOT REQUIRED"
```

If required:

```bash
sudo reboot
```

Wait approximately one minute, then reconnect:

```powershell
ssh bench@<VPS_IP>
```

---

# 9. Phase 7 — Install Base Utilities

Install:

```bash
sudo apt -y install \
  ufw \
  fail2ban \
  unattended-upgrades \
  git \
  curl \
  wget \
  jq \
  htop \
  zstd \
  ca-certificates \
  gnupg \
  lsb-release \
  rsync \
  sqlite3 \
  dnsutils \
  net-tools
```

Verify:

```bash
git --version
curl --version
jq --version
zstd --version
```

---

# 10. Phase 8 — Set the Server Timezone to UTC

The benchmark should use UTC internally.

Run:

```bash
sudo timedatectl set-timezone UTC
```

Verify:

```bash
timedatectl
```

Expected:

```text
Time zone: Etc/UTC
```

All experiment timestamps should be stored in UTC.

Publisher timestamps can keep their original timezone in article metadata.

---

# 11. Phase 9 — Configure the Firewall

Default policy:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

Allow SSH:

```bash
sudo ufw allow OpenSSH
```

Allow HTTP/HTTPS for the controlled fault-test website:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Enable:

```bash
sudo ufw enable
```

Check:

```bash
sudo ufw status verbose
```

Expected approximately:

```text
22/tcp    ALLOW
80/tcp    ALLOW
443/tcp   ALLOW
```

Do not expose:

```text
PostgreSQL
Redis
internal benchmark runner
FastAPI internal ports
Docker control socket
```

to the public internet.

---

# 12. Phase 10 — Configure Fail2Ban

Check service:

```bash
sudo systemctl enable --now fail2ban
sudo systemctl status fail2ban
```

Optional basic SSH jail:

```bash
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
```

Restart:

```bash
sudo systemctl restart fail2ban
```

Check:

```bash
sudo fail2ban-client status sshd
```

---

# 13. Phase 11 — Enable Automatic Security Updates

Run:

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

Confirm:

```bash
systemctl status unattended-upgrades
```

---

# 14. Phase 12 — Add Swap

Chromium can temporarily consume a lot of memory.

Create 4 GB swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Persist:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify:

```bash
swapon --show
free -h
```

---

# 15. Phase 13 — Install Docker

## 15.1 Add Docker's official key

```bash
sudo install -m 0755 -d /etc/apt/keyrings
```

```bash
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
```

```bash
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Determine codename:

```bash
. /etc/os-release
echo "$VERSION_CODENAME"
```

Before adding the repository, verify Docker currently has a repository for that Ubuntu codename:

```bash
curl -I "https://download.docker.com/linux/ubuntu/dists/${VERSION_CODENAME}/Release"
```

If this returns a normal HTTP success response, continue.

Add the repository:

```bash
echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
```

Install:

```bash
sudo apt update
sudo apt -y install \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

If Docker does **not** publish a repository for Ubuntu 26.04 yet, do not point APT at a different Ubuntu codename. Use the Ubuntu-provided Docker package temporarily:

```bash
sudo apt update
sudo apt -y install docker.io docker-compose-v2
```

Then continue.

## 15.2 Add `bench` to Docker group

```bash
sudo usermod -aG docker bench
```

Log out:

```bash
exit
```

Reconnect:

```powershell
ssh bench@<VPS_IP>
```

Verify:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

---

# 16. Important Docker Firewall Rule

Docker can bypass UFW when ports are published.

Therefore:

- publish only Caddy on `80` and `443`;
- keep the fault-site app internal;
- keep runner internal;
- keep databases internal;
- bind local-only services to `127.0.0.1`.

Example safe local binding:

```yaml
ports:
  - "127.0.0.1:8000:8000"
```

Never casually use:

```yaml
ports:
  - "8000:8000"
```

for internal services.

---

# 17. Phase 14 — DNS

If the team owns `distilled.news` and manages it through Cloudflare DNS, create:

```text
A  bench.distilled.news
A  faults.bench.distilled.news
```

Both point to:

```text
<VPS_PUBLIC_IPV4>
```

In Cloudflare, set both to:

```text
DNS only
```

not:

```text
Proxied
```

Reason:

Cloudflare's reverse proxy would change the controlled-failure experiment.

Wait for DNS propagation.

From your laptop:

```powershell
nslookup bench.distilled.news
nslookup faults.bench.distilled.news
```

Expected IP:

```text
<VPS_PUBLIC_IPV4>
```

From the VPS:

```bash
dig +short bench.distilled.news
dig +short faults.bench.distilled.news
```

---

# 18. Phase 15 — Create Benchmark Storage Directories

Run:

```bash
sudo mkdir -p /opt/bench
sudo chown bench:bench /opt/bench
```

Create directories:

```bash
mkdir -p \
  /opt/bench/bin \
  /opt/bench/secrets \
  /opt/bench/data/raw \
  /opt/bench/data/fetches \
  /opt/bench/data/extractions \
  /opt/bench/data/labels \
  /opt/bench/data/connectors \
  /opt/bench/data/reports \
  /opt/bench/data/logs
```

Permissions:

```bash
chmod 700 /opt/bench/secrets
```

---

# 19. Phase 16 — Clone the Distilled Repository

Do development on your laptops.

The VPS should execute a known commit, not become the primary development environment.

From `/opt/bench`:

```bash
cd /opt/bench
git clone <DISTILLED_REPO_URL> repo
```

Then:

```bash
cd repo
git status
git remote -v
git branch -a
```

Create or checkout the benchmark branch as agreed by the team, for example:

```bash
git checkout benchmark/acquisition-v1.2
```

If the branch does not yet exist, create it locally on a developer machine first and push it.

Record exact commit:

```bash
git rev-parse HEAD
```

---

# 20. Phase 17 — Create the Benchmark Code Structure

Inside the repo:

```bash
cd /opt/bench/repo
mkdir -p evaluation/acquisition-benchmark
cd evaluation/acquisition-benchmark
```

Create:

```text
evaluation/acquisition-benchmark/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── .env.example
├── config/
│   ├── benchmark.yaml
│   ├── thresholds.yaml
│   ├── domains.csv
│   ├── telegram_channels.csv
│   ├── x_accounts.csv
│   ├── discovery_queries.csv
│   └── signatures.txt
├── gold/
│   ├── LABELING_GUIDE.md
│   ├── gold_articles.jsonl
│   └── snapshots/
├── bench/
│   ├── __init__.py
│   ├── records.py
│   ├── safety.py
│   ├── validator.py
│   ├── score.py
│   ├── report.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── direct_http.py
│   │   ├── zyte_http.py
│   │   ├── brightdata_unlocker.py
│   │   └── browser_playwright.py
│   ├── extractors/
│   │   ├── __init__.py
│   │   ├── trafilatura_ex.py
│   │   ├── readability_ex.mjs
│   │   └── metadata.py
│   └── jobs/
├── connectors/
│   ├── rss_poll.py
│   ├── telegram_poll.py
│   ├── x_poll.py
│   ├── gdelt_poll.py
│   └── gnews_poll.py
└── faultsite/
    ├── app.py
    └── Caddyfile
```

Commands:

```bash
mkdir -p \
  config \
  gold/snapshots \
  bench/routes \
  bench/extractors \
  bench/jobs \
  connectors \
  faultsite
```

---

# 21. Phase 18 — Create Environment Files

Create example file in Git:

```bash
cat > .env.example <<'EOF'
ZYTE_API_KEY=
BRIGHTDATA_API_TOKEN=
BRIGHTDATA_ZONE=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
X_BEARER_TOKEN=
APIFY_TOKEN=
ANTHROPIC_API_KEY=
EOF
```

The real secrets go outside Git:

```bash
cp .env.example /opt/bench/.env
chmod 600 /opt/bench/.env
```

Edit:

```bash
nano /opt/bench/.env
```

Never commit:

```text
/opt/bench/.env
Telegram session files
API tokens
private SSH keys
```

Add to `.gitignore`:

```text
.env
*.session
*.session-journal
secrets/
data/
```

---

# 22. Phase 19 — Create `ENVIRONMENT.md`

Create:

```bash
nano /opt/bench/data/reports/ENVIRONMENT.md
```

Put:

```markdown
# Benchmark Environment

Provider: Hostinger
Plan: KVM 2
Region: Frankfurt, Germany
OS: Ubuntu 26.04 LTS
CPU: 2 vCPU
RAM: 8 GB
Disk: 100 GB
Bandwidth: 8 TB
Timezone: UTC
Public IPv4: recorded privately
Docker: <docker --version>
Docker Compose: <docker compose version>
Git commit: <git rev-parse HEAD>
Benchmark start date: <date>
```

Add:

```bash
uname -a >> /opt/bench/data/reports/ENVIRONMENT.md
```

Record Docker:

```bash
docker --version >> /opt/bench/data/reports/ENVIRONMENT.md
docker compose version >> /opt/bench/data/reports/ENVIRONMENT.md
```

---

# 23. Phase 20 — Create `DECISIONS.md`

Create:

```bash
nano /opt/bench/data/reports/DECISIONS.md
```

Include:

```markdown
# Acquisition Benchmark Decisions

## Server
Hostinger KVM 2, Frankfurt.

## CPU adjustment
Because the VPS has 2 vCPU rather than the preferred 4 vCPU:

- global benchmark concurrency = 2
- per-domain concurrency = 1
- Playwright concurrency = 1
- upgrade only if CPU saturation materially distorts the pilot

## Core website routes
1. direct_http
2. zyte_http
3. brightdata_unlocker
4. browser_playwright

## Optional routes
- zyte_browser
- provider-mediated web fetch
- Cloudflare Worker direct HTTP

## Extractors
- Trafilatura
- Mozilla Readability

## Routing decision method
1. apply hard correctness/safety gates
2. compare eligible routes
3. choose the lowest cost per correct article
4. evaluate end-to-end routing chains
5. keep browser as last resort

## Live-set uncertainty
RSS mismatch is AUTO_UNVERIFIED, not AUTO_FALSE_SUCCESS.

## Statistics
Unique URL is the primary statistical unit for domain reliability.
Repeated fetches measure temporal consistency.
```

---

# 24. Phase 21 — Benchmark Configuration

Create:

```bash
nano config/benchmark.yaml
```

Starting configuration for this **2-vCPU** server:

```yaml
version: bench-v1
timezone: UTC

limits:
  deadline_seconds: 45
  max_redirects: 5
  max_bytes_decompressed: 10485760
  retries: 0

  # 2-vCPU VPS:
  global_concurrency: 2
  per_domain_concurrency: 1
  playwright_concurrency: 1

  per_domain_min_interval_seconds: 10

headers:
  user_agent: "DistilledBenchmark/0.1 (+https://distilled.news/bot; <contact-email>)"
  accept_language: "ar,en;q=0.9,fr;q=0.8"

routes:
  direct_http:
    enabled: true

  zyte_http:
    enabled: true
    daily_budget_usd: 5

  brightdata_unlocker:
    enabled: true
    daily_budget_usd: 5

  browser_playwright:
    enabled: true
    block_resources:
      - image
      - media
      - font

  zyte_browser:
    enabled: false

  anthropic_web_fetch:
    enabled: false

  worker_direct:
    enabled: false

extractors:
  - trafilatura
  - readability

metadata_precedence:
  title:
    - jsonld.headline
    - og:title
    - extractor

  published_at:
    - jsonld.datePublished
    - article:published_time
    - extractor

  canonical_url:
    - link.canonical
    - og:url
    - resolved_url

live_set:
  max_articles_per_domain: 5
  lookback_hours: 24
  sources:
    - rss
    - news_sitemap
```

Do not blindly copy the `$5` budget values if your provider account uses a different billing model.

Set hard caps in provider dashboards too.

---

# 25. Phase 22 — Threshold Configuration

Create:

```bash
nano config/thresholds.yaml
```

Starting values:

```yaml
version: thresholds-v1

normalization:
  - nfkc
  - lowercase_latin
  - strip_arabic_diacritics
  - strip_tatweel
  - unify_alef
  - strip_punctuation
  - collapse_whitespace

labels:
  pass:
    body_f1_min: 0.90
    must_contain: all
    must_not_contain_max: 0
    title_similarity_min: 0.90
    ordered_anchors_required: true
    canonical_url: equal_after_normalization

  partial:
    body_f1_min: 0.50

  false_success:
    body_f1_below: 0.50
    must_contain_found_below: 1

validator:
  min_chars: 250
  short_news_item_min_chars: 80

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

Do not finalize these product-quality gates based on whichever provider happens to win.

The pilot can validate whether the **labeling** thresholds match humans.

The quality bars should have a documented engineering rationale.

---

# 26. Phase 23 — Build the Docker Environment

The benchmark runner should contain:

```text
Python
Playwright
Chromium
Trafilatura
httpx
feedparser
Telethon
pandas
DuckDB
PyYAML
pydantic
```

Use a pinned Playwright image.

Do not write:

```dockerfile
FROM latest
```

Pin a known working tag.

Example conceptual Dockerfile:

```dockerfile
FROM mcr.microsoft.com/playwright/python:<PINNED_VERSION>-noble

WORKDIR /app

COPY pyproject.toml /app/

RUN pip install --no-cache-dir -e .

COPY . /app/

CMD ["python", "-m", "bench"]
```

Before the experiment begins, write the exact image version into:

```text
ENVIRONMENT.md
```

---

# 27. Phase 24 — Docker Compose

Use three core services:

```text
runner
faultsite
caddy
```

Conceptual `docker-compose.yml`:

```yaml
services:
  runner:
    build: .
    working_dir: /app
    env_file:
      - /opt/bench/.env
    volumes:
      - /opt/bench/data:/data
      - /opt/bench/secrets:/secrets
    network_mode: bridge

  faultsite:
    build: .
    command: >
      uvicorn faultsite.app:app
      --host 0.0.0.0
      --port 8000
    expose:
      - "8000"

  caddy:
    image: caddy:<PINNED_VERSION>
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./faultsite/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - faultsite

volumes:
  caddy_data:
  caddy_config:
```

Do not expose `faultsite:8000` directly.

---

# 28. Phase 25 — Caddy Configuration

Create:

```bash
nano faultsite/Caddyfile
```

Use:

```caddy
faults.bench.distilled.news {
    reverse_proxy faultsite:8000
}
```

Caddy will obtain HTTPS certificates automatically if:

- DNS resolves correctly;
- ports 80/443 are open;
- no Cloudflare proxy is interfering.

Start:

```bash
docker compose up -d caddy faultsite
```

Check:

```bash
docker compose ps
```

Test:

```bash
curl -I https://faults.bench.distilled.news
```

---

# 29. Phase 26 — Create the Job Wrapper

Create:

```bash
cat > /opt/bench/bin/job <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd /opt/bench/repo/evaluation/acquisition-benchmark

name="$1"
shift

exec flock -n "/tmp/bench-$name.lock" \
  docker compose run --rm runner "$name" "$@"
EOF
```

Make executable:

```bash
chmod +x /opt/bench/bin/job
```

Purpose:

```text
prevents duplicate cron jobs
prevents overlapping benchmark runs
keeps manual and scheduled execution identical
```

---

# 30. Phase 27 — Implement Common Records First

Before implementing any provider, implement the common records.

## FetchAttempt

Store:

```text
fetchId
runId
runKind
route
acquisitionMethod
acquisitionProvider
inputUrl
domain
goldId
startedAt
finishedAt
latencyMs

transport:
  ok
  httpStatus
  resolvedUrl
  redirects
  bytes
  contentType
  errorType

cost:
  estimatedUsd
  billedUnits
  cpuSeconds

rawPayloadRef

versions:
  harness
  route
  benchmarkConfig
```

## Extraction

Store:

```text
extractionId
fetchId
extractor
extractorVersion
title
canonicalUrl
publisher
author
publishedAt
language
text
textChars

quality:
  transportSuccess
  extractionSuccess
  extractionComplete
  confidence
  validatorVersion
  validatorReasons
```

## Label

Store:

```text
extractionId
label
bodyPrecision
bodyRecall
bodyF1
mustContainFound
mustNotContainFound
orderedAnchorsOk
titleSimilarity
canonicalOk
dateOk
thresholdsVersion
```

---

# 31. Phase 28 — Implement URL Safety Before Scraping

This is mandatory.

The direct HTTP route must refuse:

```text
localhost
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
100.64.0.0/10
::1
fc00::/7
fe80::/10
```

Allow only:

```text
http
https
```

Validate:

```text
initial URL
+
every redirect
```

Do not rely on only checking the first URL.

For Playwright, also intercept every browser network request.

Prefer a second network-level restriction for the browser container so private networks are blocked even if DNS changes between validation and connection.

---

# 32. Phase 29 — Implement Direct HTTP

Use:

```text
httpx.AsyncClient
```

Requirements:

```text
total deadline      45 s
redirects           handled manually
max redirects       5
decompressed bytes  max 10 MB
retries             0 during main benchmark
UA                  benchmark UA
Accept-Language     fixed
```

Processing:

```text
validate URL
↓
DNS resolution
↓
validate resolved IP
↓
GET
↓
if redirect:
    validate next target
↓
stream response
↓
enforce decompressed-size cap
↓
save returned bytes
↓
record metadata
```

The route must never classify:

```text
HTTP 200
```

as sufficient proof of success.

---

# 33. Phase 30 — Implement Zyte HTTP

Create adapter:

```text
bench/routes/zyte_http.py
```

It must return the same `FetchAttempt` format as direct HTTP.

Use the provider's current documented raw-response mechanism.

Record:

```text
provider request ID
provider response status
target HTTP status
returned content
billing units if available
provider error category
```

Do not merge browser-rendered Zyte mode into ordinary Zyte HTTP.

If browser-rendered mode is tested later:

```text
zyte_http
```

and:

```text
zyte_browser
```

must be two separate route names.

---

# 34. Phase 31 — Implement Bright Data Web Unlocker

Create:

```text
bench/routes/brightdata_unlocker.py
```

Use a Web Unlocker zone.

Record:

```text
target URL
provider request ID if available
response status
provider error
raw returned HTML
latency
billing
```

Do not let provider-specific fields leak into downstream benchmark logic.

Convert them to the common `FetchAttempt`.

---

# 35. Phase 32 — Implement Playwright

Use one fresh browser context per attempt.

Because the server has 2 vCPU:

```text
Playwright concurrency = 1
```

Block:

```text
images
fonts
media
```

Do not block scripts.

Flow:

```text
create context
↓
install request interception
↓
reject unsafe/private destinations
↓
goto URL
↓
wait DOMContentLoaded
↓
wait max 5 s for article content / bounded quiet condition
↓
hard stop at 45 s
↓
page.content()
↓
save HTML
↓
close context
```

Never use unbounded:

```text
networkidle
```

Record:

```text
CPU time
wall latency
peak memory if practical
```

This makes self-hosted-browser cost estimable.

---

# 36. Phase 33 — Implement Extractors

Every raw HTML response should be processed offline by:

```text
Trafilatura
Mozilla Readability
```

Do not re-fetch the page just to test another extractor.

This is important:

```text
fetch once
↓
save raw
↓
extract many
```

That gives reproducibility and prevents extraction testing from changing acquisition cost.

---

# 37. Phase 34 — Metadata Extraction

Use fixed metadata precedence.

Title:

```text
JSON-LD headline
→ OpenGraph title
→ extractor title
```

Published time:

```text
JSON-LD datePublished
→ article:published_time
→ extractor date
```

Canonical URL:

```text
<link rel="canonical">
→ og:url
→ final resolved URL
```

Language:

```text
<html lang>
→ text language detector
```

Record disagreements for analysis.

---

# 38. Phase 35 — Production-Style Validator

The validator must decide whether extraction succeeded **without seeing the gold answer**.

Minimum conditions:

```text
transport is 2xx
HTML-like content
body is sufficiently long
not a known error/challenge page
title exists
language detected
```

Suggested initial rules:

```text
normal article:
  body >= 250 chars

short NewsArticle:
  body >= 80 chars
```

`extractionComplete` additionally checks that:

```text
the text does not end in obvious truncation
no "read more" truncation markers
no obvious article continuation omitted
```

The key metric is:

```text
how often the validator is fooled
```

That becomes:

```text
FALSE_SUCCESS rate
```

---

# 39. Phase 36 — Error Signatures

Create:

```bash
nano config/signatures.txt
```

Start with:

```text
page not found
404 not found
the page you requested
الصفحة غير موجودة
خطأ 404
page introuvable

access denied
please enable javascript
you need to enable javascript
enable cookies

just a moment...
attention required
verify you are human
are you a robot
captcha
cf-chl
px-captcha
datadome
```

During the pilot:

- extend the list only when you find real false-success examples;
- document every addition;
- freeze before the final run.

---

# 40. Phase 37 — Build the Controlled Fault Website

Implement these endpoints:

```text
/ok/en
/ok/ar
/slow?s=60
/drip
/status/429
/status/503
/redirect-loop
/redirect-chain/8
/redirect-private
/huge
/gzip-bomb
/malformed
/no-metadata
/js-only
/js-never
/cookie-overlay
/cookie-gate
/soft-404
/error-200
/layout/v1
/layout/v2
/charset/1256-header
/charset/1256-meta-only
/charset/wrong-header
/paginated/1
/liveblog
/amp
/canonical-elsewhere
```

For the gzip test, do **not** create a 2 GB expansion.

Use approximately:

```text
20–30 MB decompressed
```

because the benchmark limit is 10 MB.

That is enough to prove the cap works safely.

---

# 41. Phase 38 — Pick Real Domains

Select approximately:

```text
16–20 domains
```

that Distilled.news actually expects to use.

Representative categories:

```text
Lebanese publishers
regional Arabic publishers
international publishers
French/multilingual publishers
JavaScript-heavy publishers
simple server-rendered publishers
```

Potential candidates for review:

```text
National News Agency Lebanon
Naharnet
L'Orient Today / L'Orient-Le Jour
Annahar
Al Akhbar
LBCI
Al Jadeed
MTV Lebanon
The961
Al Jazeera Arabic
Al Jazeera English
BBC Arabic
Asharq Al-Awsat
Arab News
The National
Reuters
AP News
```

These are candidates only.

For each domain record:

```text
domain
languages
rss_url
news_sitemap_url
robots_allows_articles
robots_checked_on
crawl_delay_s
terms_notes
paywall
js_required
include
reviewer
```

Exclude pages that require:

```text
login bypass
hard paywall bypass
CAPTCHA solving
private access
```

---

# 42. Phase 39 — Build the Gold Dataset

Use:

```text
45 unique articles
```

The category numbers are **coverage quotas**, not counts that must add to exactly 45.

One article may satisfy more than one category.

Ensure coverage of:

```text
English
Arabic
French
JS-heavy
redirect/canonical cases
difficult-but-permitted
short news
multi-page
legacy Arabic encoding
```

Avoid using constantly changing live blogs as ordinary static gold articles.

Each gold record stores:

```text
goldId
inputUrl
domain
categories
canonicalUrl
publisher
title
author
publishedAt
publishedAtPrecision
language
body
mustContain
mustNotContain
minBodyChars
jsRequired
snapshot
labeledBy
labeledAt
```

---

# 43. Phase 40 — Gold Labelling Rules

For every gold article:

## Title

Use:

```text
visible article headline
```

not:

```text
HTML <title> including site name
```

## Canonical URL

Prefer:

```text
<link rel="canonical">
```

Otherwise:

```text
final URL after redirects
```

and remove tracking parameters.

## Published time

Use:

```text
visible dateline
```

with JSON-LD as a cross-check.

## Body

Include:

```text
article paragraphs
subheadings inside article
quotes inside article
```

Exclude:

```text
headline
author line
dateline
photo captions
related links
share buttons
ads
newsletter boxes
comments
site footer
```

## `mustContain`

Use three exact anchors:

```text
first sentence
middle sentence
last-paragraph sentence
```

## `mustNotContain`

Use obvious non-article strings:

```text
menu item
related articles heading
cookie text
footer text
```

Also enforce:

```text
mustContain[0]
appears before
mustContain[1]
appears before
mustContain[2]
```

This adds order sensitivity.

---

# 44. Phase 41 — Save Gold Snapshots

Each gold item should have a frozen snapshot.

Store:

```text
MHTML
or
PDF
or
saved HTML
```

Use:

```text
gold/snapshots/
```

If the live page changes during the experiment:

```text
compare current page
against snapshot
```

If the publisher genuinely changed the article:

```text
SOURCE_CHANGED
```

Do not incorrectly punish the scraper.

---

# 45. Phase 42 — Double-Label a Sample

Have two teammates independently label at least:

```text
10 gold articles
```

Compare:

```text
body agreement
headline agreement
date agreement
canonical agreement
```

If labels disagree substantially, fix the labeling guide before the final run.

Do not hide annotation disagreement.

It belongs in the FYP methodology.

---

# 46. Phase 43 — Scoring

Normalize before text comparison:

```text
Unicode NFKC
lowercase Latin
remove Arabic diacritics
remove tatweel
normalize alef forms
strip punctuation
collapse whitespace
```

Compute:

```text
token precision
token recall
token F1
ordered anchor check
```

Optional extra:

```text
ROUGE-L / token LCS
```

Use token F1 for content coverage/boilerplate and anchor order for sequence integrity.

---

# 47. Phase 44 — Labels

Apply in order.

## BLOCKED_CORRECTLY

Expected safety refusal.

## FAIL

Transport failed or validator correctly rejected the page.

## FALSE_SUCCESS

The route claimed usable success but:

```text
gold body F1 < threshold
or
block/error page returned
or
none of required anchors present
```

## PARTIAL

Usable content but incomplete or metadata incorrect.

## PASS

All important criteria pass.

For live pages without gold:

```text
AUTO_PASS
AUTO_UNVERIFIED
AUTO_FAIL
```

Do not use live RSS mismatch alone to establish `FALSE_SUCCESS`.

---

# 48. Phase 45 — Pilot Dataset

Pilot uses:

```text
5 gold URLs
```

Choose:

```text
1 English
1 Arabic
1 French
1 JS-heavy
1 redirect/canonical case
```

Run:

```text
5 URLs
× 4 routes
× 2 repetitions
= 40 fetches
```

Because each HTML fetch goes through two extractors:

```text
40 fetches
× 2 extractors
= up to 80 extraction records
```

---

# 49. Phase 46 — Run the Pilot

Build:

```bash
cd /opt/bench/repo/evaluation/acquisition-benchmark
docker compose build
```

Start controlled site:

```bash
docker compose up -d caddy faultsite
```

Check providers:

```bash
/opt/bench/bin/job check-keys
```

Run pilot:

```bash
/opt/bench/bin/job gold --subset pilot --repeat 2
```

Extract:

```bash
/opt/bench/bin/job extract --date today
```

Score:

```bash
/opt/bench/bin/job score --date today
```

Report:

```bash
/opt/bench/bin/job report --date today
```

---

# 50. Phase 47 — Manually Inspect Every Pilot Result

Check every fetch:

```text
raw payload exists
file decompresses
byte count is plausible
redirect count is correct
final URL is correct
latency is plausible
provider cost is logged
errors are classified correctly
```

Check every extraction:

```text
title
body
date
canonical
language
article completeness
```

Check every label.

Target scorer agreement:

```text
>= 95%
```

If 80 extraction labels exist:

```text
>= 76 / 80
```

should agree with manual judgment.

---

# 51. Phase 48 — Decide Whether 2 vCPU Is Enough

During the pilot run:

```bash
htop
```

Also inspect Docker:

```bash
docker stats
```

Watch:

```text
CPU %
RAM
swap
Playwright runtime
job overlap
load average
```

Upgrade only if you observe something like:

```text
CPU pinned near 100% for long periods
Playwright jobs queue excessively
p95 latency clearly dominated by local CPU
jobs miss schedule windows
```

If not, keep the current VPS.

If CPU is the only bottleneck, a 4-vCPU upgrade before the seven-day final run is reasonable.

---

# 52. Phase 49 — Freeze the Experiment

After fixing pilot bugs:

```bash
git status
git add .
git commit -m "Freeze acquisition benchmark harness v1"
git tag acquisition-bench-v1
```

Freeze:

```text
code commit
thresholds.yaml
benchmark.yaml
extractor versions
route versions
gold labels
```

During the final run:

```text
no threshold tuning
no provider-specific logic changes
no extractor changes
```

If a serious harness bug appears:

1. stop affected measurements;
2. document it in `INCIDENTS.md`;
3. fix it;
4. rerun or extend the affected period.

---

# 53. Phase 50 — Full Website Experiment

Use:

```text
45 gold URLs
4 core routes
3 runs/day
7 days
```

Gold fetches:

```text
45 × 4 × 3 × 7
= 3,780
```

Live set:

```text
up to 5 new URLs/domain/day
```

If using 18 domains:

```text
18 × 5 × 4 × 7
= 2,520
```

Approximate core total:

```text
6,300 fetches
```

Remember:

- the 21 repeated fetches of one gold URL measure temporal stability;
- they do not count as 21 independent article examples.

---

# 54. Phase 51 — Schedule

Use UTC.

Suggested:

```text
00:30  gold
06:00  live
08:30  gold
16:30  gold
23:00  extract + score
23:30  report
```

The exact hours matter less than consistency.

---

# 55. Phase 52 — Cron

Edit:

```bash
crontab -e
```

Example:

```cron
30 0,8,16 * * * /opt/bench/bin/job gold >> /opt/bench/data/logs/gold.log 2>&1
0 6 * * * /opt/bench/bin/job live >> /opt/bench/data/logs/live.log 2>&1
0 23 * * * /opt/bench/bin/job extract --date today >> /opt/bench/data/logs/extract.log 2>&1 && /opt/bench/bin/job score --date today >> /opt/bench/data/logs/score.log 2>&1
30 23 * * * /opt/bench/bin/job report --date today >> /opt/bench/data/logs/report.log 2>&1
```

Optional:

use healthchecks.io or another dead-man monitor so you are alerted if a scheduled job fails to run.

---

# 56. Phase 53 — Daily Operator Checklist

Every day:

```text
[ ] scheduled jobs ran
[ ] disk < 70%
[ ] route counts expected
[ ] provider spend below caps
[ ] no route accidentally at 0%
[ ] live human sample done
[ ] no secret appeared in logs
[ ] no fault site outage
[ ] no unexpected CPU saturation
```

Commands:

```bash
df -h
du -sh /opt/bench/data/*
docker compose ps
tail -n 100 /opt/bench/data/logs/gold.log
```

---

# 57. Phase 54 — Human Check on Live Set

Each day sample approximately:

```text
20 live results
```

Have a human inspect:

```text
article identity
title
body completeness
wrong page?
block page?
date?
```

Compare human judgment with:

```text
AUTO_PASS
AUTO_UNVERIFIED
AUTO_FAIL
```

Report agreement.

Do not trust live automatic scoring until human agreement is acceptable.

---

# 58. Phase 55 — Controlled Fault Tests

Run the fault suite:

```bash
/opt/bench/bin/job faults
```

Test:

```text
slow response
drip response
429
503
redirect loop
redirect chain
private redirect
oversized response
compressed expansion
malformed HTML
missing metadata
JS-only page
endless JS activity
cookie overlay
cookie gate
soft 404
fake access-denied 200
layout changes
wrong encoding
pagination
canonical behavior
```

Every safety mismatch is a benchmark bug.

Do not trust the main run until:

```text
private-IP guard works
deadline works
size cap works
redirect cap works
```

---

# 59. Phase 56 — Provider Failure Tests

Mock:

```text
provider unavailable
provider timeout
provider 5xx
bad API key
quota exhausted
soft-error returned as success
```

Production-style retry policy:

```text
retry transient only
no retries on permanent auth/client errors
max 3 total attempts
all attempts fit inside request deadline
```

The main benchmark still uses:

```text
0 retries
```

so route quality remains measurable.

Retry behavior is evaluated separately.

---

# 60. Phase 57 — Billing Reconciliation

Every night compare:

```text
our request logs
vs
provider dashboard
```

Record:

```text
requests submitted
requests billed
failed requests billed
timeouts billed
quota units
actual spend
```

Compute:

```text
billedOnFailureRate
```

This matters because:

```text
cheap/request
```

is not the same as:

```text
cheap/correct article
```

---

# 61. Phase 58 — Real-Site Rate Testing

Do **not** deliberately push real publishers until they block you.

The useful question is:

> Is acquisition reliable at the polling rate Distilled actually intends to use?

For real publishers:

```text
test expected production rate
+
one modest higher-load scenario if permitted
```

Use the controlled fault site for aggressive request-rate experiments.

Do not run stress-style traffic against third-party publishers without explicit permission.

---

# 62. Phase 59 — RSS Experiment

Test:

```text
RSS 2.0
Atom
RDF
malformed XML
BOM
wrong encoding
HTML entities
missing dates
```

Measure:

```text
item recall
GUID stability
duplicate rate
ETag support
Last-Modified support
full-text vs excerpt
appearance latency
checkpoint correctness
```

Key optimization:

```text
RSS supplies full article
→ AcquiredContent from supplied payload
→ no website fetch
```

---

# 63. Phase 60 — RSS Checkpoint Safety

Correct:

```text
fetch
↓
persist accepted items
↓
durable commit
↓
advance checkpoint
```

Never:

```text
fetch
↓
advance checkpoint
↓
persistence fails
```

Kill the connector intentionally between fetch and storage.

Restart it.

Expected:

```text
0 lost items
0 duplicate canonical items
```

---

# 64. Phase 61 — Telegram Experiment

Use:

```text
Telegram MTProto
+
Telethon
```

Use a dedicated benchmark account if possible.

Do not store the Telegram session in Git.

Store it:

```text
/opt/bench/secrets/
```

Permissions:

```bash
chmod 600 /opt/bench/secrets/*
```

---

# 65. Phase 62 — Telegram Controlled Channel

Create a public channel owned by the team.

Publish known content:

```text
Arabic text
English text
French text
links
emoji
photos
albums
video
document
forwards
reply
edits
deletions
long message
pinned message
```

Gold checks:

```text
resolve channel
history backfill
message IDs
incremental retrieval
edit_date behavior
deletion detection
album grouping
replay idempotency
crash safety
original t.me link
```

The controlled channel provides the strongest ground truth.

---

# 66. Phase 63 — Telegram Real Channels

Test approximately:

```text
15–20 public channels
```

Compare:

```text
Telethon
vs
current t.me/s parser
```

Poll on a staggered schedule.

Do not fire requests to all channels simultaneously.

Record:

```text
relative recall
freshness
text completeness
media completeness
FloodWait
errors
```

Treat message-ID gaps as an investigation signal.

A gap by itself is not proof that your connector missed a retrievable message.

---

# 67. Phase 64 — X Experiment

Compare:

```text
official X API
Bright Data X
current Apify baseline
```

Use:

```text
same accounts
same observation window
same definitions
```

Do not compare generic webpage scraping with platform API retrieval as if they are equivalent.

---

# 68. Phase 65 — X Controlled Account

Use a team-controlled account.

Create known posts:

```text
short post
long post
image
quote
reply
repost
edit if supported
deletion
```

Important:

the deletion test must be:

```text
post
↓
connector observes it
↓
delete post
↓
later explicit lookup confirms unavailable
```

If you delete before the hourly poll ever sees it, absence does not prove deletion handling.

For edits:

```text
each edit may have a new post ID
```

Preserve edit history relationships.

---

# 69. Phase 66 — GDELT Experiment

Use GDELT for discovery, not article-body acquisition.

Measure:

```text
unique URLs not found by RSS
freshness/lag
Arabic-source coverage
relevance
duplicate overlap
publisher attribution
outage isolation
```

For Arabic-source coverage, use:

```text
English concept query
+
sourcelang:arabic
```

Do not assume that `sourcelang:arabic` means the search query itself is being executed as native Arabic full-text search.

Use small overlapping windows so late-arriving items are not missed.

---

# 70. Phase 67 — Google News RSS Baseline

Run the same discovery topics through Google News RSS.

Measure:

```text
redirect resolution success
429 rate
overlap with RSS
overlap with GDELT
unique useful URLs
freshness
```

Keep:

```text
publisher
```

as evidence source.

Keep:

```text
Google News
```

as discovery provider.

---

# 71. Phase 68 — Optional Discovery Providers

Only after:

```text
RSS
website acquisition
Telegram
X
GDELT
```

are measured should you consider:

```text
MediaStack
NewsData
SearchAPI
another WebDiscoveryProvider
```

For each additional provider ask:

> What important, unique evidence did this provider add?

Measure:

```text
unique useful articles
duplicate percentage
freshness
Arabic coverage
French coverage
cost per unique useful article
```

Do not buy an API merely because it returns many results.

---

# 72. Phase 69 — Route Statistics

Per:

```text
domain
× route
× extractor
```

compute:

```text
successRate
usableRate
completenessRate
falseSuccessRate
blockRate
p50LatencyMs
p95LatencyMs
estimatedCostPerRequest
costPerSuccessfulArticle
billedOnFailureRate
consistency
sampleCount
```

For domain reliability:

```text
unique URLs
```

are the main sample unit.

For repeated gold URLs, separately report:

```text
temporal consistency
label flips
blocking over time
```

---

# 73. Phase 70 — Statistical Reporting

Do not present repeated fetches of the same URL as independent Bernoulli trials.

Recommended:

## Domain quality

Aggregate each unique URL to a route-level outcome.

Then compute confidence intervals across unique URLs.

## Temporal stability

For each:

```text
gold URL × route
```

report:

```text
median body F1
variance
label flips
block changes
latency distribution
```

## Alternative

Use:

```text
cluster bootstrap
```

with:

```text
cluster = URL
```

for route-level confidence intervals.

Document the method in the final report.

---

# 74. Phase 71 — Route Eligibility

A route is eliminated immediately if it:

```text
loses publisher identity
modifies/invents content
cannot respect deadline
cannot respect cost cap
reaches prohibited targets
requires bypassing access controls
has unacceptable false success
```

Then apply measurable quality bars.

Example starting requirements:

```text
PASS rate >= 0.80
usable lower CI >= 0.85
FALSE_SUCCESS <= 0.01
FALSE_SUCCESS on gold = 0
p95 <= 30 seconds
```

These values must be documented and frozen.

---

# 75. Phase 72 — Cost Decision

Among eligible routes choose:

```text
lowest cost per correct article
```

If two are approximately tied:

```text
choose lower p95 latency
```

Do not use an arbitrary weighted score as the primary decision.

---

# 76. Phase 73 — Evaluate Routing Chains

This is mandatory.

For each domain evaluate:

```text
Policy A:
direct only

Policy B:
direct → Zyte

Policy C:
direct → Bright Data

Policy D:
direct → Playwright

Policy E:
direct → best managed fallback → Playwright
```

Calculate:

```text
final PASS rate
final usable rate
final false-success rate
cost per correct article
p50 end-to-end latency
p95 end-to-end latency
fallback activation %
browser activation %
```

The winner is a **policy**, not necessarily an individual provider.

---

# 77. Phase 74 — Conditional Rescue Rate

For each fallback calculate:

```text
P(fallback succeeds | direct HTTP failed)
```

This is more informative than only:

```text
overall fallback success
```

Example:

```text
Zyte overall = 98%
Bright Data overall = 97%
```

but:

```text
Zyte rescues direct failures = 70%
Bright Data rescues direct failures = 95%
```

Then Bright Data may be the better fallback.

---

# 78. Phase 75 — Browser Decision

Browser should remain:

```text
last resort
```

unless measurements prove a specific domain should go directly to browser.

Possible outcomes:

```text
site A:
direct

site B:
direct → managed fallback

site C:
managed fallback directly

site D:
browser directly

site E:
drop / unsupported
```

This is exactly what the routing table should capture.

---

# 79. Phase 76 — Final Cost Model

Do not estimate acquisition cost as:

```text
users × pages
```

Distilled shares public acquisition.

Model:

```text
unique upstream resources
× polling frequency
× candidate rate
× dedup savings
× route distribution
```

Then add:

```text
managed provider cost
browser host cost
API discovery cost
social connector cost
storage
AI inference
```

Public acquisition should be reused across users within the permitted access scope.

---

# 80. Phase 77 — Backups

Hostinger weekly backup is useful, but keep a second copy of experiment data.

From a teammate machine with WSL/Linux/macOS:

```bash
rsync -az \
  bench@<VPS_IP>:/opt/bench/data/ \
  ./distilled-bench-data/
```

Do not use:

```text
--delete
```

for the safety backup.

Never copy secrets into the ordinary data backup.

Take a VPS snapshot:

```text
before final seven-day run
after final seven-day run
```

if the provider supports snapshots.

---

# 81. Phase 78 — Storage Monitoring

Daily:

```bash
df -h
du -sh /opt/bench/data/*
```

Keep:

```text
disk usage < 70%
```

Compress raw bodies:

```text
.zst
```

Do not retain raw captures indefinitely.

Suggested research TTL:

```text
90 days after benchmark
```

unless the team decides another retention period.

---

# 82. Phase 79 — Security Checklist

Before final run:

```text
[ ] root SSH disabled
[ ] password SSH disabled
[ ] SSH key works
[ ] UFW enabled
[ ] fail2ban enabled
[ ] unattended upgrades enabled
[ ] secrets chmod 600
[ ] Telegram session chmod 600
[ ] no secrets in Git
[ ] provider spend caps set
[ ] Docker internal ports not public
[ ] private-IP checks working
[ ] browser private-network protection working
[ ] HTTPS works for fault site
```

---

# 83. Phase 80 — Benchmark Readiness Checklist

Do not start the seven-day run until:

```text
[ ] all four core routes run
[ ] common records are complete
[ ] raw payloads saved
[ ] both extractors work
[ ] validator works
[ ] controlled fault site works
[ ] safety tests pass
[ ] pilot scorer agreement >= 95%
[ ] provider billing is visible
[ ] 45 gold URLs frozen
[ ] 10 double-labelled
[ ] thresholds frozen
[ ] benchmark config frozen
[ ] Git tag created
[ ] disk and CPU verified
[ ] backup works
```

---

# 84. Phase 81 — Suggested Team Split

## Student 1 — Infrastructure + Website Routes

Owns:

```text
VPS
Docker
direct HTTP
Zyte
Bright Data
Playwright
fault site
cron
billing
```

## Student 2 — Evaluation

Owns:

```text
domains
gold labels
extractors
scoring
human checks
statistics
route analysis
routing-policy analysis
```

## Student 3 — Connectors

Owns:

```text
RSS
Telegram
X
GDELT
Google News
discovery comparisons
```

Everyone reviews the final routing policy.

---

# 85. Phase 82 — Recommended Five-Week Execution

## Week 1

```text
server hardening
Docker
DNS
repository
benchmark skeleton
domain review
gold labeling starts
Telegram controlled-channel setup
RSS connector setup
```

## Week 2

```text
four website routes implemented
fault site implemented
extractors implemented
validator implemented
pilot
fix pilot bugs
freeze thresholds
```

## Week 3

```text
full seven-day website run
daily live articles
Telegram/RSS side-by-side run
X run
GDELT run
daily human checks
```

## Week 4

```text
fault suite
provider failure suite
billing reconciliation
statistics
routing-chain analysis
connector analysis
```

## Week 5

```text
final acquisition report
routing_policy.yaml
cost report
integration into Acquisition Router v1
canary jobs
M0 replay dataset export
```

---

# 86. Phase 83 — Final Deliverables to Show the Professor

At the end, prepare:

## 1. Environment table

```text
VPS
region
CPU
RAM
disk
benchmark duration
```

## 2. Website route table

Example:

| Domain | Direct | Zyte | Bright Data | Browser | Selected policy |
|---|---:|---:|---:|---:|---|
| A | 99% | 100% | 100% | 100% | Direct |
| B | 60% | 99% | 98% | 100% | Direct → Zyte |
| C | 0% | 75% | 80% | 100% | Browser |

## 3. Cost table

```text
cost/request
cost/correct article
billed-on-failure
fallback activation %
browser activation %
```

## 4. Robustness table

```text
timeouts
429
503
redirect loops
JS-only
soft 404
wrong encoding
oversized body
provider outage
```

## 5. Connector table

```text
RSS
Telegram
X
GDELT
Google News
```

## 6. Final routing policy

```yaml
acq-router-v1
```

## 7. Evidence-based recommendation

For example:

```text
Direct HTTP is used by default.
Provider X is selected as the managed fallback because it rescues
the largest fraction of direct-HTTP failures at the lowest cost.
Browser rendering remains restricted to measured JS-heavy domains.
Telethon is selected for Telegram.
Provider Y is selected for X.
GDELT remains broad discovery.
Additional paid discovery APIs are not justified unless they add
measurable unique coverage.
```

---

# 87. What You Should Do Right Now

Starting from the Hostinger screen you currently have, the immediate sequence is:

```text
1. Copy the VPS public IPv4 privately.
2. Generate an SSH key on your Windows laptop.
3. SSH into root once.
4. Create user `bench`.
5. Confirm SSH key login as `bench`.
6. Disable root/password SSH.
7. Update Ubuntu.
8. Install firewall/fail2ban/tools.
9. Set UTC.
10. Add 4 GB swap.
11. Install Docker.
12. Create DNS records:
       bench.distilled.news
       faults.bench.distilled.news
13. Create /opt/bench.
14. Clone the repository.
15. Create the benchmark branch/folder.
16. Create ENVIRONMENT.md and DECISIONS.md.
17. Implement common records + safety layer.
18. Implement direct HTTP.
19. Implement the controlled fault site.
20. Implement Trafilatura + Readability.
21. Implement Zyte.
22. Implement Bright Data.
23. Implement Playwright.
24. Build the 5-URL pilot.
25. Run the pilot.
26. Decide whether the 2-vCPU VPS is enough.
27. Freeze configuration.
28. Build the 45-article gold set.
29. Start the seven-day website benchmark.
30. Run RSS/Telegram/X/GDELT in parallel.
31. Analyze individual routes.
32. Analyze direct→fallback routing chains.
33. Produce acq-router-v1.
34. Integrate only the measured winners.
```

---

# 88. Stop Conditions

Stop the benchmark immediately if:

```text
provider spend exceeds cap
private-IP guard fails
fault-site safety test fails
wrong content is repeatedly marked PASS
disk exceeds safe level
secrets appear in logs
Playwright makes private-network requests
provider credentials are exposed
server is compromised
```

Fix the issue, document it, and only then restart.

---

# 89. Final Principle

Do not optimize for:

```text
most integrations
most APIs
most scrapers
```

Optimize for:

```text
correctness
reliability
provenance
measured coverage
cost per correct article
low false-success rate
graceful fallback
reproducibility
```

The final engineering result is not:

> "Zyte is best."

It is:

> "For each source/domain category, Distilled has a measured routing policy that retrieves correct evidence with the lowest justified cost while respecting reliability, safety, latency, and provenance constraints."

That is the result the Acquisition Router needs and the result worth presenting as an FYP engineering contribution.
