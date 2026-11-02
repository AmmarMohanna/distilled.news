# Continuous briefing-quality evaluator

Separate Cloudflare Worker for **distilled-news-staging**. It does not deploy or
modify the application Worker. SOURCE_DB is used exclusively by the SELECT-only
source adapter; Cloudflare D1 bindings themselves do not enforce read-only access.

Every five minutes, Cron discovers published editions since `ENROLL_FROM`, records
idempotent jobs in its own D1, and queues evidence collection. The queue freezes
the complete historical V3 admission set, including uncited articles, historical
feed interests, requested language, reporting window and actual prior reader text
in private R2. The evaluated reader text comes from the immutable published edition.
Missing frozen inputs/history and unsupported engine versions are unassessable.
Incomplete or unlabelled source bodies stay visibly uncertain. Coverage is against
the retained V3 input set, not proof that acquisition found all real-world news.

## Review protocol

1. Deterministic checks run independently of paid review: source completeness,
   citation identities, exact duplicate reader items and publication state.
2. A separate judge call identifies important developments from all eligible
   retained sources, feed intent and prior publications **without seeing output**.
3. The second call extracts atomic output claims and labels each supported,
   contradicted, unsupported or uncertain. It assesses actual citations, matches
   the fixed developments to coverage, and assesses relevance, repetition, temporal
   treatment and language separately. Exact evidence excerpts and ownership are
   mechanically checked. Embedded article instructions remain untrusted data.
4. Reports retain model/protocol versions, input/inventory hashes, claims,
   evidence excerpts, omissions, findings, limitations and metric denominators.
   An AI finding is a potential issue requiring verification, not a confirmed error.
   No automatic editing, deletion, publication or reader-memory updates occur.

The reviewer currently uses GPT-4.1 in a distinct review process. It shares a model
family with the editor; this is not statistical independence or human calibration.
Claim extraction and inventory completeness also require independent validation.

## Budget and recovery

Only continuous review uses this D1 ledger: **$5 per UTC day**, 100 calls/day,
6,000 output tokens/call. The estimate reserves a conservative UTF-8 byte bound
plus overhead at configured provider price ceilings before any send. One atomic
D1 admission statement coordinates concurrent consumers. Full evidence that does
not fit the configured 350 KB request ceiling is refused, never silently truncated.
Actual provider costs are retained even for malformed/truncated review outputs.

Transport errors, missing usage/cost, and ambiguous outcomes preserve the reserve
and fence new sends, including across days. There is no automatic transport retry.
Actual over-reservation charges are recorded and fence further work. Admission is
a spending control; it cannot guarantee a provider never misreports or overcharges.
Set a dedicated provider-key spending limit as an additional external control.

Jobs deferred by the budget remain visible and eligible on subsequent ticks.
Settled identical stage responses can be reused without another charge. A crashed
paid job becomes `interrupted_unknown`, not passed or silently retried. Safe manual
resume is limited to interrupted/deferred jobs with no unresolved provider calls.
Never delete a RESERVED/UNKNOWN/OVERAGE ledger row to bypass its fence: verify the
provider receipt, retain that evidence privately, and reconcile its actual outcome
with the operator before resuming. Schema-invalid settled reviews remain failures.

Scheduling balances completed reviews across language/feed groups, then processes
oldest work. All newly discovered briefings are eligible; this is not a guarantee
of 100% review within $5/day. Discovery paginates and repeatedly sweeps stable IDs;
coverage denominators count discovered jobs. Check sweep completion and freshness
before interpreting coverage as applying to all publications.

## Deployment and access

Project-local commands, run from the repository root:

```powershell
node apps/worker/node_modules/wrangler/bin/wrangler.js types evaluation/briefing-quality/worker/worker-configuration.d.ts --config evaluation/briefing-quality/worker/wrangler.jsonc --include-runtime false --strict-vars false
python evaluation/briefing-quality/continuous.py
node apps/worker/node_modules/wrangler/bin/wrangler.js deploy --config evaluation/briefing-quality/worker/wrangler.jsonc --dry-run
```

Dedicated resources are already provisioned in account
`e32b564514d4f9b9e383b7dd30dbb026`; resource IDs are in wrangler.jsonc. Apply
migrations only to **EVAL_DB**, never SOURCE_DB. Do not reuse the experimental
replay ledger, application account reservations, or source collection budget for
monitoring. The user explicitly authorized the existing OpenRouter key for this
Worker; its provider key is shared, while the evaluator's ledger remains separate.
No generation/academic calls exist in this Worker.

