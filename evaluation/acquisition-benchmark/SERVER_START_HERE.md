# Start the standalone server benchmark

Use the `testing-api-scrapers` branch in its own checkout. There is no web dashboard or frontend build for this experiment. Do not merge it into `frontend-ui`. These commands assume the fixes have first been committed and pushed to `testing-api-scrapers`.

## 1. Prepare the server

Connect using your actual SSH account and address. On the Linux server, run as a dedicated, unprivileged benchmark user. Use the administrator steps in [EXTERNAL_TESTING_A_TO_Z.md](../../documentation/EXTERNAL_TESTING_A_TO_Z.md) sections 3–5 to set up that account, Python 3.12+, Node 24+, OS dependencies, and browser network controls. Do not enable the standard browser until the guide's egress firewall has been installed and verified. The isolated browser requires working user/network namespaces.

In that user's terminal, from the directory where you keep test checkouts:

```bash
git clone --branch testing-api-scrapers --single-branch https://github.com/AmmarMohanna/distilled.news.git distilled-scraper-testing
cd distilled-scraper-testing
git rev-parse HEAD
cd evaluation/acquisition-benchmark
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -c constraints.txt -e '.[dev,sources,extract,browser]'
python -m pip check
npm ci --prefix node --ignore-scripts --no-audit --no-fund
sudo "$PWD/.venv/bin/python" -m playwright install-deps chromium
python -m playwright install chromium
```

Record the commit ID and environment for the campaign. If the checkout already exists, inspect `git status` and use `git pull --ff-only` on its testing branch before starting an experiment. Do not update code mid-campaign. For a systemd deployment, use the guide's explicit browser-cache location instead of the interactive default above.

## 2. Run offline checks first

Run one command at a time and resolve failures before continuing:

```bash
python -m pytest
python -m bench faults
python -m bench preflight --config configs/offline-demo.json
python -m bench server-check --config configs/offline-demo.json
python -m bench run --config configs/offline-demo.json --run-id demo1
python -m bench process --data-dir data/demo --run-id demo1
less data/demo/reports/demo1/report.md
```

Use a new run ID if `demo1` exists; do not delete previous evidence. Offline fixtures do not contact acquisition providers or establish provider performance. Browser `server-check` still needs the actual Linux/browser prerequisites. Its inline page checks startup, not live website coverage.

Open this folder using VS Code Remote SSH, then open `data/demo/reports/demo1/report.md` (Markdown preview: Ctrl+Shift+V). `report.json` contains detailed evidence and `attempts.csv` opens in a spreadsheet. There is no localhost URL to visit.

## 3. Configure a small live pilot

```bash
mkdir -p "$HOME/.config/distilled-bench"
chmod 700 "$HOME/.config/distilled-bench"
```

If no credentials file exists yet, create it privately without overwriting an existing one:

```bash
test -e "$HOME/.config/distilled-bench/credentials.env" || (umask 077; cp credentials.env.example "$HOME/.config/distilled-bench/credentials.env")
chmod 600 "$HOME/.config/distilled-bench/credentials.env"
nano "$HOME/.config/distilled-bench/credentials.env"
test -e configs/stage1.local.json || cp configs/stage1-pilot.json configs/stage1.local.json
nano configs/stage1.local.json
```

In `stage1.local.json`:

- Add `credentials_file` with the full absolute credentials path. Keep `data_dir` as `../data/live` to use the paths below.
- Set `costs.server_monthly_usd`, `budget.total_usd`, and the provider budgets to your actual figures.
- Enable only the routes selected for the pilot; all start disabled. Set confirmed whole-job price ceilings, actor/dataset inputs, account/schema confirmations and browser settings as described in the main README. Local reservations are not provider billing caps.
- Replace the example targets. Use matching collection windows and filters, and independently checked reference files. Do not copy synthetic fixture answers as live references.
- If testing Telegram's API, use the README's `telegram-login` command first and retain its session privately.

Then:

```bash
python -m bench preflight --config configs/stage1.local.json
python -m bench server-check --config configs/stage1.local.json
python -m bench validate-gold --config configs/stage1.local.json
python -m bench plan --config configs/stage1.local.json --output data/stage1-plan.json
```

Inspect `data/stage1-plan.json`: real inputs, enabled candidates, job count, and maximum provider reservations. Resolve NOT_READY checks and reference errors. A pilot can collect evidence before complete labels exist, but unverified results cannot establish a winner.

## 4. Run the live pilot

The following `run` contacts the configured sites/providers and may incur charges:

```bash
python -m bench run --config configs/stage1.local.json --run-id pilot1
python -m bench process --data-dir data/live --run-id pilot1
less data/live/reports/pilot1/report.md
```

Open `data/live/reports/pilot1/report.json` and `attempts.csv` to inspect each result. Raw saved blobs are under `data/live/blobs`; use the artifact references in the report rather than guessing a filename. Inspect X `links`, expanded `media`, and `unresolved_media_keys`, plus `resource_summary_by_phase` for acquisition versus extraction/normalization.

Reconcile provider charges with `python -m bench reconcile` using each actual spend ID, invoice amount and evidence (main README). Do not interpret a timeout as free. Then account for the entire experiment, including all runs and idle VPS time:

```bash
read -r -p 'Total VPS cost allocated to this campaign (USD, including idle time): ' BENCH_SERVER_TOTAL
read -r -p 'Billing period, invoice and allocation evidence: ' BENCH_SERVER_EVIDENCE
python -m bench campaign-costs --data-dir data/live --server-total-usd "$BENCH_SERVER_TOTAL" --server-cost-evidence "$BENCH_SERVER_EVIDENCE"
less data/live/reports/campaign-costs/report.md
```

Use the main README's Stage 2 and Stage 3 workflow only after inspecting the pilot and correcting provider-specific issues. Those configurations require their own targets, budgets and window-matched references. No production Cloudflare deployment is involved.
