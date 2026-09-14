# Distilled.news external acquisition testing: A to Z

**Prepared:** 2026-09-14. **Revised:** 2026-09-14 for decision readiness: two separately scored browser variants, references matched to each collection window, reconciled cost per usable result including server cost, process-tree resource measurement with automatic capacity stops, the `server-check` command, and an expanded `faults` smoke gate.  
**Audience:** Someone starting on a Windows laptop with access to the university VPS.  
**Scope:** External acquisition experiments, from first SSH login to a backed-up final report.  
**Implementation:** The current repository's [acquisition benchmark](../evaluation/acquisition-benchmark/README.md).  
**Status:** Commands and configuration are based on the implemented CLI. Local offline verification does not establish that a particular VPS, account, provider, or live source works; `server-check` and the Stage 1 pilot establish that.

> **Before declaring any winner** the campaign must have: both browser variants measured or explicitly unavailable (Section 9.1), a source reference for every scored collection window (Sections 8.5 and 12.3), reconciled provider bills plus a configured server cost (Section 15.5), process-tree resource evidence from the VPS (Section 14.2), and a passing `server-check` and small pilot on the real server (Sections 6.4 and 10). A report missing any of these can support a supervised pilot, not a provider decision.

## Contents

1. [What we are doing](#1-what-we-are-doing)
2. [What you need before starting](#2-what-you-need-before-starting)
3. [Connect from Windows and inspect the VPS](#3-connect-from-windows-and-inspect-the-vps)
4. [Prepare the benchmark account and server](#4-prepare-the-benchmark-account-and-server)
5. [Copy the correct code and install dependencies](#5-copy-the-correct-code-and-install-dependencies)
6. [Run offline checks and verify the browser](#6-run-offline-checks-and-verify-the-browser)
7. [Configure accounts, credentials, and budgets](#7-configure-accounts-credentials-and-budgets)
8. [Build experiment configurations and reference data](#8-build-experiment-configurations-and-reference-data)
9. [Every source and candidate, in every stage](#9-every-source-and-candidate-in-every-stage)
10. [Stage 1: small pilots](#10-stage-1-small-pilots)
11. [Stage 2: controlled comparison](#11-stage-2-controlled-comparison)
12. [Stage 3: seven-day live testing](#12-stage-3-seven-day-live-testing)
13. [Fallback experiments](#13-fallback-experiments)
14. [Daily operations, stop, and recovery](#14-daily-operations-stop-and-recovery)
15. [Billing, scoring, and provider decisions](#15-billing-scoring-and-provider-decisions)
16. [Back up, restore, and download results](#16-back-up-restore-and-download-results)
17. [Final report and completion checklist](#17-final-report-and-completion-checklist)
18. [Troubleshooting](#18-troubleshooting)
19. [Command reference and implementation boundaries](#19-command-reference-and-implementation-boundaries)

## 1. What we are doing

We will compare acquisition methods on matching inputs, inspect their outputs against independent references, and choose a primary method and tested fallback for each source/task.

The external benchmark runs on the VPS. It uses local SQLite and saved evidence. It does not need Cloudflare production credentials, deploy the website, write to production D1/R2, or call an LLM.

| Task | Example | Correct output |
|---|---|---|
| Article acquisition | A publisher article URL | Correct body, title, identity, and applicable dates |
| Feed/social collection | A Telegram channel or X account | Original post IDs, text, dates, references, and available media |
| Discovery | A Google News query | Relevant original article links with honest metadata and coverage |

An article link is not a full article. A successful API response is not proof of complete collection. An extractor cannot recover text that the fetched page never contained.

~~~text
Define matching inputs and independent references
  -> collect through each candidate
  -> save original responses and provider job identifiers
  -> extract articles / normalize source records
  -> compare with checked references
  -> report quality, failures, timing, resources, and costs
  -> test repetition and recovery
  -> decide, or report insufficient evidence
~~~

| Phase | Purpose | Exit artifact |
|---|---|---|
| Preparation | Working VPS, code, accounts, controls, and references | Environment record, access/budget register, offline checks |
| Stage 1 | Small matched runs, repeated twice, every result inspected | Pilot report and corrections |
| Stage 2 | Larger independent dataset and controlled faults | Quality/recovery report and frozen configuration |
| Stage 3 | Seven-day repeated and new-content collection | Live reliability/cost report and fallback evidence |
| Closeout | Reconcile, back up, and justify decisions | Final source decisions and verified evidence backup |

### 1.1 Use the repository benchmark, not the ZIP's environment

The reviewed evaluation.zip contains a separate benchmark with different commands, schemas, and dependencies. Do not extract it over this checkout or copy its Windows virtual environment to Linux.

This guide uses **preflight**, **plan**, **run**, **process**, and **schedule**. The ZIP's **check**, **demo**, **reextract**, and **--data** interface is different.

GDELT, automatic robots.txt checks, incremental polling improvements, and Docker packaging are possible additions. They are not silently enabled by following this guide. GDELT's optional experiment is described in Section 9.10.

### 1.2 How to read the commands

- **Windows PowerShell** means your laptop, before or outside SSH.
- **VPS administrator** means the initial server account with administrative access.
- **VPS benchmark account** means the dedicated Linux user created below.
- Commands containing **REPLACE** require your real values.
- Run one block at a time. Resolve failures before dependent steps.
- Save Markdown/JSON as UTF-8. In nano: Ctrl+O, Enter to save; Ctrl+X to exit.
- Installation commands download software. Commands labelled **LIVE** may contact publishers or billable providers.

## 2. What you need before starting

### 2.1 Required handoff

| Value | Where it comes from | Needed when |
|---|---|---|
| VPS hostname/IP | Professor/provider | First connection |
| SSH port | Private handoff; commonly 22, but verify | First connection |
| SSH username and password/key | Private handoff | First connection |
| SSH host fingerprint | Provider console or trusted handoff | Verify first connection |
| Repository clone access | Existing Git account/team access | Copy code |
| Exact benchmark commit | Local checkout/team decision | Freeze code |
| Reviewed sources/queries | Intended news workload | Pilot |
| Allowed spending | Account owner/project budget | Before paid candidates |
| Monthly VPS cost | Provider invoice or university cost owner | Before any live run; required by preflight |
| Private backup destination | Laptop or agreed storage | Before unattended runs |

You can prepare the environment and run the synthetic demo before obtaining paid accounts. The project notes describe a two-core, 8 GB VPS; verify the actual machine. Confirm access and funding cover the experiment.

### 2.2 Account needs

| Candidate family | External values |
|---|---|
| Direct HTTP, RSS, public Telegram | Reviewed public targets; no provider API key |
| Browser, isolated variant | Chromium and unprivileged Linux user/network namespace support |
| Browser, standard variant | Chromium and an administrator-applied outbound egress firewall for the benchmark user (Section 4.5) |
| Zyte | API key and confirmed account billing limits |
| Bright Data Unlocker | API token and specific Web Unlocker zone |
| Bright Data social | Token, dataset/product ID, supported async request schema |
| Apify | Token, actor/task access, build/input schema, charge bounds |
| Official X | Bearer token and endpoint/history access |
| Telethon | Telegram API ID/hash and authorized session |
| Official LinkedIn | Token, authorized read access, author URN, API version |

An unavailable candidate is recorded as not tested, not as a measured failure.

## 3. Connect from Windows and inspect the VPS

### 3.1 Connect

**Windows PowerShell:**

~~~powershell
$BenchServer = Read-Host "VPS IP or hostname"
$BenchSshUser = Read-Host "SSH username from the handoff"
$BenchSshPort = Read-Host "SSH port, usually 22"
ssh -p $BenchSshPort "$BenchSshUser@$BenchServer"
~~~

Compare the displayed fingerprint with the trusted handoff before accepting it. Password input is invisible while typing; that is normal. Enter passwords at the prompt, not inside the command.

With an existing private key, add **-i 'C:\path\to\your\key'** to the command.

### 3.2 Inspect without changing anything

**VPS administrator:**

~~~bash
whoami
cat /etc/os-release
uname -m
nproc
free -h
df -h /
timedatectl status
python3 --version
node --version
npm --version
git --version
sudo ss -lntp
sudo ufw status verbose
getent passwd distilled-bench
~~~

“Command not found” identifies missing software. Record OS, architecture, CPU, available memory, free disk, clock status, existing services, and whether the benchmark account exists.

Preserve services and access on a shared VPS. The benchmark needs outbound networking; it needs no public dashboard port.

**Checkpoint:** You can log in and know the machine's actual configuration.

## 4. Prepare the benchmark account and server

### 4.1 Create a dedicated user

This guide consistently uses **distilled-bench**. Substitute an existing suitable account throughout if applicable.

**VPS administrator, only if the account does not exist:**

~~~bash
sudo adduser distilled-bench
sudo usermod -aG sudo distilled-bench
~~~

The main procedure uses the account's home directory and tmux. The repository's optional systemd template uses different /opt and /var/lib paths; do not install it unchanged against this layout.

### 4.2 Set up SSH keys

Keep the original administrative session open while testing the new login.

**Second Windows PowerShell window:**

~~~powershell
$BenchKey = Join-Path $env:USERPROFILE ".ssh\distilled_bench"
if (-not (Test-Path -LiteralPath $BenchKey)) {
    ssh-keygen -t ed25519 -f $BenchKey
}
Get-Content -LiteralPath "$BenchKey.pub"
~~~

Use a passphrase. Copy the displayed **public** key.

**VPS administrator:**

~~~bash
sudo install -d -m 700 -o distilled-bench -g distilled-bench /home/distilled-bench/.ssh
sudo touch /home/distilled-bench/.ssh/authorized_keys
sudo nano /home/distilled-bench/.ssh/authorized_keys
sudo chown distilled-bench:distilled-bench /home/distilled-bench/.ssh/authorized_keys
sudo chmod 600 /home/distilled-bench/.ssh/authorized_keys
~~~

Append the public key on its own line, preserving existing keys.

**Windows PowerShell:**

~~~powershell
$BenchServer = Read-Host "VPS IP or hostname"
$BenchSshPort = Read-Host "SSH port"
$BenchKey = Join-Path $env:USERPROFILE ".ssh\distilled_bench"
ssh -p $BenchSshPort -i $BenchKey "distilled-bench@$BenchServer"
~~~

**New VPS session:**

~~~bash
whoami
sudo -v
~~~

Both should work before closing the original administrator session. See Ubuntu's [OpenSSH server guide](https://ubuntu.com/server/docs/how-to/security/openssh-server/) for SSH key configuration.

### 4.3 Install utilities and establish time

**VPS benchmark account:**

~~~bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq nano less tmux htop sysstat \
  python3 python3-venv build-essential pkg-config xz-utils unzip util-linux
timedatectl status
~~~

Use explicit UTC windows. On a dedicated VPS you can set its display timezone:

~~~bash
sudo timedatectl set-timezone UTC
~~~

On a shared server, retain its timezone if required. Resolve clock synchronization problems before measuring freshness. Perform agreed OS updates/reboots during preparation and record them.

### 4.4 Firewall

Keep an existing managed firewall policy. On a fresh server where you are responsible for UFW, allow the actual SSH port and other required services before enabling it:

~~~bash
read -r -p "Actual SSH TCP port: " BENCH_SSH_PORT
sudo ufw allow "$BENCH_SSH_PORT/tcp"
sudo ufw status verbose
sudo ufw enable
~~~

Test another SSH connection. An inbound firewall does not enforce scraper outbound address restrictions; Section 4.5 adds those.

### 4.5 Outbound egress firewall for the benchmark user

**Why:** The standard browser variant (Section 9.1) lets Chromium make its own connections, like an ordinary scraper. A public page can redirect it, or change DNS, towards a private address such as the provider's metadata service at 169.254.169.254. The benchmark checks each request's host, but that check does not cover redirects or DNS changes. This host rule is the actual boundary. It also adds defence in depth for every other route, because all benchmark processes run as the same user.

Skip this section only if you will leave **browser_standard** disabled. The configuration refuses to enable that route in live mode until **host_egress_firewall_confirmed** is true, and you should set that only after the checks below pass.

**VPS administrator.** First confirm which DNS resolver the benchmark user relies on:

~~~bash
grep '^nameserver' /etc/resolv.conf
resolvectl status 2>/dev/null | grep -i 'DNS Servers' || true
~~~

The rules below allow the systemd-resolved stub at **127.0.0.53**. If **/etc/resolv.conf** names a different resolver inside a private range, add an accept line for that exact address and port 53 before the reject lines, or DNS will fail for the benchmark.

Create the rules file:

~~~bash
sudo tee /etc/distilled-bench-egress.nft >/dev/null <<'EOF'
add table inet distilled_bench_egress
flush table inet distilled_bench_egress
table inet distilled_bench_egress {
  chain output {
    type filter hook output priority 0; policy accept;
    meta skuid != "distilled-bench" accept
    ip daddr 127.0.0.53 udp dport 53 accept
    ip daddr 127.0.0.53 tcp dport 53 accept
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4 } counter reject
    ip6 daddr { ::1/128, ::ffff:0:0/96, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32 } counter reject
  }
}
EOF
sudo nft -c -f /etc/distilled-bench-egress.nft
sudo nft -f /etc/distilled-bench-egress.nft
sudo nft list table inet distilled_bench_egress
~~~

The rules apply only to sockets owned by **distilled-bench**; other users and services are unaffected. They live in their own table, so they do not replace UFW's rules. Do not put them in Ubuntu's default **/etc/nftables.conf**: that file begins with **flush ruleset**, which would also remove UFW's rules whenever nftables starts.

Load them at boot with a dedicated unit:

~~~bash
sudo tee /etc/systemd/system/distilled-bench-egress.service >/dev/null <<'EOF'
[Unit]
Description=Outbound private-address block for the distilled-bench user
After=network-pre.target ufw.service
Before=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/nft -f /etc/distilled-bench-egress.nft
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now distilled-bench-egress.service
~~~

**Verify as the benchmark user.** These requests target a documentation-only address and a public site; nothing is sent to a real private service:

~~~bash
curl -sS -m 5 -o /dev/null http://192.0.2.1/ ; echo "blocked-address exit code: $?"
curl -sS -m 10 -o /dev/null -w 'public HTTP status: %{http_code}\n' https://example.com/
getent hosts example.com
sudo nft list table inet distilled_bench_egress | grep counter
~~~

Expected: the first command fails **immediately** with "Connection refused" (exit code 7), not after a 5-second timeout; the public request returns an HTTP status; DNS resolves; and the IPv4 reject counter has increased. A timeout instead of a refusal means the rule did not match. Repeat the first command as your administrator account: it should time out or fail normally rather than being refused, confirming the rule is scoped to the benchmark user.

Reboot once during preparation and repeat the verification. Record the rules file hash (`sha256sum /etc/distilled-bench-egress.nft`) in **reports/ENVIRONMENT.md**. Only then set **host_egress_firewall_confirmed: true** on the standard browser route.

## 5. Copy the correct code and install dependencies

### 5.1 Record the local commit

**Windows PowerShell, inside the repository:**

~~~powershell
git status --short
git rev-parse HEAD
~~~

A clone cannot include uncommitted local changes. Transfer required changes through the team's normal Git workflow before selecting the experiment commit.

### 5.2 Clone on the VPS

**VPS benchmark account:**

~~~bash
mkdir -p /home/distilled-bench/work
cd /home/distilled-bench/work
read -r -p "Repository clone URL, without embedded credentials: " BENCH_REPO_URL
git clone "$BENCH_REPO_URL" distilled.news
cd /home/distilled-bench/work/distilled.news
read -r -p "Exact benchmark commit hash: " BENCH_COMMIT
git checkout --detach "$BENCH_COMMIT"
git status --short
git rev-parse HEAD
test -f evaluation/acquisition-benchmark/bench/cli.py
test -f packages/connectors/src/telegram.ts
~~~

Use existing Git authentication for private repositories. Inspect an existing destination instead of cloning over it. The entire repository is required because the Node bridge imports the actual TypeScript connectors.

### 5.3 Establish paths

~~~bash
export BENCH_REPO=/home/distilled-bench/work/distilled.news
export BENCH_PACKAGE="$BENCH_REPO/evaluation/acquisition-benchmark"
export BENCH_CAMPAIGN=/home/distilled-bench/benchmark-campaign
export BENCH_SECRETS=/home/distilled-bench/.config/distilled-benchmark
umask 077
mkdir -p "$BENCH_CAMPAIGN"/{config,gold,reference-snapshots,data,offline,daily,reports,logs,backups}
mkdir -p "$BENCH_SECRETS"
chmod 700 "$BENCH_CAMPAIGN" "$BENCH_SECRETS"
cat > "$BENCH_CAMPAIGN/environment.sh" <<'EOF'
export BENCH_REPO=/home/distilled-bench/work/distilled.news
export BENCH_PACKAGE="$BENCH_REPO/evaluation/acquisition-benchmark"
export BENCH_CAMPAIGN=/home/distilled-bench/benchmark-campaign
export BENCH_SECRETS=/home/distilled-bench/.config/distilled-benchmark
export PLAYWRIGHT_BROWSERS_PATH=/home/distilled-bench/benchmark-campaign/browsers
export PATH="/home/distilled-bench/.local/node24/bin:$PATH"
umask 077
EOF
source "$BENCH_CAMPAIGN/environment.sh"
~~~

On every new server session:

~~~bash
source /home/distilled-bench/benchmark-campaign/environment.sh
cd "$BENCH_PACKAGE"
~~~

| Path under campaign | Contents |
|---|---|
| config | Local nonsecret experiment configurations |
| gold | Independently checked references |
| reference-snapshots | Dated source evidence for labelling |
| data | Shared live SQLite ledger, blobs, per-run reports |
| offline | Synthetic runs, separate from live evidence/budgets |
| reports | Human reports, environment records, billing notes |
| logs | Console and resource logs |
| daily | Reviewed new article target lists |
| backups | Local staging, also copied off the VPS |

API credentials and Telegram sessions remain under **BENCH_SECRETS**, outside this evidence tree.

### 5.4 Install isolated Python

The package requires Python 3.12+. Use Python 3.12 initially and record its patch version. Keep Ubuntu's system Python intact.

~~~bash
python3 -m venv /home/distilled-bench/.local/share/benchmark-bootstrap
/home/distilled-bench/.local/share/benchmark-bootstrap/bin/python -m pip install uv
/home/distilled-bench/.local/share/benchmark-bootstrap/bin/uv --version
/home/distilled-bench/.local/share/benchmark-bootstrap/bin/uv python install 3.12
cd "$BENCH_PACKAGE"
/home/distilled-bench/.local/share/benchmark-bootstrap/bin/uv venv --python 3.12 --seed .venv
source .venv/bin/activate
python --version
~~~

Inspect an existing .venv before reusing/replacing it; do not replace an active experiment's environment. uv's [Python installation](https://docs.astral.sh/uv/guides/install-python/) and [environment](https://docs.astral.sh/uv/pip/environments/) interfaces provide the isolated interpreter.

### 5.5 Install Node 24

The parser bridge requires **Node 24+**. If an approved Node 24 is already on PATH, record the exact version and skip this download. Otherwise install a verified archive under the benchmark user's home:

~~~bash
mkdir -p "$BENCH_CAMPAIGN/downloads"
cd "$BENCH_CAMPAIGN/downloads"
BENCH_NODE_BASE=https://nodejs.org/download/release/latest-v24.x
curl --fail --location "$BENCH_NODE_BASE/SHASUMS256.txt" -o SHASUMS256.txt || exit 1
BENCH_NODE_ARCH=$(uname -m)
case "$BENCH_NODE_ARCH" in
  x86_64) BENCH_NODE_ARCH=x64 ;;
  aarch64) BENCH_NODE_ARCH=arm64 ;;
  *) echo "Choose a supported Node build for this architecture"; exit 1 ;;
esac
BENCH_NODE_FILE=$(awk -v arch="$BENCH_NODE_ARCH" '$2 ~ ("-linux-" arch "\\.tar\\.xz$") {print $2}' SHASUMS256.txt)
test -n "$BENCH_NODE_FILE" || exit 1
test "$(printf '%s\n' "$BENCH_NODE_FILE" | wc -l)" -eq 1 || exit 1
curl --fail --location "$BENCH_NODE_BASE/$BENCH_NODE_FILE" -o "$BENCH_NODE_FILE" || exit 1
if ! awk -v file="$BENCH_NODE_FILE" '$2 == file' SHASUMS256.txt | sha256sum -c -; then
  echo "Checksum verification failed; do not extract this archive"
  exit 1
fi
mkdir -p /home/distilled-bench/.local/node24
tar -xJf "$BENCH_NODE_FILE" --strip-components=1 -C /home/distilled-bench/.local/node24
source "$BENCH_CAMPAIGN/environment.sh"
node --version
npm --version
~~~

The [official Node 24 directory](https://nodejs.org/download/release/latest-v24.x/) supplies binaries and checksums. Record the filename and retain the manifest. If the release changes between downloads, repeat download/check before extraction. Freeze the installed version during measurement.

### 5.6 Install package dependencies

~~~bash
cd "$BENCH_PACKAGE"
source .venv/bin/activate
python -m pip install -c constraints.txt -e '.[dev,sources,extract,browser]'
python -m pip check
npm ci --prefix node --ignore-scripts --no-audit --no-fund
~~~

The committed Python constraints were verified locally on a different platform/interpreter; VPS installation still needs validation. Preserve any dependency error, resolve it deliberately, rerun checks, and record the change. Do not silently discard all pins.

The frontend does not need building for this benchmark. The connector source tree and benchmark Node dependencies are required.

### 5.7 Install Chromium

~~~bash
sudo "$BENCH_PACKAGE/.venv/bin/python" -m playwright install-deps chromium
PLAYWRIGHT_BROWSERS_PATH="$BENCH_CAMPAIGN/browsers" python -m playwright install chromium
~~~

Install the browser itself as the benchmark user. Playwright's [browser documentation](https://playwright.dev/python/docs/browsers) explains browser/OS dependencies. Check compatibility for the installed Playwright version and actual OS; do not assume current documentation establishes support for an older pin.

## 6. Run offline checks and verify the browser

### 6.1 Test suite

~~~bash
cd "$BENCH_PACKAGE"
source .venv/bin/activate
python -m pytest --junitxml="$BENCH_CAMPAIGN/reports/offline-tests.xml"
~~~

The repository suite passed 185 tests locally on Windows on 2026-09-14. The count can change with the commit; record the VPS result. This suite is the **complete offline gate**: provider envelopes, pagination, recovery, the real parser bridge, window-matched scoring, cost reporting and capacity stops. Resolve every failure before trusting the environment.

### 6.2 Synthetic end-to-end experiment

Create a separate offline configuration with resolved fixture/reference paths:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
package = Path(os.environ["BENCH_PACKAGE"])
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = load(package / "configs/offline-demo.json")
config["data_dir"] = str(campaign / "offline")
path = campaign / "config/offline.json"
path.write_text(json.dumps(config, indent=2), encoding="utf-8")
print(path)
PY
python -m bench preflight --config "$BENCH_CAMPAIGN/config/offline.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/offline.json" \
  --output "$BENCH_CAMPAIGN/reports/offline-plan.json"
python -m bench run --config "$BENCH_CAMPAIGN/config/offline.json" --run-id offline-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/offline" --run-id offline-001
less "$BENCH_CAMPAIGN/offline/reports/offline-001/report.md"
~~~

At the reviewed commit the demo has 22 route/target combinations, including both browser variants. Both real extractors and the application parsers should execute on saved synthetic data. These are not provider-performance results. Its report shows **SERVER_COST_NOT_CONFIGURED** because the demo deliberately sets no server price.

Use a new ID for a new experiment. Recover an interrupted run with **resume**, then **process**, using the original ID.

### 6.3 Fault checks

~~~bash
python -m bench faults --output "$BENCH_CAMPAIGN/reports/offline-faults.json"
~~~

This is a fast **smoke gate** of 21 mocked cases: unsafe literal and IPv6 addresses, stalled bodies, redirect loops, redirects to private addresses, oversized and compressed-expansion bodies, 401/403/404/429/503 classification with Retry-After, HTTP 200 challenge pages, the short-news rule, and the feed root gate (HTML refused, DOCTYPE feeds accepted, entity declarations refused). It must report **passed: true**.

It does not replace Section 6.1: run the full pytest suite before and after each stage. Neither command exposes a public fault site or tests how managed providers handle real target faults.

### 6.4 Check the real server

Run this once after installation, again after any OS update or reboot, and before each stage:

~~~bash
python -m bench server-check --config "$BENCH_CAMPAIGN/config/offline.json" \
  | tee "$BENCH_CAMPAIGN/reports/server-check-offline.json"
~~~

After Section 8 produces live configurations, rerun it against each one, e.g. **config/stage1.json**. The command sends **no acquisition requests**. It checks, and reports READY, NOT_READY or WARNING for:

| Check | Why it matters |
|---|---|
| linux, python_3_12_plus, node_24_plus, readability_installed | The actual runtime and the parser bridge |
| data_dir_writable, free_disk_above_reserve | Evidence can be written; dispatch would otherwise stop |
| host_memory_readable, available_memory_above_limit | The automatic capacity stop can work |
| process_tree_measurement | Chromium and Node memory/CPU will appear in reports |
| clock_synchronized (warning only) | Publication-age and window timing |
| credentials_file_private, telegram_session_private | Secret files are mode 600-style private |
| server_cost_configured (live configs) | Cost per usable result can include the server |
| user_network_namespace, chromium_launch_isolated | The isolated browser can start (only when enabled) |
| chromium_launch_standard, host_egress_firewall_confirmed | The standard browser can start and its firewall is recorded (only when enabled) |

Chromium launch checks render inline HTML only. Exit code 1 means at least one NOT_READY check.

**If user_network_namespace is NOT_READY:** Ubuntu 24.04 and later restrict unprivileged user namespaces through AppArmor, so this failure is expected on a default install. Choose one of these and record the decision:

1. Leave **browser** (isolated) disabled and report it as not tested on this host. Use **browser_standard** behind the Section 4.5 firewall. This is the recommended default.
2. Ask the administrator to allow namespaces for the benchmark's Chromium only, for example through a dedicated AppArmor profile. Do not disable the restriction system-wide for the whole server.

Do not remove the isolation code to make the isolated variant "pass": that would silently turn it into the standard variant.

The two variants answer different questions. **browser** (isolated) blocks cookies set by responses and all non-GET requests, and its traffic goes through the benchmark's pinned HTTP client. **browser_standard** behaves like ordinary scraping: cookies within one fresh context, all request methods, Chromium's own networking. Both block images, media, fonts, service workers and WebSockets. A page that works only in the standard variant tells you the isolated restrictions, not the browser approach, caused the failure.

### 6.5 Freeze environment evidence

~~~bash
git -C "$BENCH_REPO" rev-parse HEAD > "$BENCH_CAMPAIGN/reports/commit.txt"
git -C "$BENCH_REPO" status --short > "$BENCH_CAMPAIGN/reports/worktree-status.txt"
python --version > "$BENCH_CAMPAIGN/reports/python-version.txt"
python -m pip freeze > "$BENCH_CAMPAIGN/reports/python-freeze.txt"
node --version > "$BENCH_CAMPAIGN/reports/node-version.txt"
npm ls --prefix node --all --json > "$BENCH_CAMPAIGN/reports/node-dependencies.json"
uname -a > "$BENCH_CAMPAIGN/reports/kernel.txt"
cp /etc/os-release "$BENCH_CAMPAIGN/reports/os-release.txt"
~~~

Add CPU, RAM, disk, clock, egress location if known, browser revision, dependency changes, and a server alias to **reports/ENVIRONMENT.md**.

Also save the server-check JSON and, when using the standard browser, the egress rules hash from Section 4.5.

**Checkpoint:** The full test suite and fault smoke gate pass, offline processing works, `server-check` results are saved, each browser variant is either ready or has a recorded not-tested reason, and environment evidence is saved.

## 7. Configure accounts, credentials, and budgets

### 7.1 Store secrets separately

~~~bash
cp "$BENCH_PACKAGE/credentials.env.example" "$BENCH_SECRETS/credentials.env"
chmod 600 "$BENCH_SECRETS/credentials.env"
nano "$BENCH_SECRETS/credentials.env"
~~~

Fill only needed values:

~~~dotenv
APIFY_TOKEN=
ZYTE_API_KEY=
BRIGHTDATA_API_TOKEN=
BRIGHTDATA_UNLOCKER_ZONE=
X_BEARER_TOKEN=
LINKEDIN_ACCESS_TOKEN=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_PATH=/home/distilled-bench/.config/distilled-benchmark/telegram.session
~~~

Use the benchmark names, including **APIFY_TOKEN**. The application's environment names differ.

The CLI reads KEY=VALUE files itself. Do not source the credentials file as shell code. Environment variables take precedence; check names without exposing values:

~~~bash
python - <<'PY'
import os
names = ["APIFY_TOKEN", "ZYTE_API_KEY", "BRIGHTDATA_API_TOKEN",
         "X_BEARER_TOKEN", "LINKEDIN_ACCESS_TOKEN", "TELEGRAM_API_ID",
         "TELEGRAM_API_HASH", "TELEGRAM_SESSION_PATH"]
print("Existing overrides:", [name for name in names if name in os.environ])
PY
~~~

### 7.2 Complete account setup

| Service | Dashboard preparation | Record privately |
|---|---|---|
| Zyte | Confirm HTTP-response access and charge bounds | Product/access/limit |
| Bright Data Unlocker | Create/select correct zone | Zone and charge bound |
| Bright Data social | Select discovery product and generated async request | Dataset/input/query/output schema |
| Apify | Inspect actual actor/task, schema, build, access | Actor/task/build/input/billing evidence |
| X | Confirm project access for timeline and search separately | History and endpoint/record limits |
| Telegram | Obtain API credentials and authorize session | Session owner/location/recovery |
| LinkedIn | Confirm authorized read access and supported version | Eligible authors, URNs, permissions |

Current Bright Data product pages can display a different interface from the benchmark's implemented **/datasets/v3/trigger -> progress -> snapshot** protocol. Use an account-generated request compatible with that async flow. If only another interface is available, record an adapter gap; a dataset ID change cannot alter the hardcoded protocol.

Do not infer prices/access from actor names. Keep dated account-specific evidence.

### 7.3 Authorize Telethon once

After filling Telegram's three values:

~~~bash
cd "$BENCH_PACKAGE"
source .venv/bin/activate
python -m bench telegram-login --credentials-file "$BENCH_SECRETS/credentials.env"
~~~

Complete phone/code/two-step-password prompts interactively. Preserve session sidecars privately. This command sends no test posts. See [Telethon sign-in](https://docs.telethon.dev/en/stable/basic/signing-in.html).

### 7.4 Bound spending

Create **reports/ACCESS_AND_BUDGET.md**:

| Route | Access | Product/build | Whole-job ceiling | Stage allocation | External limit | Pricing evidence/date |
|---|---|---|---:|---:|---|---|
| Actual ID | Ready / unavailable / budget disabled | Actual choice | Fill | Fill | Fill | Fill |

Configuration fields:

- **budget.total_usd:** cumulative allowance in the shared data directory.
- **budget.providers:** cumulative allowance for each provider key.
- **route.cost_ceiling_usd:** conservative bound for the whole attempt/job.
- **route.cost_bound_confirmed:** true only after checking the external bound.
- **costs.server_monthly_usd:** the VPS's actual monthly price, from the invoice or cost owner. Live preflight refuses to run without it. Use **0** only when the server genuinely costs the project nothing, and say so in the report.

Why the server cost is mandatory: direct HTTP, RSS, public Telegram and the local browser have no provider fee, so without it they look free and would win any cost comparison. The report charges each attempt for the share of the server it actually occupied (Section 15.5).

For source jobs, include lookup, submission, polling, pages, downloads, and billable failures. Reservations occur before dispatch.

The ledger is not an external billing cap. The Apify adapter sends timeout/maxItems, but does not forward the local dollar ceiling as a universal monetary cap. Verify account/product enforcement separately. Consult [Apify run parameters](https://docs.apify.com/api/v2/actors-runs-post) and [dataset pagination](https://docs.apify.com/api/v2/dataset-items-get).

The current validator requires a positive ceiling even for an authorized API with no direct marginal charge. Document a nominal conservative bound and reconcile confirmed zero charges; do not disguise the adapter type.

Template Apify routes share provider key **apify**; Bright Data routes share **brightdata**. Per-actor/stage allocations remain reviewed accounting entries unless provider keys are deliberately split and concurrency implications documented.

Different data directories have different ledgers. Use one live **campaign/data** directory and a separate synthetic directory. Lowering a later configuration's budget does not reset prior spend.

**Checkpoint:** Enabled paid candidates have confirmed access, schema, and spending bounds. Missing candidates stay disabled with explicit reasons.

## 8. Build experiment configurations and reference data

### 8.1 Start from the implemented template

~~~bash
cp "$BENCH_PACKAGE/configs/stage1-pilot.json" "$BENCH_CAMPAIGN/config/stage1.json"
nano "$BENCH_CAMPAIGN/config/stage1.json"
~~~

Set these top-level fields using your actual paths:

~~~json
{
  "version": 1,
  "mode": "live",
  "data_dir": "/home/distilled-bench/benchmark-campaign/data",
  "credentials_file": "/home/distilled-bench/.config/distilled-benchmark/credentials.env",
  "repetitions": 2,
  "seed": 20260914,
  "limits": {
    "concurrency": 2,
    "attempt_seconds": 45,
    "job_seconds": 600,
    "max_bytes": 10485760,
    "max_job_bytes": 52428800,
    "max_pages": 3,
    "max_items": 20,
    "redirects": 5,
    "domain_interval_seconds": 10,
    "poll_seconds": 10,
    "min_free_disk_bytes": 21474836480,
    "min_available_memory_bytes": 1073741824,
    "max_host_cpu_fraction": 0.9,
    "pressure_seconds": 300
  },
  "budget": {"total_usd": 0, "providers": {}},
  "costs": {"server_monthly_usd": "REPLACE with the actual monthly VPS price as a number"},
  "extractors": ["trafilatura", "readability"]
}
~~~

This is a **fragment**, not a full config: retain/edit the template's routes and targets. Replace the costs placeholder with a number such as **12.5**; a string is rejected. Twenty items is a small pilot cap; the package default is 50. Raise caps deliberately for complete controlled windows. The 20 GiB disk reserve must fit the actual VPS.

| Setting | Meaning |
|---|---|
| concurrency | One or two active jobs overall; one browser at most |
| attempt_seconds | Website acquisition deadline; ordinary local capacity wait recorded separately |
| job_seconds | Bounded source collection job and its remote lifecycle |
| max_bytes / max_job_bytes | Decoded response and total evidence bounds |
| max_pages / max_items | Local pagination/output bounds; not universal remote billing limits |
| domain_interval_seconds | Minimum interval between top-level domain starts in a live runner |
| min_available_memory_bytes / max_host_cpu_fraction / pressure_seconds | Capacity stop: if available memory stays below the limit, or host CPU stays above the fraction, for this many seconds, the live runner stops new dispatch for the run and its schedule (Section 14.2) |
| costs.server_monthly_usd | Monthly VPS price used to allocate server cost to each attempt |
| poll_seconds | Polling a managed job's status; not source refresh cadence |
| repetitions | How many comparisons per target/candidate within one run |
| seed | Reproducible order; do not tune evaluation order after seeing results |

There is no configuration setting here for an automatic daily dollar cap, automatic robots checks, or universal per-source polling intervals. Do not copy such fields from the ZIP and assume the CLI enforces them.

### 8.2 Route and target basics

A route says **how** to collect. A target says **what** to collect.

~~~json
{
  "id": "telegram_api",
  "adapter": "telethon",
  "enabled": false,
  "provider": "telethon",
  "cost_ceiling_usd": 0,
  "cost_bound_confirmed": false,
  "settings": {}
}
~~~

~~~json
{
  "id": "telegram_channel_01",
  "kind": "telegram",
  "input": "REPLACE_CHANNEL",
  "routes": ["telegram_public", "telegram_api"],
  "language": "ar",
  "reference": "/home/distilled-bench/benchmark-campaign/gold/telegram_channel_01.json",
  "options": {
    "start_time": "2026-09-13T00:00:00Z",
    "end_time": "2026-09-14T00:00:00Z"
  }
}
~~~

Replace example dates with the chosen window. Target IDs must be unique and use letters, digits, underscores, or hyphens. Keep IDs stable when comparing candidates.

All routes begin disabled. Enable only prepared candidates. Keep untested candidates visible in the access register. A preflight with zero enabled routes can be ready; that does not mean an experiment will collect anything.

Paid-route setup requires a positive route ceiling and matching provider/campaign budgets. Set their values from your confirmed bounds, not from example numbers.

### 8.3 Template substitution and time-window limits

Only **whole-string** placeholders are expanded:

~~~json
{"targetUrls": ["{input}"], "fromDate": "{start_time}", "toDate": "{end_time}"}
~~~

This fragment illustrates substitution, not a universal actor schema. Use date field names that the selected actor actually supports.

The string **"prefix {input}"** is not expanded. If a provider needs a combined query string, construct and save that complete string in a target option, then refer to it as **"{provider_query}"**.

Crucially:

- Official X and Telethon adapters use their supported target window fields.
- RSS/public Telegram collect available snapshots; windows help evaluate what was returned.
- Google News RSS's current adapter does not turn start/end options into a search date filter.
- Managed actor windows must appear in the actor's own input schema. Target start/end options alone do not insert remote filters.
- LinkedIn's official collector retrieves bounded pages and relies on evaluation filtering; do not assume a complete historical window was obtained.
- Scheduled rolling windows change only start_time/end_time options. Other actor-specific date strings remain unchanged unless they explicitly use those placeholders.

Record unsupported filtering, result caps, and scope differences instead of claiming perfectly matched collection.

### 8.4 Article references

For each article, inspect the publisher page independently and save:

- Full title and body in correct paragraph order.
- Three distinctive passages from the beginning, middle, and end.
- Original/final URLs and canonical-link evidence.
- Publication date and its precision; distinguish update dates.
- Language, reviewer, observation time, and a private dated snapshot.
- Known unwanted boilerplate strings if applicable.

Example shape:

~~~json
{
  "title": "REPLACE with independently checked title",
  "body": "REPLACE with complete independently checked article text",
  "published_at": "2026-09-13T09:00:00Z",
  "date_precision": "minute",
  "anchors": ["REPLACE first passage", "REPLACE middle passage", "REPLACE final passage"],
  "must_not_contain": ["REPLACE an actual unwanted boilerplate passage"],
  "accepted_urls": ["https://publisher.example/REPLACE_article"],
  "reviewer": "REPLACE reviewer",
  "observed_at": "2026-09-14T10:00:00Z"
}
~~~

Use **published_at: null** when independently confirmed absent, and **date_precision: "day"** for date-only evidence. Use **source_changed: true** only when an independently checked page revision explains the mismatch.

Do not generate references by copying an extractor's output. That would reward it for agreeing with itself. Double-label ten Stage 2 articles independently and resolve disagreements.

The scorer checks the resolved article URL against accepted_urls. Extracted canonical_url metadata remains inspectable, but a PASS does not independently certify that every canonical-link field is correct; include it in manual metadata review.

### 8.5 Source references and event ledger

Example source reference:

~~~json
{
  "complete_window": true,
  "window": {
    "start_time": "2026-09-13T00:00:00Z",
    "end_time": "2026-09-14T00:00:00Z"
  },
  "items": [
    {
      "id": "123",
      "aliases": ["REPLACE_equivalent_native_identifier_if_needed"],
      "text": "REPLACE independently checked full text",
      "published_at": "2026-09-13T09:00:00Z",
      "url": "https://t.me/REPLACE_CHANNEL/123",
      "has_media": false,
      "links": []
    }
  ]
}
~~~

Remove aliases when not needed. Equivalent IDs can differ between collectors; aliases must be unique, disjoint from canonical IDs, and tied to the same independently verified original post.

Only set **complete_window: true** if the expected list actually covers the whole eligible window. Otherwise use false: the report can show sample coverage, while total recall remains unknown.

**A complete reference is complete only for its own window.** Whenever **complete_window** is true and the target has **options.start_time/end_time**, the reference must carry a **window** with the same two instants. Equivalent timezone offsets match (09:00+03:00 equals 06:00Z). The scorer enforces this:

| Reference | Result |
|---|---|
| window equals the target's collection window | Recall and quality PASS/PARTIAL/FAIL can be computed |
| window missing | **reference_window_missing**: treated as a sample; recall is unknown and no quality PASS |
| window differs, e.g. yesterday's list | **reference_window_mismatch**: same downgrade, so yesterday's posts are not counted as today's misses |

`validate-gold` rejects mismatched complete references before a run. Scheduled runs move the window every round, so each round needs its own reference (Section 12.3).

An ID-only list verifies coverage, not text quality. Include explicit text and published_at for quality scoring. Media-only reference items use **text: ""** and **has_media: true**. Independently undated items use **published_at: null**.

Keep a CSV event ledger:

~~~csv
source_id,item_id,event_type,source_event_time_utc,observed_time_utc,expected_text,expected_media,reference_url,reviewer
~~~

Event types can include published, edited, deleted, outage_started, and collector_restarted. Use existing authorized observations or synthetic replay. Publishing test posts requires the owner's separate authorization; these collection commands do not send posts.

Missing from the latest page is not proof of deletion. A union of provider outputs is not proof that every expected item has been found.

### 8.6 Nonbillable configuration checks

~~~bash
python -m bench preflight --config "$BENCH_CAMPAIGN/config/stage1.json" \
  > "$BENCH_CAMPAIGN/reports/stage1-preflight.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/stage1.json" \
  --output "$BENCH_CAMPAIGN/reports/stage1-plan.json"
jq '{ready, enabled_routes, checks}' "$BENCH_CAMPAIGN/reports/stage1-preflight.json"
jq '{planned_jobs, planned_maximum_usd}' "$BENCH_CAMPAIGN/reports/stage1-plan.json"
~~~

Both commands are local and nonbillable. They do not prove API permissions, connectivity, valid remote schemas, or account billing enforcement. Preflight checks all enabled routes, even if the eventual command selects only articles or only sources.

Live preflight also reports NOT_READY for:

- **server_cost**: **costs.server_monthly_usd** is missing.
- **reference_window**: a schedule with **rolling_window_hours** still points a source target at a fixed complete reference.
- **browser**: the isolated variant is enabled but namespaces are unavailable. Run `server-check`; the standard variant does not need namespaces.

Loading a config fails outright if **browser_standard** is enabled in live mode without **host_egress_firewall_confirmed: true**.

Plan includes disabled jobs for accounting. Inspect enabled flags and target lists, not only planned_jobs. Its monetary total excludes unknown external overages and local server costs.

### 8.7 Split a master config by source family

After editing the master Stage 1 configuration, this local helper creates one config per family. It resolves paths before writing, retains route definitions for later discovery, and disables routes unused by that family.

~~~bash
python - <<'PY'
import copy, json, os
from pathlib import Path
from bench.config import load
campaign = Path(os.environ["BENCH_CAMPAIGN"])
master = load(campaign / "config/stage1.json")
families = {
    "web": "article", "rss": "rss", "google": "google_news",
    "telegram": "telegram", "x-profile": "x_profile", "x-search": "x_search",
    "linkedin-company": "linkedin_company", "linkedin-profile": "linkedin_profile",
    "generic": "apify",
}
for name, kind in families.items():
    config = copy.deepcopy(master)
    config["targets"] = [t for t in config["targets"] if t["kind"] == kind]
    if not config["targets"]:
        continue
    used = {route for target in config["targets"] for route in target["routes"]}
    for route in config["routes"]:
        route["enabled"] = route["enabled"] and route["id"] in used
    config.pop("targets_by_round", None)
    config.pop("schedule", None)
    path = campaign / "config" / ("pilot-" + name + ".json")
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print(path)
PY
~~~

Do not rerun this over configurations whose manually edited settings you want to preserve. The official LinkedIn subset can share the company file but must remain a separately labelled target/cohort.

## 9. Every source and candidate, in every stage

All sizes/cadences below are starting designs. Freeze the actual workload after checking pilot quality, capacity, and cost. One target collection may involve multiple HTTP calls, pages, and billed operations.

### 9.1 News and article websites

**Question:** Which fetch route plus extractor returns the correct full article?

| Route ID | Adapter | Setup |
|---|---|---|
| direct | direct_http | Reviewed URLs and VPS HTTP access |
| zyte | zyte_http | ZYTE_API_KEY and paid-route bounds |
| unlocker | brightdata_unlocker | Token plus settings.zone or BRIGHTDATA_UNLOCKER_ZONE |
| browser | browser_playwright, settings.network = isolated | Namespaces available (server-check user_network_namespace READY) |
| browser_standard | browser_playwright, settings.network = standard | Section 4.5 firewall verified, then settings.host_egress_firewall_confirmed = true |

Use identical URLs. Run **trafilatura** and **readability** on the same saved response from each route. Fetch once, extract twice; do not count two extractor rows as two paid fetches.

**Two browser variants, scored separately.** Do not merge their results into one "browser" row.

| | browser (isolated) | browser_standard |
|---|---|---|
| Network | None of its own; permitted GETs fulfilled by the pinned benchmark HTTP client | Chromium's own networking |
| Cookies | Response cookies stripped | Kept within one fresh context per attempt |
| Request methods | GET only; POST/GraphQL APIs are aborted | All methods |
| Private-address protection | Pinned connection-time address checks | Per-request host check plus the host egress firewall |
| Blocked | Images, media, fonts, service workers, WebSockets, downloads | Same |
| Bytes measured | Every fulfilled body | Completed request sizes; one oversized response can exceed the limit before detection |
| Reports | coverage.network = isolated | coverage.network = standard |

The isolated variant can fail where ordinary scraping succeeds, for example on pages that load the article body through a POST request or need a consent cookie. Treat "fails in isolated, passes in standard" as evidence about the isolation restrictions. Only failure in **both** says something about the browser approach. If only one variant can run on this VPS, report the other as not tested and state which question remains open.

Zyte's HTTP variant returns target content inside a provider response; the adapter preserves envelope/body evidence separately. Unlocker can leave the true target HTTP status unknown. Do not treat a provider-level success as proof of target success. See [Zyte HTTP response fields](https://docs.zyte.com/zyte-api/usage/reference.html) and [Unlocker request interface](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website).

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Five articles: English, Arabic, French, JavaScript, redirect/canonical case. Five routes, two repetitions: 50 fetches, up to 100 extraction outputs. | Every body/title, encoding, final URL, dates, error page, timeout; for each browser variant, which requests were rejected |
| Controlled | 45 articles: five calibration, 40 unseen. First full pass: 225 attempts, up to 450 extraction outputs. | Paragraph omissions, contamination, ordered anchors, identity/date errors, extractor-native date accuracy; faults and resource limits |
| Seven days | Repeat fixed URLs; add up to five new URLs per selected domain/day within budget. Example fixed cadence: three rounds/day. | Stability by domain/language, new-page performance, reconciled cost per usable result, Chromium memory/CPU |

Review raw HTML/DOM beside extracted text. A correct article title attached to an unrelated body is a failure of identity/content. A consent/challenge page with HTTP 200 is not a successful article.

The current direct route has address/response/deadline controls but no automatic robots policy or configurable team User-Agent field. Review permitted targets and required pacing before runs. If a required site policy cannot be represented by the current transport, document an adapter change before testing that target.

**Short news:** a target's **options.short_news: true** lowers the response validator's body minimum from 250 to 80 characters only when the extracted page also has a title **and** a publication date. Otherwise the normal minimum applies. Each validation records **short_news_declared**, **short_news_applied** and **body_minimum**; list declared short-news targets in the pilot report.

**Dates per extractor:** explicit HTML metadata can fill the scored publication date for both extractors. The score also records **extractor_date_correct** (the extractor's own date) and **date_source**, so the two extractors remain comparable on dates.

**Fallback trial:** direct only; direct -> Zyte; direct -> Unlocker; direct -> browser_standard (and direct -> browser if the isolated variant runs); then one measured managed fallback -> browser if justified. Use the same chosen first extractor for fallback decisions.

### 9.2 RSS and Atom

**Question:** Can we retrieve the feed and preserve its entries correctly?

| Route ID | Adapter/settings |
|---|---|
| rss_baseline | rss, settings.parser = baseline |
| rss_feedparser | rss, settings.parser = feedparser |

Target kind is **rss**, input is the actual feed URL. Keep acquisition-affecting settings identical; the runner can share a captured feed between parser candidates within the same run/repetition.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Six feeds, two repetitions: 12 captures replayed through both parsers | GUID/ID, URL, title/content, dates, enclosure/media, text encoding |
| Controlled | Ten feeds plus controlled RSS/Atom/RDF, bad-entity, update, empty-feed, and 304 snapshots | Parser loss versus transport failure; changed GUID/date; duplicate items |
| Seven days | Starting cadence: every 30 minutes, both parsers on matching captures | Missed entries, update handling, repeated IDs, feed-window loss during outages |

Distinguish summary feeds from full-body feeds. A parser cannot supply an article body absent from the XML. Compare full feed content with the website baseline only where the feed genuinely supplies that content.

Test valid empty XML separately from HTML saying “access denied.” Record native and normalized IDs; RSS candidates may need reference aliases.

**Conditional cache limitation:** settings.conditional can exercise ETag/Last-Modified behavior inside a run, but the current cache is scoped to the run ID. Separate scheduled child runs do not automatically share an HTTP cache. Do not claim cross-day bandwidth savings from 304 tests alone.

**Fallback trial:** alternative parser on the same bytes for parse failure. Network failure requires a separately measured transport/retry/cache policy.

### 9.3 Google News

**Question:** Which candidate discovers more useful relevant publisher articles, with trustworthy dates and references?

| Route ID | Candidate |
|---|---|
| google_rss | Google News RSS through current app parser |
| google_apify | Configured actor groupoject/google-news-scraper |

Use kind **google_news**. Put the query in input; set language, region, and observation window in options. Region/language changes define separate query configurations.

The actor's template input is intentionally empty. Open its account input schema, confirm availability, and paste the nonsecret input into settings.input. The public schema could not be retrieved during this guide's preparation; this is not proof the actor is unavailable. If unavailable to your account, record that and name/version any replacement explicitly.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two query/language/region configurations, two candidates, twice: eight collections | Query mapping, returned article identity, title/snippet, dates, publisher references |
| Controlled | Five configurations with independent relevance/metadata review | Duplicates, old/off-topic items, lost dates, unique useful additions, unsupported filters |
| Seven days | Starting cadence: every four hours, matched windows | Fresh discoveries, reliability, relevance drift, actor charges, fallback cooldown |

Keep the Google URL and original publisher identity where available. The benchmark does not promise automatic decoding of every opaque Google News link. A Google result page is not the publisher article body.

No provider is the ground truth for an open-ended query. Use reviewed relevance and coverage of independently known examples; leave total recall unknown when its denominator is unknown.

The actual app normalizer can reject undated Google News records. Inspect raw_item_count, normalization_dropped, and date issues; a reduced output may reflect normalization loss rather than remote omission.

**Fallback trial:** RSS -> the selected actor on defined errors/incompleteness, with deduplication and cooldown. A valid empty query alone is not a sufficient failure signal.

### 9.4 Telegram channels

**Question:** What does our public-page collector miss compared with an authorized API history collector?

| Route ID | Candidate |
|---|---|
| telegram_public | t.me/s public page with actual app parser |
| telegram_api | Telegram API through Telethon |

Target input is a public broadcast-channel username, not a message URL or arbitrary private group. The Telethon implementation requires an explicit UTC start/end window.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two channels of different volume, both collectors twice: eight collections | IDs, visible range, text/captions, timestamps, links/media |
| Controlled | Six channels across volume/language; independent IDs plus replay event ledger | Long/media-only posts, albums, forwards, outage bursts, floods, edits/deletions where observable |
| Seven days | Starting cadence: every 15 minutes at matched times | Missed posts, repeated IDs, detection observations, session recovery, actual collector load |

Public collection covers the latest visible page. Telethon's current benchmark implementation reads a bounded time window; it does not persist a last-message watermark across all scheduled rounds like the ZIP's incremental example.

The pipeline preserves original evidence, but the normalized representation may not retain every album/forward/link field. Measure those losses. Neither adapter automatically establishes complete edit/deletion tracking.

Observe edits/deletions using independently checked source events or replay. Disappearance from a page does not prove deletion. Respect recorded flood waits; a bounded deferral is not a successful collection.

**Fallback trial:** whichever candidate is selected primary -> the eligible alternative, preserving original channel/message identity. Record misses the trigger never detected.

### 9.5 X account posts

**Question:** Which candidate retrieves a specified account's eligible posts completely and accurately?

| Route ID | Candidate |
|---|---|
| x_profile_apify | kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest, profile mode |
| x_profile_api | Official X user-post API |
| x_profile_brightdata | Bright Data post discovery by profile URL |

Use kind **x_profile**, input as the username, and options.profile_url as the complete profile URL for Bright Data. Optional user_id avoids repeated official-API username lookups. Match reply/repost policy and dates where supported.

The repository's Apify input begins with **from: "{input}"**, **maxItems**, and **queryType: "Latest"**. Confirm against the [actual actor input schema](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest/input-schema). The actor name is not price evidence.

Bright Data needs the correct dataset and async discovery query from your account, not a known-post-URL retrieval product. Its [profile discovery documentation](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-posts-discover-by-profile-url) identifies the task; confirm protocol compatibility with our adapter.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two accounts, three candidates, twice: 12 collections | Account IDs, full text, dates, URLs, bounded job/page lifecycle |
| Controlled | Ten accounts across volume/language | Long posts, replies/reposts, media expansions, page overlap, wrong attribution, cap hits |
| Seven days | Starting cadence: every four hours | Coverage of matched windows, freshness observations, completion, repeated-item charges |

The official adapter requests long-text/media-related fields, but a field being requested does not establish complete normalized media/link support. Compare raw response fields with normalized output.

Test an expired cursor, repeated page, access failure, and interrupted download with controlled responses. Do not deliberately exhaust a paid quota to generate a fault.

**Fallback trial:** selected profile collector -> another eligible profile collector. A fallback must preserve the same inclusion/window policy.

### 9.6 X keyword search

**Question:** Which search candidate finds relevant posts under equivalent query semantics?

| Route ID | Candidate |
|---|---|
| x_search_apify | Same configured actor in search mode |
| x_search_api | Official search, settings.search = recent or all as authorized |

Use kind **x_search**, the query in input, and explicit UTC windows. The Apify input uses **searchTerms: ["{input}"]**; translate filters into supported actor fields and freeze the resulting query. Confirm eligible history in the [official search documentation](https://docs.x.com/x-api/posts/search/introduction) and account settings.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two queries, two candidates, twice: eight collections | Query equivalence, language/date filters, result order, original IDs |
| Controlled | Five query configurations | Reviewed relevance, known expected IDs, pagination, long text, incomplete/unsupported filters |
| Seven days | Starting cadence: every four hours; deliberate overlap | Late arrivals, repeat IDs, fresh relevant posts, recovery, cost per reviewed useful post |

Keep profile and search experiments separate even though they share an actor. Broad search recall is unknown without an independent complete reference. Union coverage and high returned counts are not complete recall.

**Fallback trial:** search candidate -> task-equivalent search candidate with the same supported semantics.

### 9.7 LinkedIn company posts

| Route ID | Candidate |
|---|---|
| linkedin_company_apify | harvestapi/linkedin-company-posts |
| linkedin_company_brightdata | Bright Data company-post discovery |

Use kind **linkedin_company** and a company URL. The template actor input uses targetUrls, maxPosts, scrapeComments=false, and scrapeReactions=false. Validate the [company actor input](https://apify.com/harvestapi/linkedin-company-posts/input-schema) and [Bright Data company discovery task](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-company-url).

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two companies, two candidates, twice: eight collections | Correct company/post identity, full text, media, dates |
| Controlled | Five companies | Truncation, relative dates, pagination, repeated posts, mixed valid/error rows, restricted targets |
| Seven days | Starting cadence: twice daily | New-post coverage, completion time, freshness, billed versus useful items |

Do not claim a complete window when result caps exclude older posts. Relative dates require an independently checked precision policy; a fabricated exact publication time is not acceptable.

**Fallback trial:** company-post discovery -> equivalent company-post discovery.

### 9.8 LinkedIn profile posts and conditional official API

| Route ID | Candidate |
|---|---|
| linkedin_profile_apify | harvestapi/linkedin-profile-posts |
| linkedin_profile_brightdata | Bright Data profile-post discovery |
| linkedin_official | Official Posts API, authorized subset only |

For profile scraping, use kind **linkedin_profile** and a profile URL. Confirm the [profile actor input](https://apify.com/harvestapi/linkedin-profile-posts/input-schema). Freeze authored-post versus repost policy.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two profiles, two scraper candidates, twice: eight collections | Author identity, full text, repost attribution, dates/media |
| Controlled | Five profiles | Pagination, truncation, mixed results, inaccessible profiles, wrong-author association |
| Seven days | Starting cadence: twice daily | Fresh posts, repeated items, quality consistency, completion and useful-item cost |

The official candidate additionally needs settings.linkedin_version, settings.authorized_read_confirmed=true, and target options.author_urn. Use two eligible targets in the pilot, then a clearly labelled restricted controlled/live subset.

Authorized API targets do not establish coverage of arbitrary public profiles/companies. Record the exact permissions and version following [LinkedIn Posts API documentation](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03).

**Fallback trial:** profile-post scraper -> equivalent profile-post scraper. Use the official API only where the same target is actually eligible.

### 9.9 Every other Apify actor/task

Route **generic_apify** uses adapter **apify**, target kind **apify**, and the exact actor/task input.

For a saved task, use settings.task_id; otherwise use settings.actor_id. Pin settings.build where supported. Clone and rename route IDs for distinct actors so that they do not share an undifferentiated score.

The generic app normalizer still expects recognizable source fields. An actor with an unrelated schema can run successfully yet yield unusable normalized records. settings.field_map applies to non-Apify JSON normalization; it does not replace the application Apify normalizer.

For supported non-Apify datasets, field-map values are dotted paths:

~~~json
{
  "field_map": {
    "id": "post_id",
    "text": "description",
    "date": "date_posted",
    "url": "url",
    "author": "user_posted",
    "media": "photos"
  }
}
~~~

Use observed schema fields, not this fragment blindly. It cannot merge several media fields or perform arbitrary date conversions.

| Stage | Inputs and actions | Inspect |
|---|---|---|
| Pilot | Two task targets, twice | Submission -> stored run ID -> polling -> bounded dataset -> normalized items |
| Controlled | Expanded task-specific checked sample | Schema changes, ID/date loss, output caps, repeated pages, interrupted submission/download |
| Seven days | Explicit cadence justified per actor | Useful unique output, lifecycle reliability, actual bills, account/build maintenance |

Downloading an existing dataset alone does not measure actor acquisition cost. Include the run's charges. A completed actor with empty/malformed output is not automatically successful.

### 9.10 Optional GDELT discovery

GDELT exists in the ZIP but is **not an adapter or target kind in the current CLI**. There is no runnable **--source gdelt** command in this package.

If included in the external research, first add/test an explicit adapter or use a separately documented collector/export. Give it a distinct experiment version and reconcile its records before combining summaries.

| Stage | Proposed optional experiment |
|---|---|
| Pilot | Two reviewed topic queries, bounded results, manually inspect relevance/URLs/dates |
| Controlled | Compare independently reviewed useful links with Google News and selected RSS over matching windows |
| Seven days | Track fresh useful additions, overlap, failures, and downstream article-fetch cost |

GDELT's discovery timestamps and any search-result dates need independent interpretation before treating them as publication time. Its output is article discovery, not full-body ground truth.

Record **not implemented / not tested** until that separate path exists. This guide does not ask you to merge the ZIP to enable it.

## 10. Stage 1: small pilots

### 10.1 Complete the pilot roster

| Family config | Initial targets | Candidates | Repetitions | Collection units |
|---|---:|---:|---:|---:|
| pilot-web.json | 5 articles | 5 (including both browser variants) | 2 | 50 fetches |
| pilot-rss.json | 6 feeds | 2 parsers | 2 | 12 shared fetches, 24 parser jobs |
| pilot-google.json | 2 query configurations | 2 | 2 | 8 |
| pilot-telegram.json | 2 channels | 2 | 2 | 8 |
| pilot-x-profile.json | 2 accounts | 3 | 2 | 12 |
| pilot-x-search.json | 2 queries | 2 | 2 | 8 |
| pilot-linkedin-company.json | 2 companies | 2 | 2 | 8 |
| pilot-linkedin-profile.json | 2 profiles | 2 | 2 | 8 |
| Conditional official LinkedIn | 2 eligible authors | 1 extra | 2 | 4 extra |
| Each generic actor | 2 task targets | Actual candidates | 2 | Calculate |

Templates contain representative placeholder targets, not the full sample above. Duplicate/edit targets with unique IDs until the intended roster is present. The route list must refer to exact configured route IDs.

Use a fixed recent window where supported, and independently record the latest visible window otherwise. Small item caps deliberately limit pilot work; a capped pilot cannot establish unrestricted recall.

**Run order: unpaid first.** Validate the whole pipeline on the real network before spending money:

1. Section 10.2's single direct article.
2. Unpaid families: **web** with only direct and browser_standard (plus browser if namespaces work), **rss**, **google** with only google_rss, and **telegram** with only telegram_public.
3. Reconcile those runs' reports and resource summaries, and fix any harness defect.
4. Paid and account-dependent candidates, one family at a time, each with a small reconciled bill before the next.

This order is a recommendation, not a separate comparison: the matched pilot still runs every enabled candidate on the same targets once each family is ready.

### 10.2 First real external request

Start with one reviewed article and only the direct route enabled. Create a dedicated one-target config so that unrelated incomplete account settings cannot affect the first check:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = load(campaign / "config/pilot-web.json")
config["targets"] = config["targets"][:1]
config["targets"][0]["routes"] = ["direct"]
config["repetitions"] = 1
config["chains"] = []
for route in config["routes"]:
    route["enabled"] = route["id"] == "direct"
path = campaign / "config/first-direct.json"
path.write_text(json.dumps(config, indent=2), encoding="utf-8")
PY
python -m bench preflight --config "$BENCH_CAMPAIGN/config/first-direct.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/first-direct.json" \
  --output "$BENCH_CAMPAIGN/reports/first-direct-plan.json"
~~~

Check that the input is real/reviewed and its reference file exists if configured. Then **LIVE**:

~~~bash
python -m bench fetch --config "$BENCH_CAMPAIGN/config/first-direct.json" --run-id first-direct-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id first-direct-001
less "$BENCH_CAMPAIGN/data/reports/first-direct-001/report.md"
~~~

This is a setup probe, separate from the matched pilot. An unlabelled accepted article remains AUTO_UNVERIFIED.

### 10.3 Run the matched website pilot

After all enabled routes are prepared:

~~~bash
python -m bench preflight --config "$BENCH_CAMPAIGN/config/pilot-web.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/pilot-web.json" \
  --output "$BENCH_CAMPAIGN/reports/pilot-web-plan.json"
~~~

Review the plan, then **LIVE**:

~~~bash
python -m bench fetch --config "$BENCH_CAMPAIGN/config/pilot-web.json" --run-id pilot-web-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id pilot-web-001
~~~

### 10.4 Run each source pilot

Repeat this block one source family at a time. Enter **rss**, **google**, **telegram**, **x-profile**, **x-search**, **linkedin-company**, **linkedin-profile**, or **generic**. Use a new suffix for a new experiment.

~~~bash
read -r -p "Prepared family name: " BENCH_FAMILY
case "$BENCH_FAMILY" in
  rss|google|telegram|x-profile|x-search|linkedin-company|linkedin-profile|generic) ;;
  *) echo "Unknown source family"; exit 1 ;;
esac
BENCH_CONFIG="$BENCH_CAMPAIGN/config/pilot-$BENCH_FAMILY.json"
BENCH_RUN="pilot-$BENCH_FAMILY-001"
python -m bench preflight --config "$BENCH_CONFIG"
python -m bench plan --config "$BENCH_CONFIG" \
  --output "$BENCH_CAMPAIGN/reports/$BENCH_RUN-plan.json"
~~~

Review enabled candidates, exact inputs, and planned reservations. Then **LIVE**:

~~~bash
python -m bench collect --config "$BENCH_CONFIG" --run-id "$BENCH_RUN"
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id "$BENCH_RUN"
less "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.md"
~~~

Use the generic family for each separately named actor config/run. Do not overwrite one actor's experiment with another.

### 10.5 Inspect every result

For a selected run:

~~~bash
BENCH_RUN=pilot-web-001
jq '{job_states, groups, reserved_or_reconciled_usd}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json" | less
jq '.rows[] | {target,route,browser_network,extractor,status,label,capped,reason,provider_actual_usd,provider_reserved_usd,cost_reconciled,server_allocated_usd}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json" | less
jq '{cost_model, provider_actual_usd, provider_unreconciled_reserved_usd, resource_summary, capacity_stops}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json"
~~~

Review full JSON for extracted text, normalized records, per-item scores, raw evidence paths, and provider IDs. The Markdown report is a summary.

To locate evidence references:

~~~bash
jq '.jobs[] | {id, target: .spec.target.id, result: .result}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json" | less
~~~

Saved payloads live under **data/blobs** as uncompressed, content-addressed files named by their SHA-256. Open one offline using its relative artifact path and expected hash from the report:

~~~bash
read -r -p "Relative artifact path from report: " BENCH_ARTIFACT
read -r -p "Expected SHA-256 from report: " BENCH_ARTIFACT_SHA
export BENCH_ARTIFACT BENCH_ARTIFACT_SHA
python - <<'PY'
import hashlib, os
from pathlib import Path
root = (Path(os.environ["BENCH_CAMPAIGN"]) / "data").resolve()
path = (root / os.environ["BENCH_ARTIFACT"]).resolve()
if not path.is_relative_to(root):
    raise SystemExit("Artifact path must remain under the data directory")
body = path.read_bytes()
if hashlib.sha256(body).hexdigest() != os.environ["BENCH_ARTIFACT_SHA"]:
    raise SystemExit("Artifact checksum mismatch")
output = Path(os.environ["BENCH_CAMPAIGN"]) / "reference-snapshots/inspected-payload.txt"
output.write_bytes(body)
print(output)
PY
less "$BENCH_CAMPAIGN/reference-snapshots/inspected-payload.txt"
~~~

This is an inspection copy, not an independent reference. Inspect as text; do not execute saved scripts or use the provider output as its own gold answer.

### 10.6 Pilot report and exit gate

Write **reports/STAGE_1_PILOT.md** with:

| Target/window | Candidate/build | Returned/raw count | Useful normalized count | Manual quality | Duration | Cost status | Evidence |
|---|---|---:|---:|---|---:|---|---|
| Actual input | Actual route/version | Measured | Measured | Findings | Measured | Actual/reserved/unknown | Saved reference |

Check all planned work is accounted for, including disabled, failed, pending, and skipped jobs. Inspect every article and source item in the small pilot.

Move to Stage 2 when:

- Captures and hashes are readable, and raw-to-normalized losses are understood.
- Relevant deadline, size, cost, and recovery checks pass.
- Manual article classification and automatic labels agree on at least 95% of pilot outputs, counted separately per extractor.
- No known wrong page/source record is silently accepted without a recorded fix or candidate exclusion.
- Real usage is reconciled enough to bound the next stage: each group's **cost_status** is RECONCILED, or its remaining unreconciled reservations are listed.
- Each enabled candidate has evidence; unavailable ones have reasons. Both browser variants are measured or have a recorded not-tested reason.
- The report's **resource_summary** shows process-tree peaks (**peak_chromium_rss_bytes**, **peak_node_rss_bytes**) from the VPS, and **capacity_stops** is empty or explained.
- `server-check` and the fault smoke gate still pass on the VPS after the pilot.

A defect fix gets a new code/config version and run ID. Preserve the failed evidence. Stage 1 does not choose a winner from a handful of successes.

## 11. Stage 2: controlled comparison

### 11.1 Expand references and freeze the evaluation

Copy the validated master settings, not untouched disabled templates:

~~~bash
cp "$BENCH_CAMPAIGN/config/stage1.json" "$BENCH_CAMPAIGN/config/stage2.json"
nano "$BENCH_CAMPAIGN/config/stage2.json"
~~~

Transfer any pilot-family settings fixed after the master was copied. Set **stage: "controlled"** and **repetitions: 1** for the first independent pass. Keep the live data_dir and cumulative budgets; expand them only within the agreed allocation.

| Family | Controlled sample |
|---|---|
| Articles | 45 total: five calibration, at least 40 unseen |
| RSS | Ten real feeds plus controlled snapshots |
| Google News | Five query/language/region configurations |
| Telegram | Six channels with checked windows and replay events |
| X profiles | Ten accounts across volume/language |
| X search | Five query configurations |
| LinkedIn companies | Five companies |
| LinkedIn profiles | Five profiles |
| Official LinkedIn | Explicit authorized subset |
| Other actors | Expanded task-specific references |

Mark **calibration: true** on the five articles used for tuning. Any further tuned-on articles become calibration too. Preserve 40 unseen inputs for the initial quality cohort.

Independently double-label ten articles. For shortlisted source categories, aim initially for at least 30 checked eligible post IDs, extending the sample if uncertainty remains.

Increase item/page limits enough to cover controlled windows, with billing bounds updated. Separately test deliberate cap hits. A capped output cannot demonstrate unlimited-window completeness.

### 11.2 Validate references

~~~bash
python -m bench validate-gold --config "$BENCH_CAMPAIGN/config/stage2.json" \
  > "$BENCH_CAMPAIGN/reports/stage2-gold-validation.json"
jq . "$BENCH_CAMPAIGN/reports/stage2-gold-validation.json"
~~~

For the full article cohort, require **stage2_article_sample_ready: true**, not just **valid: true**. Also inspect **coverage_only_source_references**. An ID inventory can validate structurally without supporting quality PASS.

Open-ended discovery references can be explicitly incomplete samples. Missing references remain gaps; do not fill them with a provider's output to force validation to pass.

Compare two independently prepared article labels:

~~~bash
python -m bench compare-gold \
  --first "$BENCH_CAMPAIGN/gold/REPLACE_article_reviewer_a.json" \
  --second "$BENCH_CAMPAIGN/gold/REPLACE_article_reviewer_b.json"
~~~

The initial body agreement target is F1 >= 0.95. Resolve disagreement before interpreting provider scores.

### 11.3 Fault and recovery experiment matrix

Use the existing offline suite first. Add missing target/provider cases as explicitly versioned controlled fixtures before claiming them tested.

| Case | Expected result |
|---|---|
| Slow headers or stalled/dripping body | Bounded deadline, preserved failure |
| Redirect loop or unsafe address | Bounded refusal before forbidden connection |
| Oversized/compressed expansion | Bounded decoded/evidence size; measure memory too |
| HTTP 429/403/404/503 | Correct error category and relevant returned retry information |
| HTTP 200 error/challenge page | Rejected, not a valid empty feed/article |
| Malformed XML/JSON and bad entities | Visible error/partial result, no false success |
| Missing dates/media-only post | Source-appropriate missingness, no invented timestamp |
| Duplicate/looping pages | Bounded pagination and visible incomplete coverage |
| Actor pending/failed/partial | Separate lifecycle and content outcome |
| Crash after submission | Known job resumed; unknown submission investigated |
| Lost/corrupt payload | Previous derived PASS invalidated until verified restoration/reprocessing |
| Budget exhausted | Skipped work recorded; no fresh paid dispatch beyond local allowance |

Managed providers cannot access a VPS-local localhost fixture. Provider-mediated fault tests need an intentionally bounded reachable fixture endpoint, separate setup, and a budget. The existing **faults** command does not deploy such a service.

Recovery boundaries to test with isolated replay/test runs:

~~~text
planned -> submission begun -> remote ID stored -> raw payload durable
-> normalization complete -> report written
~~~

The external harness has no production D1 item-insert/Queue-consumer path. Do not label these tests as production duplicate-import or queue-delivery validation.

### 11.4 Run the frozen comparison

~~~bash
python -m bench preflight --config "$BENCH_CAMPAIGN/config/stage2.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/stage2.json" \
  --output "$BENCH_CAMPAIGN/reports/stage2-plan.json"
~~~

After checking evidence, scope, and spending, **LIVE**:

~~~bash
python -m bench run --config "$BENCH_CAMPAIGN/config/stage2.json" --run-id controlled-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id controlled-001
~~~

The first website pass with all five routes is 225 attempts. Source jobs are additional. Main-comparison harness retries are zero; any retry-policy experiment gets its own declared version and budget.

Inspect all failures, wrong-source associations, missing dates, truncation, and suspected false successes. Review raw and normalized output separately. Hide route names during human quality review where practical.

### 11.5 Add references later without recollecting

~~~bash
python -m bench attach-reference --data-dir "$BENCH_CAMPAIGN/data" \
  --run-id controlled-001 --target-id REPLACE_TARGET_ID \
  --reference "$BENCH_CAMPAIGN/gold/REPLACE_reference.json"
python -m bench score --data-dir "$BENCH_CAMPAIGN/data" --run-id controlled-001
~~~

Attach-reference changes saved job reference data and records an audit event. Use **process** instead of score if extraction/normalization has not yet run. Editing the original reference file alone does not update an already frozen run.

### 11.6 Controlled report and exit gate

Write **reports/STAGE_2_CONTROLLED.md** containing candidate/task results, references, raw-to-normalized losses, fault/recovery evidence, reconciled costs, and exclusions.

Freeze code/dependencies, actor builds, inputs, windows, requested fields, page limits, source cadences, sampling policy, validator/scorer versions, deadlines, budgets, and fallback triggers before Stage 3.

Move on when the reference evidence is reviewable, relevant recovery tests pass, every required family has evidence or an explicit gap, and the planned live workload fits measured capacity/cost.

## 12. Stage 3: seven-day live testing

### 12.1 Choose the actual schedule

The CLI supports **one interval for all targets in one schedule**. It is not a mixed-cadence scheduler.

The supplied stage3 template has **eight daily rounds** starting immediately: r000 is at the start and r007 is due seven days later, so the observations span a full seven days. Label the actual daily cadence honestly; this does not measure 15-minute Telegram delivery.

Faster per-family campaigns can use the same CLI with a subset config:

| Campaign profile | Interval | Rounds including both boundaries of seven days |
|---|---:|---:|
| All families, daily | 86400 seconds | 8 |
| Fixed websites, three/day | 28800 seconds | 22 |
| RSS, every 30 minutes | 1800 seconds | 337 |
| Telegram, every 15 minutes | 900 seconds | 673 |
| Google News or X, every four hours | 14400 seconds | 43 |
| LinkedIn, twice daily | 43200 seconds | 15 |

Run one schedule at a time against the shared ledger. Separate family campaigns can be run consecutively. Running every fast profile in the same calendar week requires a coordinated external scheduler with global limits; that orchestration is not provided by the current CLI.

Do not start several independent schedulers against separate data directories to evade locking: that loses shared budget/concurrency enforcement. Choose the supported daily campaign first, or schedule dedicated faster family campaigns explicitly.

### 12.2 Create the daily live configuration

This transfers the actual controlled configuration, preserves article references, removes source references tied to old windows, and starts with no preselected daily additions:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = load(campaign / "config/stage2.json")
config["stage"] = "soak"
config["repetitions"] = 1
config["schedule"] = {
    "rounds": 8, "interval_seconds": 86400, "rolling_window_hours": 24,
    "daily_targets_dir": str(campaign / "daily"),
    "references_dir": str(campaign / "gold/rounds"),
}
config.pop("targets_by_round", None)
for target in config["targets"]:
    if target["kind"] != "article":
        target.pop("reference", None)
path = campaign / "config/stage3.json"
path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
print(path)
PY
nano "$BENCH_CAMPAIGN/config/stage3.json"
~~~

Set approved campaign/provider allowances and caps based on actual Stage 1/2 charges. These budgets include earlier runs in the same data directory.

Removing the fixed source references is required, not optional: live preflight reports **reference_window** NOT_READY while a rolling schedule still points at a fixed complete reference.

Rolling windows use each round's scheduled time, not the actual delayed dispatch time. Provider inputs only follow changing windows where their schema explicitly references those options.

### 12.3 Prepare a reference for every round

Each round **N** collects the 24 hours ending at its scheduled time, so round N needs a reference built for exactly that window. There are two supported ways to supply one:

| Method | When to use | How |
|---|---|---|
| Prepared before the round | Controlled channels/accounts with a known event ledger | Save **gold/rounds/round-NNN/TARGET_ID.json** before round N is first created. The scheduler loads it, freezes it into that round's jobs, and records its hash in a **round_references_loaded** event. |
| Labelled after the round | Real public sources, where you can only list what was published once the window closes | Leave the folder empty, then use **attach-reference** on child run **week1-rNNN** (below). |

Round numbers are zero-padded to three digits (**round-000**). A file added after its round was created is ignored for that round; use **attach-reference** instead.

**Find the exact window to label.** Attaching any reference prints the round's **collection_window** and whether the reference matches it:

~~~bash
python -m bench attach-reference --data-dir "$BENCH_CAMPAIGN/data" \
  --run-id week1-r002 --target-id REPLACE_SOURCE_TARGET \
  --reference "$BENCH_CAMPAIGN/gold/rounds/round-002/REPLACE_SOURCE_TARGET.json"
python -m bench score --data-dir "$BENCH_CAMPAIGN/data" --run-id week1-r002
~~~

Run these while the scheduler is waiting between rounds: during a round's collection the dispatch lock refuses them with "A dispatcher already owns this data directory", which is safe to retry later. The output must show **reference_window_error: null**. If it shows **reference_window_missing** or **reference_window_mismatch**, copy the printed **collection_window** into the reference's **window** field, independently check the item list against that window, and attach it again. Until then that round's completeness for this target is reported as a sample, with recall unknown.

Build each list from independent evidence for that window (the event ledger, dated source snapshots, or the channel/account page reviewed by a person). Never copy one candidate's output into the reference.

Rounds without a complete reference still produce useful evidence: capture success, errors, returned items, duplicates, cap hits, publication age, and cost. What they cannot produce is recall or a completeness PASS. Report the number of rounds with matched references per source.

### 12.4 Calculate the workload before launch

~~~bash
python -m bench preflight --config "$BENCH_CAMPAIGN/config/stage3.json"
python -m bench plan --config "$BENCH_CAMPAIGN/config/stage3.json" \
  --output "$BENCH_CAMPAIGN/reports/stage3-single-round-plan.json"
~~~

**Plan counts one configuration run, not the whole schedule.** Multiply fixed per-round jobs/ceilings by the number of rounds, then add daily new articles, probes, faults, and fallback trials. Shared RSS acquisition can make parser-job counts exceed physical fetch counts.

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
from bench.runner import plan
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = load(campaign / "config/stage3.json")
one = plan(config)
rounds = config["schedule"]["rounds"]
print(json.dumps({
    "rounds": rounds,
    "fixed_jobs": one["planned_jobs"] * rounds,
    "fixed_reservation_ceiling_usd": one["planned_maximum_usd"] * rounds,
    "extra_daily_targets_faults_fallbacks_and_local_cost": "calculate separately",
}, indent=2))
PY
~~~

A target collection can include multiple provider calls and billable records. Estimate disk for raw captures, normalized data, snapshots, logs, and backups. Check remaining budget, not just initial allocation.

### 12.5 Validate restart with the offline scheduler first

Use the offline configuration, a new data/run ID, and a short two-round schedule:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = json.loads((campaign / "config/offline.json").read_text())
config["schedule"] = {"rounds": 2, "interval_seconds": 30}
(campaign / "config/offline-schedule.json").write_text(json.dumps(config, indent=2))
PY
python -m bench schedule --config "$BENCH_CAMPAIGN/config/offline-schedule.json" \
  --run-id scheduler-check-001
~~~

For a recovery exercise, interrupt this synthetic schedule during its wait, then rerun the identical command. Confirm completed work is retained. Use a fresh ID if the original exercise already completed.

### 12.6 Launch the live schedule in tmux

**VPS benchmark account:**

~~~bash
tmux new-session -s distilled-benchmark
~~~

Inside tmux:

~~~bash
source /home/distilled-bench/benchmark-campaign/environment.sh
cd "$BENCH_PACKAGE"
source .venv/bin/activate
set -o pipefail
python -m bench schedule --config "$BENCH_CAMPAIGN/config/stage3.json" --run-id week1 \
  2>&1 | tee "$BENCH_CAMPAIGN/logs/week1-console.log"
~~~

This is **LIVE**. It starts the first round immediately and may submit paid jobs.

Detach with Ctrl+B, then D. Reattach with:

~~~bash
tmux attach-session -t distilled-benchmark
~~~

SSH disconnect does not stop tmux. A VPS reboot does. This guide does not enable an automatic restart loop; review interrupted paid work before restarting.

The parent ID is **week1-schedule**. Children are **week1-r000** through **week1-r007** for the eight-round configuration. Each child automatically collects, processes, and writes a report.

### 12.7 New articles each day

Before the next round, derive candidate URLs from the previous round's normalized RSS/Google News:

~~~bash
python -m bench discover --data-dir "$BENCH_CAMPAIGN/data" --run-id week1-r000 \
  --limit 20 --output "$BENCH_CAMPAIGN/daily/candidates-round-001.json"
nano "$BENCH_CAMPAIGN/daily/candidates-round-001.json"
~~~

This operates on saved data; it does not fetch article bodies. Review each URL, original publisher identity, domain eligibility, duplicates, and desired route list. Remove unusable Google wrappers and known repeats from the “unseen” cohort.

Save the reviewed target array under the exact name:

~~~bash
cp "$BENCH_CAMPAIGN/daily/candidates-round-001.json" "$BENCH_CAMPAIGN/daily/round-001.json"
~~~

The file is loaded when that child is first created and then frozen. It must contain at most 100 article targets with unique IDs and permitted configured website routes. Paths to references in that file resolve relative to its directory; absolute paths are easiest.

Use **[]** for an intentionally empty daily addition file. A missing file is recorded as a missing daily sample. Existing child runs retain their original inputs even if the file changes later.

Unlabelled new articles remain unverified. Add independent references with attach-reference on the correct child run, then score/process during a quiet window.

### 12.8 Daily review

Record at least:

- Planned, started, captured, failed, pending, uncertain, disabled, and budget-skipped work.
- At least 20 live article outputs/day, sampled across routes, languages, and automatic labels when volume permits; all if fewer.
- At least five new items per enabled source-candidate category/day, or all if fewer.
- Independently inspected source windows to identify missing items, not just errors in returned items.
- Separate targeted inspection of suspected false successes; do not mix it into a random-sample rate.
- Costs, cap hits, provider incidents, heartbeat/queue delays, and server resources.

Write **reports/DAILY_REVIEW.md** with sample counts, selection method, evidence, and unresolved questions.

Repeated fixed URLs measure stability. They do not turn 40 independent articles into hundreds of independent quality examples. Aggregate the original unseen cohort once; analyse repetitions separately.

### 12.9 Schedule restart behavior that affects the experiment

The current scheduler revisits rounds in order on restart. Past-due rounds that were never created may run immediately; it does not implement the ZIP's “skip missed slots” policy.

Before resuming after a long outage, inspect due windows, remaining budget, and whether historical retrieval still makes sense. If catch-up would invalidate the design, keep the old campaign stopped, record the outage, and create a separately budgeted/configured new campaign. Do not silently call catch-up observations “on-time.”

A successful process exit does not prove every child job succeeded: pending/uncertain jobs can remain. Inspect child reports and job/step states.

## 13. Fallback experiments

### 13.1 Website chains

Standalone comparisons answer which route works. A chain answers whether a sequence improves final quality at acceptable cost and delay.

Create a website-only fallback config after Stage 2:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
campaign = Path(os.environ["BENCH_CAMPAIGN"])
config = load(campaign / "config/stage2.json")
config["targets"] = [t for t in config["targets"] if t["kind"] == "article"]
config["repetitions"] = 1
config.pop("schedule", None)
config.pop("targets_by_round", None)
web = {"direct", "zyte", "unlocker", "browser", "browser_standard"}
for route in config["routes"]:
    route["enabled"] = route["enabled"] and route["id"] in web
config["chains"] = [
    {"id": "direct_only", "routes": ["direct"], "deadline_seconds": 90},
    {"id": "direct_zyte", "routes": ["direct", "zyte"], "deadline_seconds": 90},
    {"id": "direct_unlocker", "routes": ["direct", "unlocker"], "deadline_seconds": 90},
    {"id": "direct_browser_standard", "routes": ["direct", "browser_standard"], "deadline_seconds": 90},
    {"id": "direct_browser_isolated", "routes": ["direct", "browser"], "deadline_seconds": 90},
]
(campaign / "config/fallbacks.json").write_text(json.dumps(config, indent=2))
PY
nano "$BENCH_CAMPAIGN/config/fallbacks.json"
~~~

Reduce to a small matched set containing ordinary direct successes and known direct-failure cases. Remove chains with unavailable candidates; retain all chain route IDs in each applicable target's routes.

The **first extractor in extractors** drives the actual acceptance decision. Freeze it. Gold answers cannot decide fallback.

The public plan command plans standalone jobs. To plan actual chains nonbillably, use the implemented planning function:

~~~bash
python - <<'PY'
import json, os
from pathlib import Path
from bench.config import load
from bench.runner import plan
campaign = Path(os.environ["BENCH_CAMPAIGN"])
value = plan(load(campaign / "config/fallbacks.json"), chains=True)
(campaign / "reports/fallback-plan.json").write_text(json.dumps(value, indent=2))
print({key: value[key] for key in ("planned_jobs", "planned_maximum_usd")})
PY
python -m bench preflight --config "$BENCH_CAMPAIGN/config/fallbacks.json"
~~~

Check that chains were generated; an incompatible target route list can produce zero chain jobs. Then **LIVE**, when the scheduled dispatcher is stopped/quiet:

~~~bash
python -m bench chains --config "$BENCH_CAMPAIGN/config/fallbacks.json" --run-id fallback-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id fallback-001
jq '.chains' "$BENCH_CAMPAIGN/data/reports/fallback-001/report.json"
~~~

Each route is bounded by its own limit and the remaining chain budget. The proposed chain deadline is 90 seconds, including waiting, first-extractor processing, and validation.

Use **chains.duration_ms** for measured online chain time. Later processing re-extracts for comparison; do not add that offline replay time again to online chain latency.

If the primary returns a wrong page accepted by the response-only validator, the chain stops. Record the resulting false success. The evaluator must not secretly try another provider after consulting gold.

Report final verified quality, attempted routes, fallback/browser activation, detected-failure rescue rate, remaining undetected errors, total charges, and latency.

### 13.2 Source-specific fallback trials

The CLI's **chains** command currently supports article targets only. Source fallback policies below need operator-controlled matched trials or additional explicitly tested orchestration; they are not enabled by adding source IDs to chains.

| Source | Trial |
|---|---|
| RSS | Replay the same failed parse through the alternative parser |
| Google News | Defined RSS failure -> selected actor; check cooldown/duplicate handling |
| Telegram | Failed/incomplete primary window -> eligible other collector on that window |
| X profile | Selected account collector -> another eligible account collector |
| X search | Search collector -> query-equivalent search collector |
| LinkedIn company/profile | Matching discovery product -> equivalent alternative |
| Generic actor | Only a measured task-equivalent alternative |

For a manual source fallback experiment:

1. Freeze the primary, alternative, target/window, page limits, and expected IDs.
2. Define the failure/coverage trigger before collecting.
3. Run the primary and save its result.
4. If the trigger is met, run the alternative on the same eligible target/window.
5. Match original IDs, review rescued/missing items, and add both costs.
6. Record operator delay separately. This is not an automatic-policy latency measurement.
7. Test cooldown, duplicate suppression, and unattended triggering only after those orchestration behaviors are actually implemented.

Use controlled errors where possible. A valid empty source window is not itself proof that posts were missed. Source-job deadlines are separate from the 90-second website-chain example.

## 14. Daily operations, stop, and recovery

### 14.1 Reconnect and inspect

~~~bash
source /home/distilled-bench/benchmark-campaign/environment.sh
cd "$BENCH_PACKAGE"
source .venv/bin/activate
tmux ls
python -m bench status --data-dir "$BENCH_CAMPAIGN/data" --run-id week1-r000
df -h /
free -h
du -sh "$BENCH_CAMPAIGN/data"
~~~

Substitute the relevant child ID. Parent status does not aggregate all child failures. To list saved runs without triggering collection:

~~~bash
python - <<'PY'
import os, sqlite3
from pathlib import Path
path = Path(os.environ["BENCH_CAMPAIGN"]) / "data/benchmark.sqlite"
db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
for row in db.execute("SELECT id,stopped,datetime(created,'unixepoch') FROM runs ORDER BY created"):
    print(*row, sep="\t")
db.close()
PY
~~~

The status/report commands regenerate local reports. They do not call providers. Reports read during active collection can describe a changing run; take final reports after processing.

### 14.2 Resource monitoring

In a separate tmux session:

~~~bash
tmux new-session -s distilled-monitor
~~~

Inside it:

~~~bash
source /home/distilled-bench/benchmark-campaign/environment.sh
vmstat -t 60 | tee "$BENCH_CAMPAIGN/logs/vmstat.log"
~~~

Detach with Ctrl+B, D. Stop this monitor with Ctrl+C when finishing.

**What the benchmark measures itself.** Every 5 seconds a live run records a resource sample. On Linux each sample includes the **whole process tree** under the dispatcher: the Python runner, Node parser/Readability bridges, Playwright's driver, and every Chromium process (browser, renderer, GPU), grouped as python, node, chromium and other. Each group has process count, resident memory and CPU seconds. Samples also record host available memory, swap, host CPU and disk. Each report summarises them:

~~~bash
jq '.resource_summary, .capacity_stops' "$BENCH_CAMPAIGN/data/reports/week1-r000/report.json"
~~~

| Field | Meaning |
|---|---|
| peak_tree_rss_bytes | Highest total memory of the benchmark process tree in one sample |
| peak_chromium_rss_bytes, peak_node_rss_bytes, peak_python_rss_bytes | The same peak for each group |
| min_available_memory_bytes | Lowest host MemAvailable seen |
| peak_swap_used_bytes | Highest swap in use |
| max_host_cpu_fraction | Highest busy share of all CPUs between consecutive samples |
| process_tree_supported | false outside Linux; the other process fields are then absent |

Summed resident memory counts shared pages once per process, so Chromium's figure is an upper bound. Samples cover the whole run, not one attempt: concurrent jobs share the numbers. Use the one-browser-at-a-time limit, plus the browser rows' timestamps, when attributing Chromium peaks.

**Automatic capacity stop.** In live runs, if host available memory stays below **min_available_memory_bytes** (default 1 GiB), or host CPU stays above **max_host_cpu_fraction** (default 0.9), continuously for **pressure_seconds** (default 300), the runner:

1. stops new dispatch for the run and, in a schedule, for the parent campaign;
2. lets attempts already in progress finish or reach their deadlines;
3. records a **capacity_stop** event with the reason, duration, available memory and CPU share.

Remaining jobs become **pending**. Investigate before resuming: reduce concurrency or targets, check for runaway Chromium processes, add swap or RAM only as a recorded environment change. Then use Section 14.4. A capacity stop is a harness/host outcome and must not be reported as a provider failure.

**Keep watching anyway.** The samples are 5 seconds apart and cannot catch every spike or an OOM kill between samples. In a separate tmux session:

~~~bash
tmux new-session -s distilled-monitor
~~~

Inside it:

~~~bash
source /home/distilled-bench/benchmark-campaign/environment.sh
vmstat -t 60 | tee "$BENCH_CAMPAIGN/logs/vmstat.log"
~~~

Detach with Ctrl+B, D. Stop this monitor with Ctrl+C when finishing. Check `journalctl -k | grep -i -E 'oom|killed process'` daily.

Operational rules:

- Keep one dispatcher, at most two jobs, and one browser.
- Respect the configured disk reserve; the runner stops new work for low disk.
- Keep the memory and CPU capacity-stop defaults unless pilot evidence justifies a recorded change.
- Treat repeated missed collection slots or growing queue_ms as a capacity warning even without a stop.
- Stop manually on evidence corruption, uncontrolled billing, or a broken isolation/deadline boundary.
- Record downtime, updates, and provider incidents.

### 14.3 Stop new dispatch

For the schedule:

~~~bash
python -m bench stop --data-dir "$BENCH_CAMPAIGN/data" --run-id week1-schedule
~~~

For a standalone run:

~~~bash
python -m bench stop --data-dir "$BENCH_CAMPAIGN/data" --run-id pilot-telegram-001
~~~

Wait for the active runner to observe the stop at a checkpoint. Inspect the tmux session and process list:

~~~bash
pgrep -af 'python.*-m bench'
~~~

Stopping locally does not cancel or refund a remote actor/snapshot. Use the provider dashboard to inspect/cancel remote work where appropriate, then record evidence.

For an emergency local interrupt, use Ctrl+C in the specific runner's tmux pane. Do not kill unrelated processes. Preserve SQLite, blobs, and remote identifiers.

### 14.4 Resume a known run

After checking unresolved external work:

~~~bash
python -m bench resume --data-dir "$BENCH_CAMPAIGN/data" --run-id pilot-telegram-001
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id pilot-telegram-001
~~~

Resume can make provider calls. It resumes eligible planned/running/pending work; it does not automatically rerun completed failures or unknown submissions. Use a new versioned run for an intentional new comparison.

To clear an explicit parent stop:

~~~bash
python -m bench resume --data-dir "$BENCH_CAMPAIGN/data" --run-id week1-schedule
~~~

Then restart the original schedule command in tmux:

~~~bash
python -m bench schedule --config "$BENCH_CAMPAIGN/config/stage3.json" --run-id week1
~~~

Clearing the parent's flag alone does not launch all schedule rounds. Keep the same schedule configuration and ID; a changed schedule config is rejected. Review catch-up behavior from Section 12.9 first.

### 14.5 Recover uncertain managed submissions

If the remote job ID is already known, normal resume continues that job. If submission may have succeeded but its ID was lost, the job remains uncertain and does not automatically resubmit.

Find the original job in the provider dashboard using account, time, input, and evidence. Then:

~~~bash
python -m bench attach-remote --data-dir "$BENCH_CAMPAIGN/data" \
  --job-id REPLACE_JOB_ID --route-id REPLACE_ROUTE_ID \
  --remote-id REPLACE_ACTUAL_REMOTE_ID \
  --evidence "Original provider run matched by timestamp and input; evidence reference recorded"
python -m bench resume --data-dir "$BENCH_CAMPAIGN/data" --run-id REPLACE_RUN_ID
python -m bench process --data-dir "$BENCH_CAMPAIGN/data" --run-id REPLACE_RUN_ID
~~~

Attach-remote supports unresolved Apify/Bright Data async jobs, refuses an incompatible route, and will not overwrite an already recorded remote ID.

If recovery is impossible, independently confirm remote completion/cancellation and billing, then record a terminal resolution:

~~~bash
python -m bench resolve-job --data-dir "$BENCH_CAMPAIGN/data" \
  --job-id REPLACE_JOB_ID \
  --evidence "Remote status/cancellation and billing checked; private evidence reference"
~~~

This records resolution only; it sends no cancellation request. Direct/unknown non-async attempts cannot be recovered by attaching an unrelated remote ID.

### 14.6 Keep code and references stable

Do not update dependencies, pull new code, change actor builds, or change scoring rules inside the frozen comparison.

The runner records versions and freezes manifests, but it does not universally refuse every source-code change before replay/resume. Preserve the exact checkout operationally. Processing records its own versions; a replay with different code must be reported separately.

If a fix is necessary: stop, preserve the old report/evidence, record the change, rerun relevant offline checks, and create a new experiment ID. Preserve the same live ledger so spending remains cumulative.

## 15. Billing, scoring, and provider decisions

### 15.1 Reconcile actual charges

Get spend IDs from the full report:

~~~bash
BENCH_RUN=controlled-001
jq '.spend[] | {job,provider,reserved,actual,note}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json"
~~~

The **job** value in this spend table is the spend ID, typically a job ID plus a double underscore and route ID. Match it to the remote run and billing evidence.

After finishing/resolving the job and stopping dispatch:

~~~bash
read -r -p "Spend ID from report: " BENCH_SPEND_ID
read -r -p "Confirmed actual USD for this allocation: " BENCH_ACTUAL_USD
read -r -p "Invoice/run evidence reference: " BENCH_BILLING_EVIDENCE
python -m bench reconcile --data-dir "$BENCH_CAMPAIGN/data" \
  --spend-id "$BENCH_SPEND_ID" --actual-usd "$BENCH_ACTUAL_USD" \
  --evidence "$BENCH_BILLING_EVIDENCE"
python -m bench report --data-dir "$BENCH_CAMPAIGN/data" --run-id "$BENCH_RUN"
~~~

No value in this guide is a provider price quote. Provider-reported usage and final invoice allocation are different evidence. Leave unresolved bills unknown/reserved; never silently treat a timeout as free.

The ledger retains failed/uncertain reservations. Confirmed overages are recorded and reduce remaining budget. Manually account for subscriptions, minimums, credits, taxes, VPS/storage, and other account jobs without double counting.

### 15.2 Interpret result states correctly

| Field/value | Meaning |
|---|---|
| job status complete | The harness finished the job; its capture may still have failed |
| captured | Original payload saved; content not necessarily correct |
| failed | Attempt failed |
| pending | Recoverable work remains, potentially remote |
| uncertain | Submission/outcome needs external investigation |
| not_tested | Disabled/unavailable; not a measured loser |
| skipped_budget | Local spending allowance prevented dispatch |
| UNSCORED | No applicable quality score yet |
| processing_error | Saved evidence/extraction/normalization problem; inspect before trusting prior labels |

The CLI can exit successfully after recording failures. Inspect report states/labels; do not use process exit code as the provider success rate.

### 15.3 Article quality

| Label | Interpretation |
|---|---|
| PASS | Accepted and meets implemented body/title/anchor/date/identity requirements |
| PARTIAL | Accepted but incomplete or fails some quality checks |
| FAIL | Acquisition/processing failed or response validator rejected |
| FALSE_SUCCESS | Validator accepted, but independent evidence shows major wrong content/identity |
| AUTO_UNVERIFIED | Accepted without independent reference |
| AUTO_FAIL | Rejected without independent reference |
| SOURCE_CHANGED | Independently established source revision; exclude static-body comparison |

The current PASS rules include body/title token F1 >= 0.90, required anchors in order, no labelled boilerplate, accepted URL identity where supplied, and publication-date agreement.

F1 combines retained expected text and unwanted added text. Report precision/recall separately: missing paragraphs and injected navigation are different defects.

The implemented minute tolerance is +/-5 minutes; hour precision permits an absolute difference up to one hour, and day precision compares date strings. These are code behaviors, not a guarantee of identical publisher-local-day interpretation across timezones. Normalize and manually review reference precision consistently.

Numeric article report gates require at least 30 unique non-calibration, repetition-zero verified inputs, >=80% PASS, >=85% lower Wilson bound for PASS+PARTIAL, zero observed gold false successes, and p95 collection-plus-processing <=30 seconds.

Those gates are generated per route/task/extractor group. A passing cross-domain group is not proof that every domain passes. Examine domain/language/category subgroups and extend independently labelled samples for shortlisted domains.

### 15.4 Source and discovery quality

Measure:

- Known expected eligible IDs found / independently known eligible IDs.
- Correct required text, date, URL, media, and link fields.
- Extra/duplicate IDs and missing identity.
- Raw records versus retained normalized records.
- Cap hits, outside-window records, missing dates, and partial provider errors.
- Publication age and separately observed first-detection delay.

The source scorer distinguishes SOURCE_UNVERIFIED, SOURCE_VERIFIED_SAMPLE, and SOURCE_COVERAGE_ONLY. A complete reference with sufficiently correct items can earn PASS; an ID-only reference cannot earn a content-quality PASS.

Freeze provisional source targets before evaluation: >=95% known-window recall, >=95% required-field correctness, no wrong-source identity or invented dates, and no duplicate records in the defined replay comparison. Apply field-specific checks too; a high aggregate must not hide unusable references.

These are experiment goals. The current report does not automatically implement a complete production-style importer or every source-level gate.

For open-ended query discovery, measure reviewed relevance and documented coverage. Do not invent a total-recall denominator.

Publication time subtracted from collection time is **publication age**. True first-detection delay needs an independent first-seen/event log across runs. The benchmark does not maintain a universal cross-run first-seen item inventory.

### 15.5 Compare costs fairly

~~~text
Cost per correct article
  = all allocated charges in the fully evaluated cohort / distinct PASS results

Cost per useful unique post
  = all allocated charges in the evaluated cohort / correct useful unique posts

Fallback rescue
  = verified recovered results / detected primary failures where fallback ran
~~~

Include failures, timeouts, pages, polling, and repeated-item charges. Do not divide an entire unlabelled campaign bill by only a small manually reviewed sample's successes.

**What each report computes.** Costs are split three ways and never mixed silently:

| Field | Meaning |
|---|---|
| provider_actual_usd | Charges confirmed with **reconcile**. Unpaid routes are reconciled to 0 automatically. |
| provider_unreconciled_reserved_usd | Ceilings still reserved for dispatched paid work. A **bound**, not a cost. |
| server_allocated_usd | The VPS share each attempt used (below). |

**Server allocation (slot time).** The report converts **costs.server_monthly_usd** to an hourly rate (730 hours per month), divides by the configured concurrency (two slots), and charges each attempt its active acquisition time plus its extraction or normalization time. Queue time and idle time between rounds are not charged to any candidate. Report that idle remainder in the campaign total rather than inflating per-candidate numbers. The method and hourly slot rate appear in **cost_model**.

**Cost per usable result** is computed per route/task/extractor group, over the independent verified cohort: unique unseen, non-calibration, first-repetition inputs with independent references, not source-changed. Usable means PASS plus PARTIAL.

| cost_status | cost_per_usable_result_usd | What to do |
|---|---|---|
| RECONCILED | (provider actual + server allocation) / usable results | Use it for decisions |
| UNRECONCILED_PROVIDER_CHARGES | not reported | Reconcile the listed spend IDs (Section 15.1); **cost_per_usable_result_upper_bound_usd** shows the worst case meanwhile |
| SERVER_COST_NOT_CONFIGURED | not reported | Set costs.server_monthly_usd and regenerate the report |
| NO_USABLE_RESULTS | not reported | Report "no usable results" with the total cost, never a zero unit cost |

Regenerating after reconciliation needs no new collection:

~~~bash
python -m bench report --data-dir "$BENCH_CAMPAIGN/data" --run-id "$BENCH_RUN"
jq '.groups | to_entries[] | {group: .key, cost_status: .value.cost_status, usable: .value.usable_results, per_usable: .value.cost_per_usable_result_usd, upper_bound: .value.cost_per_usable_result_upper_bound_usd}' \
  "$BENCH_CAMPAIGN/data/reports/$BENCH_RUN/report.json"
~~~

Provider charges count once per attempt, even though an article produces one row per extractor. Matched cohorts in **matched_cohorts.KIND.pairwise** carry the same three cost fields for paired comparisons.

For source families, cost per usable result is per verified window-level result. Compute cost per distinct correct post from the checked item inventory where that is the decision metric. Add subscriptions, minimum charges, credits and taxes that no single run shows, without double counting, and record the allocation.

### 15.6 Select per source/domain

Prefer candidates meeting required quality and operational conditions, then compare useful-result cost, latency, and demonstrated maintenance effort.

Use **adopt for tested scope**, **provisional**, **does not meet requirements**, **not tested**, or **insufficient evidence**. Record sample size and uncertainty.

Zero wrong results in a small sample does not prove a population error rate below 1%. Repeated URLs are correlated; do not count each repeat as an independent success. Expand evidence rather than forcing a winner.

## 16. Back up, restore, and download results

### 16.1 Create a consistent private backup

Stop the scheduler, wait for its process to exit, and ensure no manual run/process/reconcile operation is writing. Inspect remote work separately; a local backup does not cancel it.

The following creates a new dated backup, copies the evidence/configuration tree, and uses SQLite's backup API. It excludes API credentials and Telegram sessions.

~~~bash
python - <<'PY'
import hashlib, json, os, shutil, sqlite3
from datetime import datetime, timezone
from pathlib import Path
root = Path(os.environ["BENCH_CAMPAIGN"])
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
dest = root / "backups" / ("evidence-" + stamp)
dest.mkdir(parents=True, exist_ok=False)
for name in ("config", "gold", "reference-snapshots", "daily", "reports", "logs"):
    shutil.copytree(root / name, dest / name)
shutil.copytree(root / "data", dest / "data",
    ignore=shutil.ignore_patterns("benchmark.sqlite", "benchmark.sqlite-wal",
                                 "benchmark.sqlite-shm", "*.lock"))
source = sqlite3.connect((root / "data/benchmark.sqlite").as_uri() + "?mode=ro", uri=True)
target = sqlite3.connect(dest / "data/benchmark.sqlite")
source.backup(target)
target.close()
source.close()
shutil.copy2(root / "environment.sh", dest / "environment.sh")
manifest = {}
for path in sorted(dest.rglob("*")):
    if path.is_file():
        with path.open("rb") as stream:
            manifest[str(path.relative_to(dest))] = hashlib.file_digest(stream, "sha256").hexdigest()
(dest / "checksums.json").write_text(json.dumps(manifest, indent=2))
print(dest)
PY
~~~

Do not copy only an active SQLite main file while ignoring its WAL. The API creates a consistent database copy, and stopping writers ensures the associated blob/report copies match the same operational checkpoint.

Keep raw-content backups private. Store session/credential backups separately in the agreed private secret-storage process.

### 16.2 Verify the backup

~~~bash
read -r -p "Full backup directory printed above: " BENCH_BACKUP_DIR
export BENCH_BACKUP_DIR
python - <<'PY'
import hashlib, json, os, sqlite3
from pathlib import Path
root = Path(os.environ["BENCH_BACKUP_DIR"]).resolve()
checks = json.loads((root / "checksums.json").read_text())
for relative, expected in checks.items():
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise SystemExit("Unexpected path in backup manifest")
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        raise SystemExit("Hash mismatch: " + relative)
db = sqlite3.connect((root / "data/benchmark.sqlite").as_uri() + "?mode=ro", uri=True)
print("SQLite:", db.execute("PRAGMA integrity_check").fetchone()[0])
db.close()
print("Verified files:", len(checks))
PY
~~~

As a restore exercise, copy the backup into a new empty inspection directory and regenerate a report with **--data-dir RESTORED_PATH/data** for a known run. Inspect a restored raw artifact. Do not run **resume** as a restore test: that can call providers.

Keep the frozen code/dependency record alongside the data. Resuming real collection from a restored location needs deliberate path/account reconciliation; it is not part of checksum verification.

### 16.3 Package a reviewed report bundle

Generated reports include source URLs, text, and potentially personal content. Create an export directory containing only the material reviewed for the intended audience.

~~~bash
mkdir -p "$BENCH_CAMPAIGN/export-reviewed"
nano "$BENCH_CAMPAIGN/export-reviewed/README.md"
~~~

Copy the approved human reports and selected summary CSVs into that directory. Inspect for tokens, private URLs, unnecessary personal fields, and raw content that should remain private.

~~~bash
tar -czf "$BENCH_CAMPAIGN/report-bundle.tar.gz" -C "$BENCH_CAMPAIGN/export-reviewed" .
cd "$BENCH_CAMPAIGN"
sha256sum report-bundle.tar.gz > report-bundle.tar.gz.sha256
~~~

This summary bundle is not the full raw-evidence backup.

### 16.4 Download to Windows

**Windows PowerShell:**

~~~powershell
$BenchServer = Read-Host "VPS IP or hostname"
$BenchSshPort = Read-Host "SSH port"
$BenchKey = Join-Path $env:USERPROFILE ".ssh\distilled_bench"
$BenchDownload = Join-Path $env:USERPROFILE "Downloads\distilled-benchmark"
New-Item -ItemType Directory -Force -Path $BenchDownload | Out-Null
$BenchRemote = "distilled-bench@" + $BenchServer + ":/home/distilled-bench/benchmark-campaign/"
scp -P $BenchSshPort -i $BenchKey ($BenchRemote + "report-bundle.tar.gz") $BenchDownload
scp -P $BenchSshPort -i $BenchKey ($BenchRemote + "report-bundle.tar.gz.sha256") $BenchDownload
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $BenchDownload "report-bundle.tar.gz")
Get-Content -LiteralPath (Join-Path $BenchDownload "report-bundle.tar.gz.sha256")
~~~

The hashes must match. To transfer a full private evidence backup, separately archive the verified dated backup directory and transfer it to the agreed private destination with the same checksum procedure.

Take daily off-VPS backups during the campaign, space permitting, and verify a sample restore. Local backups consume the same VPS disk and do not protect against loss of that server.

## 17. Final report and completion checklist

### 17.1 Final report structure

Create **reports/FINAL_EXTERNAL_TESTING_REPORT.md**:

1. Objective and tested scope.
2. Machine, egress, code/dependency versions, and experiment dates.
3. Every candidate, account limitation, build, input, and not-tested reason.
4. Dataset languages/domains, reference method, calibration split, and uncertainty.
5. Stage 1 pilot findings and corrections.
6. Stage 2 controlled quality, metadata, fault, and recovery results.
7. Stage 3 actual cadence, expected/completed observations, downtime, and new-content results.
8. Per-source/domain quality, coverage, timing, and resource tables.
9. Actual billing, unreconciled costs, and recurring-cost assumptions.
10. Actual fallback evidence and undetected primary errors.
11. Primary/fallback decisions, unsupported behavior, and further experiments.
12. Private evidence locations, backup/restore verification, and retention date.

Decision table:

| Source/domain/task | Primary/version | Fallback/trigger | Verified quality | Coverage limits | Timing | Useful-result cost | Evidence size | Decision |
|---|---|---|---|---|---|---|---|---|
| Separate required task | Measured choice | Tested or none | Measured | Explicit | Measured | Reconciled/unknown | Unique inputs/windows | Adopt/provisional/gap |

Include separate rows for websites by required domain/category, RSS parsing, Google News, Telegram, X profiles, X search, LinkedIn companies, LinkedIn profiles, official LinkedIn's authorized subset, and each generic actor. Include GDELT as optional/not tested unless actually implemented and measured.

VPS measurements establish VPS behavior. The external report can describe a recommended integration path, but it does not prove Cloudflare Worker egress, D1/Queue reliability, production retention, or whole-application capacity. Browser and Telethon runtime requirements need their own later integration review.

### 17.2 Final checklist

- [ ] Server access/configuration and exact experiment commit recorded.
- [ ] Offline suite, demo, fault smoke gate, and `server-check` passed on the VPS; results saved.
- [ ] Both browser variants measured separately, or each marked not tested with the reason.
- [ ] Egress firewall verified (and its hash recorded) before browser_standard was enabled.
- [ ] costs.server_monthly_usd set from real evidence; every decision group's cost_status is RECONCILED.
- [ ] Every scored source window has a reference whose window matches (reference_window_error null); rounds without one are counted and reported as samples.
- [ ] Process-tree resource peaks and any capacity stops reported.
- [ ] Account access, schemas, and spending bounds recorded for each enabled candidate.
- [ ] Independent references and unknown coverage are explicit.
- [ ] Every pilot output inspected; fixes preserved as new versions.
- [ ] Controlled unseen cohort kept separate from calibration and repeats.
- [ ] Raw versus normalized losses reviewed for every source.
- [ ] Seven-day observation span and actual cadence reported accurately.
- [ ] Pending, uncertain, missed, disabled, and budget-skipped work accounted for.
- [ ] Required source-specific fallback trials completed or identified as gaps.
- [ ] Bills reconciled, unknown charges retained, VPS/storage allocation documented.
- [ ] Decisions supported by source/domain-specific evidence and uncertainty.
- [ ] Report bundle reviewed, copied off VPS, and checksum verified.
- [ ] Full private evidence backed up and a sample restore checked.
- [ ] Agreed raw-data retention/deletion date and owner recorded.

Raw benchmark artifacts do not inherit the production app's default news-retention period. Choose and record a research retention policy. There is no automatic campaign cleanup in this guide.

## 18. Troubleshooting

| Symptom | Check and next action |
|---|---|
| SSH times out | Server running, actual port, provider firewall, local connectivity |
| SSH permission denied | Correct user/key, public key placement, authorized_keys ownership/mode |
| Host fingerprint changed | Verify with trusted console; do not blindly remove the old key |
| Python version too old | Use isolated managed Python; inspect which interpreter is active |
| Node syntax/TypeScript import error | Node 24+ on PATH and complete repository checkout |
| Readability missing | Run npm ci --prefix node from benchmark package |
| Python pin cannot install | Save exact failure; resolve platform/version mismatch, freeze change, rerun checks |
| Browser executable absent | Same PLAYWRIGHT_BROWSERS_PATH for install and collection |
| unshare denied / user_network_namespace NOT_READY | Ubuntu AppArmor restricts unprivileged namespaces; leave the isolated browser not tested and use browser_standard behind the egress firewall, or get a scoped administrator exception (Section 6.4) |
| Config rejected: "Confirm the host egress firewall" | browser_standard enabled in live mode before Section 4.5 was verified |
| Firewall test times out instead of "Connection refused" | nft rule not loaded or wrong user; `sudo nft list table inet distilled_bench_egress` and check meta skuid |
| DNS fails for the benchmark user after firewall | Resolver lives in a blocked range; add an accept rule for that resolver before the reject lines |
| Preflight NOT_READY: server_cost | Set costs.server_monthly_usd to the actual monthly VPS price |
| Preflight NOT_READY: reference_window | Rolling schedule still has a fixed complete source reference; remove it and use per-round references (Section 12.3) |
| Source label SOURCE_VERIFIED_SAMPLE despite complete reference | Check reference_window_error; set window to the printed collection_window |
| Report cost_per_usable_result_usd is null | Read cost_status: reconcile bills, configure server cost, or there were no usable results |
| Run stopped by itself, capacity_stops not empty | Sustained low memory or high CPU; inspect resource_summary before resuming (Section 14.2) |
| resource_summary lacks process-tree fields | Not Linux, or /proc unreadable; run server-check |
| Preflight ready but no requests | Check enabled_routes and planned job flags; zero enabled routes can be ready |
| Preflight ready but provider rejects | Preflight does not contact providers; inspect access/schema/product evidence |
| REPLACE or missing-template error | Replace every active target and provide the referenced option |
| Unknown adapter / --data rejected | Using ZIP commands/config against repository implementation |
| Paid route validation fails | Positive ceiling, correct provider budget, confirmation flag, schema where required |
| Budget exhausted early | Prior runs and unreconciled failed/uncertain reservations consume allowance |
| Apify run succeeds but no usable items | Inspect raw dataset, cap, schema, and actual application normalizer loss |
| Bright Data response shape mismatch | Confirm async trigger/progress/snapshot product compatibility |
| Google dates disappear | Inspect raw date evidence and rejected undated-item counts |
| Source reference validates but no PASS | Inspect SOURCE_COVERAGE_ONLY and missing text/date evidence |
| Duplicate run ID | Resume original work or use a new ID for a new experiment |
| A dispatcher owns the directory | Inspect active runner; do not delete lock files to bypass an OS lock |
| Report says complete with FAIL rows | Complete is orchestration status, not content success |
| Report UNSCORED | Run process; inspect absent references and failed processing |
| Report has stale/missing output | Inspect processing_error and artifact hashes; restore verified evidence, process again |
| Source results became wrong next day | Old window reference reused, actor dates static, cap insufficient, or actual drift |
| Freshness seems excellent | Verify whether metric is publication age instead of real first-detection delay |
| Resume appears to do nothing | Completed failures/uncertain jobs are not blindly retried; inspect state |
| Many rounds start after restart | Scheduler catches up past-due rounds; review temporal validity/budget |
| Changed schedule rejected | Original schedule manifest is frozen; restore it or start a versioned new campaign |
| Daily target file ignored | Child already existed, wrong round filename/path, or no valid additions |
| Long source jobs delay all work | Reduce roster/cadence during readiness; report queue delay separately |

## 19. Command reference and implementation boundaries

### 19.1 Implemented CLI commands

Run from the benchmark directory with its Python environment active.

| Command | Inputs | External calls? |
|---|---|---|
| preflight | --config | No; local readiness checks |
| server-check | --config | No acquisition requests; checks host runtime, disk, memory, process-tree measurement, secret file modes, namespaces, and launches Chromium on inline HTML for enabled browser variants |
| plan | --config, optional --output | No; standalone jobs for one run |
| validate-gold | --config | No |
| compare-gold | --first, --second | No |
| faults | optional --output | Mock transport; 21-case smoke gate, not a substitute for pytest |
| fetch | --config, --run-id | Yes in live mode; article targets |
| collect | --config, --run-id | Yes in live mode; source targets |
| run | --config, --run-id | Yes in live mode; both |
| chains | --config, --run-id | Yes in live mode; article chains only |
| schedule | --config, --run-id | Yes in live mode; one interval, frozen child runs |
| extract / normalize / score / process | --data-dir, --run-id | No; saved evidence only |
| report / status | --data-dir, --run-id | No; regenerate local reports |
| stop | --data-dir, --run-id | No cancellation API call |
| resume | --data-dir, --run-id | May call providers to recover eligible work |
| attach-reference | --data-dir, --run-id, --target-id, --reference | No; prints the run's collection_window and reference_window_error |
| discover | --data-dir, --run-id, --limit, --output | No; saved RSS/Google candidate URLs |
| attach-remote | --data-dir, --job-id, --route-id, --remote-id, --evidence | No; records verified remote identity |
| resolve-job | --data-dir, --job-id, --evidence | No; records externally verified resolution |
| reconcile | --data-dir, --spend-id, --actual-usd, --evidence | No; records checked billing |
| telegram-login | --credentials-file | Yes; interactive account authorization |

Use **python -m bench --help** and **python -m bench COMMAND --help** to confirm the interface on the actual experiment commit.

### 19.2 What needs operator evidence or additional implementation

| Capability | Current boundary |
|---|---|
| Provider/account availability and exact billing | Requires account checks and live evidence |
| Automatic robots.txt handling | Not in the current repository collector |
| GDELT | ZIP-only candidate; current CLI has no adapter |
| Mixed per-source cadence in one schedule | Not provided; use supported uniform/subset campaigns or add tested orchestration |
| Automated source fallback/cooldown | Article chains implemented; source policy orchestration needs separate work |
| Universal incremental cursor/import ledger | Not implemented across all source rounds |
| Cross-run RSS conditional cache | Current cache is run-scoped |
| Complete edit/deletion/media/link tracking | Must measure raw/normalized fields and unsupported cases |
| First-seen/detection delay across rounds | Requires an independent event/observation inventory |
| Resource measurement | Process tree (Python, Node, Chromium) sampled every 5 seconds on Linux with an automatic memory/CPU capacity stop; spikes between samples and OOM kills need host monitoring |
| Per-attempt resource attribution | Samples are run-level; concurrent jobs share them |
| Provider-side cancellation on stop | Not sent; stop retains remote jobs for reconciliation |
| Isolated browser on hosts that restrict namespaces | Not available without an administrator exception; browser_standard is the measured alternative |
| Standard browser byte limit | Checked after each response completes, so one oversized response can exceed it before detection |
| Daily/per-stage monetary cap | Cumulative total/provider ledger exists; stage allocation needs explicit control |
| Universal provider-side hard dollar cap | Local ceiling does not enforce every provider's bill |
| Public provider-fault website | Mock faults exist; reachable fixture hosting is separate |
| Automatic whole-campaign statistical aggregation | Per-run reports exist; aggregate matched unique cohorts deliberately |
| Production Cloudflare verification | Outside this external campaign |

### 19.3 Further references

Use this file as the start-to-finish operating sequence. Other repository documents provide background and may contain older proposal/status sections:

- [Current executable benchmark README](../evaluation/acquisition-benchmark/README.md)
- [Three-stage source testing plan](SCRAPER_TESTING_STEPS.md)
- [Detailed evaluation/scoring methodology](SCRAPER_AND_API_EVALUATION_PLAN.md)
- [VPS operations and alternative systemd layout](../evaluation/acquisition-benchmark/ops/README.md)
- [Actual configuration validation](../evaluation/acquisition-benchmark/bench/config.py)
- [Actual CLI and scheduling behavior](../evaluation/acquisition-benchmark/bench/cli.py)
- [Actual adapter protocols](../evaluation/acquisition-benchmark/bench/adapters.py)
- [Actual source normalization](../evaluation/acquisition-benchmark/bench/processing.py)
- [Actual scoring](../evaluation/acquisition-benchmark/bench/score.py)

External setup/protocol sources were checked while preparing this document. Recheck account schemas, supported software/OS combinations, API versions, and prices immediately before live testing. This guide supplies no assumed provider prices or ready-made production credentials.