The deployed dashboard is:
https://distilled-briefing-quality.distillednews-platform.workers.dev/

Access tokens generated specifically for this evaluator are in ignored
`../private/evaluator-access.json`. Enter DASHBOARD_TOKEN in the dashboard login.
The token is kept in page memory, never cookies, URLs or browser storage. Private
responses are uncached, text is escaped, and a restrictive CSP prevents source
HTML execution. METRICS_TOKEN authorizes only aggregate `/metrics`, not evidence.
Use `setup-access.mjs --apply` to provision/rotate these evaluator-only credentials;
it never reads other application/account credentials or prints token values.

**LLM review is enabled; the existing key was installed with the user's approval.**
For a fresh self-hosted deployment, install an authorized model key first
with interactive secure input (never paste a key into a commit or chat):

```powershell
node apps/worker/node_modules/wrangler/bin/wrangler.js secret put EVALUATION_OPENROUTER_KEY --config evaluation/briefing-quality/worker/wrangler.jsonc
```

Then set `EVALUATION_ENABLED` to `true` in that Worker's vars and deploy its config.
The user authorized $5/day monitoring; no further experiment authorization follows
from that. The dashboard's “Collect new briefings” button only initiates discovery
and asynchronous queueing, using the currently configured enablement and budget.

```powershell
node evaluation/briefing-quality/worker/smoke.mjs --collect
```

This verifies auth boundaries, triggers a discovery page, and prints aggregate
status only. Its retained smoke record is private. Do not upload raw reports,
tokens or source snapshots as public GitHub artifacts.

## Grafana

Two supported paths, with no new hosting service:

- Direct Worker OTLP push to the existing staging Grafana endpoint. Set the
  evaluator's `GRAFANA_OTLP_AUTH` secret securely and enable `GRAFANA_EXPORT_ENABLED`.
  Alternatively set the existing `GRAFANA_OTLP_BASE_URL`,
  `GRAFANA_OTLP_INSTANCE_ID` and `GRAFANA_INGEST_TOKEN` secrets; the Worker constructs
  HTTP Basic authorization itself. Base URL usually ends in `/otlp`.
  Destination host/path are allowlisted; redirects, partial rejection, oversized
  payloads and arbitrary metric labels are refused. Failed exports do not change
  publication or review status and are visible in the private summary.
- An **existing** Alloy collector can scrape authenticated `/metrics`; see
  observability/alloy.example. Use one ingestion path to avoid duplicate series.

Import observability/dashboard.json into the existing private Grafana folder and
select the existing Prometheus datasource. observability/alerts.yml provides
monitor staleness, unknown costs, incomplete assessment and potential-issue rules.
These files do not import themselves or configure notification contact points.
Grafana credentials/import and end-to-end ingestion need separate verification;
an available metrics endpoint does not prove Grafana receives it.

Grafana gets aggregate counts, numerators/denominators, language, fixed job states,
freshness and cost/holds. No user/feed IDs, articles, prompts, URLs or claim text.
Partial-evidence cases are excluded from full-evidence recall aggregates. No-data
and zero denominators must remain unknown, never 100% or healthy by default.

## Retention and scientific evaluation

Evidence/reports are private for 90 days. Cron removes expired artifacts for
terminal/deferred jobs without unresolved charges, while retaining aggregate job
and ledger metadata. Expired unreviewed jobs become `unreviewed_expired`. Unknown
financial evidence is deliberately held for operator reconciliation; it is not
deleted just because the normal retention period elapsed.

The separate Python `quality.py` supports paired comparisons with one shared
output-blind inventory and identical frozen sources/history. Existing replay.ts
runs the actual V3 core and single-LLM baseline under an **independent approved
experiment manifest and budget**. No experiment is activated by monitoring.
All-headline and keyword offline baselines, held-out split stewardship, human
review protocols and participant analysis remain in the parent evaluation toolkit.

Human calibration requires real independent adjudicated labels on assessment units
defined independently of judge-extracted claims. Use representative English/Arabic
and French when evaluating that language, include correct and deliberately flawed
cases, and report TP/FP/FN/TN, precision, recall, false alarms, missed problems and
agreement separately by language/dimension. Operator triage is not human gold.

```powershell
python evaluation/briefing-quality/quality.py calibration PRIVATE_REAL_HUMAN_LABELS.json
python evaluation/briefing-quality/quality.py aggregate PRIVATE_MACHINE_REPORTS.json
```

The toolkit cannot manufacture actual human judgments, participants, factual
accuracy, scientific improvements, or live-provider results. Those remain measured
only when the corresponding authorized experiments and independent reviews occur.
