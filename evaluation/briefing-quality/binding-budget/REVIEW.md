# Review of 6444560a and offline candidate preparation

Branch research/binding-budget; base6444560a. The frozen coverage-first negative result is preserved. No paid inference, provider account check, secret read, deployment or merge was performed for this preparation.

## What actually caused the observed gap

The frozen final outputs contain **40items for each system**. The extraction candidate uses508words (12.70/item), the strong baseline450 (11.25/item):58extra words,12.9% overhead. Neither has a WORD_BUDGET_DEFERRED record. Thus the old experiment cannot diagnose a compression-induced coverage advantage or disadvantage: its budget never bound.

Extraction demands self-contained reader-ready sentences and publishes them verbatim, so it repeats subjects/reporting verbs: “The municipality closed the …” versus “Municipality closes …”, “The ferry operator added two boats …” versus “Ferry operator adds2boats …”. The lack of a composition stage prevents sharing scaffolding or rewriting compact clauses. The deterministic selector treats those verbose strings as indivisible units; a binding budget could penalize them, but that did not happen in the old final run.

All four unmatched **candidate** reference facets are present in its prose in recognizable Arabic:

| Case | Frozen unmatched facet | Reader text and diagnosis |
|---|---|---|
| final-g2-w0 | water damage | “تلف12مضخة” expresses damage; checker expects forms of تضرر. |
| final-g4-w0 | school duration | “لمدة يومين” expresses two days; checker normalizes ليومين only. |
| final-g4-w0 | water damage | Same تلف synonym issue. |
| final-g4-w1 | correction | Reader says7pumps, not12, with relation=correction; checker demands explicit correction-label wording. |

Spacing in these short diagnostic excerpts is abbreviated; original bytes remain in private/coverage-v1/campaign/final-generation. This is a source/prose audit, **not a revised score**: frozen36/40 versus38/40 remains in the old report and is not overwritten or reinterpreted as semantic truth. The audit supports “lexical reference misses”, not “four actual absent developments”. The checker also has false-positive weaknesses around negation/conditions. The source controls now use irregular quantities, permit IDs and signature deadlines to avoid simple arithmetic/range compression; these are source-only design choices before any candidate output. No new population-quality estimate is created by retrospectively recognizing paraphrases. Paired completed model coverage tied in the old study; the general advantage remains unproven.

## Post-freeze parser and QUIET behavior

The omitted-empty-missing-list fix accepts only explicit inventoryCoverage.complete with a nonempty reason. Missing/uncertain coverage still rejects, not legitimate empty. New regression tests cover:

- Valid independently supported already-reported facts with exact actual prior IDs yield empty and no carry-forward.
- support=already_reported is an invalid support enum; it is **not** coerced to supported merely because novelty says old. The quiet window remains rejected and recoverable.
- Unknown prior IDs, absent/uncertain coverage, or an omitted passage—even apparently irrelevant—do not silently turn into “no news”.
- Confirmed complete coverage without the redundant missing:[] remains accepted.

These tests explain the remaining quiet failures rather than hiding them. The new work does not claim to recover all three frozen quiet failures. Fixing source-model schema reliability requires an approved development measurement, not weakening failure states. Old paid responses, identities, holds and results are untouched.

## Specific candidate

`packages/briefing/src/compact-selection.ts`: independently extract compact structured fact units; source-ground them; select units before prose; compose selected units; apply the shared final factual/novelty safeguard plus explicit per-unit retention. It reuses existing source tools, parser and deterministic selector. Every selected ID must appear exactly once, and different occurrences/prior targets cannot be merged. The final validator must independently confirm substantive preservation, not just an ID list. Overrun, missing unit, changed relation, unsupported facts or uncertain retention are held; no retries/truncation.

The strong comparator uses the same final semantic prompt, exact current evidence, original source metadata, historical context, requested language,110-word cap and source-preservation guards. It gets no candidate inventory or source-reference truth labels. The corrected immutable-statement candidate is the ablation. Four calls for the compose candidate versus two for both comparators means the added stage must earn an actual coverage benefit within the inherited cost/latency gates. This is a substantial efficiency risk, not a presumed improvement.

