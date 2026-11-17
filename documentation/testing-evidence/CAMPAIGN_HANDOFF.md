# Combined Stage 2 / Stage 3 handoff

Prepared 2026-09-26. User requested setup now and live testing after resetting usage. User subsequently reset usage and authorized live execution. No scheduled service has been enabled.

## Agreed scope

Use `evaluation/acquisition-benchmark/configs/combined-campaign.json`: 30 articles, 120 RSS entries, 60 Google News results, 60 Telegram posts, 100 X posts and 40 LinkedIn posts = 510 requested items before overlap. Approximately 100 independent original-source reviews, plus investigation of all detected failures. Media is excluded. This reduced cohort does not satisfy every gate of the original 45-article plan; preserve calibration/unseen distinctions and report insufficient evidence where applicable.

The campaign manifest is an explicit preparation checklist, not a completed reference dataset. Exact expanded target URLs and independent references remain to be selected and frozen. Family statuses are pending deliberately. Existing pilots are evidence and debugging material, not automatically unseen Stage 2 data.

## Automation prepared

`scripts/campaign_batch.py` prints the plan without network calls by default. Execution requires a named family, stable run ID, ready status, no unresolved blockers, and a hash of its reviewed benchmark config. It then delegates preflight, reference validation, acquisition and processing to the existing benchmark, preserving its cost controls and failure reporting. A nonzero command stops the batch. It does not retry uncertain submissions or automatically interpret command completion as a PASS.

From the benchmark directory:

```bash
python scripts/campaign_batch.py
# After reviewing and freezing a family config:
python scripts/campaign_batch.py --execute rss --run-id controlled-510-v1-rss
```

Use existing bench status/resume tools for interrupted jobs after inspecting remote state. Do not change run IDs just to retry: that can create duplicate charges. Reference validation is structural; humans/agent review must establish independence and completeness. Missing references must stay unverified, not be copied from an extractor.

## Resume after the usage reset

1. Read this file and the current table in README.md; inspect workspace changes before editing.
2. SSH to the existing VPS using the existing key; credentials remain under `~/.config/distilled-bench/`. Never print secrets. Benchmark directory: `~/work/distilled.news/evaluation/acquisition-benchmark`.
3. Inspect existing pilot configs and saved captures. Select expanded targets, review permitted access, and build family configs with one controlled repetition and matched limits/windows. Keep unresolved authorization routes pending. Official X $25 is the existing campaign budget, not a new $25 per stage; account for previous spend. Other allocations must be taken from existing records, not invented.
4. Prepare independent references and a review ledger (source URL, observation time, fields checked, failed checkpoint). Mark incomplete inventories as samples. Include controlled duplicate, edit, timeout, access-error, pagination and recovery cases via the existing fault suite and fixtures; do not induce paid quota exhaustion.
5. Freeze configs, store their SHA-256 in the campaign manifest, clear only resolved blockers, and set ready per family. Transfer reviewed setup to the VPS and run read-only planning/preflight first. Verify host firewall before the browser route.
6. User authorizes launching after reset. Run ready families; inspect reports and reconcile provider charges. Fix/replay saved responses before paying for another fetch. Update README with exact findings.
7. Prepare five-day Stage 3 schedules per family only after its configuration is frozen. Use existing `bench schedule`, separate cadences and bounded total requests. Set 121 hourly rounds or 21 six-hourly rounds for observations spanning a full 120 hours; pick cadence according to budget, not these examples blindly. No schedule is prepared or running yet. Config changes create a new evidence segment, not five days of evidence for the changed version.

## Current verified checkpoint

- LinkedIn: 20 saved posts, 120 checks pass locally and on VPS after the schema fix; $0.0381 provider-reported. Local connector suite 82 passed; VPS benchmark suite 223 passed. Production not deployed.
- TwitterAPI.io: 40 results, top-level checks pass; user-reported 600 credits = $0.006. Authorization unresolved.
- Other pilots and limitations are in README.md. Stage 2 is partially captured and reviewed; Stage 3 has not started. See the controlled campaign update in README.md and controlled-510-v1 artifacts.

## Deliverables

Per-family reports, original-source review ledger, failed-checkpoint list, replay/fault evidence, billing ledger and primary/fallback recommendations with limitations. Stage 3 adds cadence coverage, failures over time, freshness, latency and resource/cost observations. Five days does not establish large-scale reliability.

## Resume checkpoint after initial Stage 2 batches

Do not resubmit completed runs: controlled-510-v1-rss, google, telegram, telegram-additions, web, and google-matched. Reconcile Google billing from saved remote run IDs; review original-source references and Telegram coverage gaps. Browser administrator verification remains pending. Full suite now 224 passed. All acceptance statuses remain pending until their reference and authorization blockers are resolved.

## Latest continuation

Google billing reconciled to $0.0573 with 60/60 exact URL overlaps. Website paragraph audit: Trafilatura 380/380; Readability 378/380. Six Trafilatura timestamp precision losses. Telegram preview-inventory fix applied and replayed; VPS full suite 226 passed. See failed-checkpoints.json. Stage 2 remains incomplete; no Stage 3 schedule started.

## Expanded execution checkpoint

See STAGE2_STATUS.md. Browser batch is complete; firewall administrator request is superseded by existing verified rules plus active-service/outbound probes. X alternative batches completed (100 evaluated/provider), LinkedIn eight targets completed (35 records). Official X excluded. Do not resubmit. X Apify charges reconciled $0.044, LinkedIn $0.0714. Full suite 228 passed. Zyte expansion completed with 26 captures, three Guardian HTTP 451 refusals and one Al Jazeera deadline; $0.09 new reservations are not reconciled charges. Independent source reference gaps remain.

## Active schedules — September 27

Stage 3 free and paid schedules are now installed and running on the VPS. See STAGE3_STATUS.md and STAGE3_PAID_STATUS.md; earlier "not started" notes above are historical. User clarified a $20 ceiling per alternative independently; do not interpret this as $20 shared across a source family. Lower incremental Stage 3 allowances are X combined $12.60, Google $5.04, LinkedIn $3.36, websites/Zyte $1.89. Do not create another campaign or resubmit paid requests. Frozen configs and durable markers are in `data/campaigns/stage3-paid-20260927`; locked user cron runs the serial worker. Use `check-stage3-paid.py` for read-only progress. Free monitoring is in `data/campaigns/stage3-free-20260927`; use `check-stage3-free.py`.

Free first round finished: 48 core jobs plus 12 Telegram jobs. Website labels remain 27 unverified and three failures per extractor; source results unverified. Paid final round is due October 2 06:57:39 UTC; free final round due 06:49:22 UTC. Four paid-worker safety tests passed. Scope arithmetic corrected to 410 requested source items; preserve legacy `controlled-510-v1` ID. Stage 2 is not fully accepted, and Stage 3 is not finished.