The added opt-in hooks leave existing default prompt bytes unchanged. Invalid extraction and failed final checks retain all completed-stage usage; a red/green accounting regression exposed and fixed a dropped final-verifier call count. The module is not connected to staging/production routes.

## Prepared experiment and cost

See [PROTOCOL.md](PROTOCOL.md), compressed source/reference cases (`cases.json.gz`), pinned `manifest.json`, and [PREFLIGHT.json](PREFLIGHT.json). All references originate in the source construction, without either system's output.24windows,6event sequences,3domain templates; development12/validation12, no final enrolment.18relevant facts in each active window; updates, count corrections, recurring incidents, unchanged republications and quiet windows. English narration with mixedEnglish/Arabic evidence; this does not establish Arabic-output performance.

Complete-condition concise source renderings cost396–414words versus110. **Binding certification remains pending** until an output-blind semantic audit and compression challenge confirm those facts cannot all fit naturally without losing essential meaning. The code validates complete identities/spans/chronology/rosters, not semantic ground truth or a minimum possible word length. Cases are constructed, repetitive across domains and not a substitute for new natural-news event families.

Per12-window split:210nominal provider calls, up to288with all bounded consistency corrections, estimated$6–12. Full24windows:420nominal/576maximum, estimated$12–24. A complete4-window development sequence is estimated$2–4,70nominal/96maximum calls. These are planning estimates from prior prices/receipts and larger-source assumptions, not measured costs or spending authorization. The current runner executes a complete12-window split; a smaller4-window scope would require a separately pinned approval/manifest before sending requests.

The runner defaults to dry-run and has no provider import/key read in that path. Execution is blocked until a new explicit finite cap tied to the exact protocol and source qualification is supplied. After approval only, live account/prices are verified before any model request. Conservative reservations, UNKNOWN fencing and immutable identities use the existing accounting adapter. No old allowance is reused.

**Go:** source-only qualification first; then an approved development split. Validation is contingent on >=10ppfull-meaning coverage improvement over strong baseline, no material factual/novelty/correction failures, valid quiet handling, honest failed/unknown states and a plausible route to the unchanged efficiency gates. **Stop:** any factual safety failure, failed chronological distinction, quiet repeat/rejection, primary benefit absent or excessive premium. Preserve all cases and negatives; no tuning on validation. These small template-related groups cannot satisfy population-level superiority/non-inferiority requirements, even if their descriptive results look favorable.

## Verification status

Focused deterministic tests pass for compact-unit bindings, missing qualifications, common baseline guard, QUIET states, exact source spans, split/hash corruption, pressure roster and unapproved execution fences. These scripted provider doubles are implementation tests, not real model comparisons. Dry-run output reports newInferenceCalls=0/accountChecks=0/keyReads=0.

Disk exhaustion interrupted one full regression attempt and truncated a newly created test file. That file was restored, the failing usage-accounting test was rerun, and only a regenerable case JSON plus confirmed repository temporary compiled-module caches were removed. Cases are retained in deterministic gzip form with their build recipe. No user evidence/ledger/result was deleted. The interrupted run is retained as an environmental failure; a later run's actual status is reported separately.
Final local verification: full offline suite passed411engine tests,169evaluation tests,68evaluation Python tests,2engine-value analysis tests and3export tests;14research Python and5coverage-reference tests passed separately (672total). Four existing typechecks plus the new experiment-script typecheck passed. Focused candidate/parser tests passed again after final retention-slot/usage changes. The full suite initially failed with ENOSPC and succeeded after removal of confirmed regenerable caches; the failed log remains local. These counts establish implementation regressions only.

Source-only history ruling: common prior editions are explicitly seeded constructed prose, each at most110words; they are not a claim that either arm produced them. The quiet window republishes only previously communicated facts. Updates/corrections unseen by the seeded reader are new-to-reader reports, with the source correction preserved. Validator rejects impossible over-budget seeded histories. This preserves both fair identical history and honest novelty targets.
