# V3 event-separation comparison and dataset recovery

## Decision

**Reject the tested instruction change.** The editor did not demonstrate an improvement over its matched baseline. Consolidation still merged unrelated developments and dropped important news. Runtime prompts, models, verifier/repair behavior, history presentation, reading budgets and compression rules remain unchanged. Nothing was deployed, published or sent to readers.

Six newly authorized GPT-4.1 calls cost **$0.050346**, all settled, within the new **$0.35** ceiling. Two existing baseline responses were reused. No further inference was performed after the request to audit comparison fairness and prioritize dataset access.

## Exact comparison audit

Every candidate was matched to its own exact frozen baseline request:

| Pair | Baseline | Candidate | Change |
|---|---|---|---|
| Known Arabic editor | retained `reading-baseline-ar` | `known-arabic-editor-candidate` | grouping paragraph only |
| Previously unused window, English | `unused-window-en-baseline` | `unused-window-en-candidate` | grouping paragraph only |
| Same window, Arabic | `unused-window-ar-baseline` | `unused-window-ar-candidate` | grouping paragraph only |
| Known consolidation | retained `consolidation-baseline` | `known-consolidation-candidate` | grouping paragraph only |

The audit recomputes request hashes, checks exact equality of the full user message (including source text, timestamps, profile, language, prior history and ordering), checks every non-message configuration field, and checks that the candidate system is exactly the specified single-paragraph replacement. Model, temperature, output cap, JSON mode, provider price limits and fallback policy match. All calls reported OpenAI as provider. It does not independently establish immutable underlying model weights behind a provider alias.

`paired-comparison.json` contains exact baseline/candidate requests and results for reproducible inspection. Tests deliberately change input bytes, model, temperature or an unrelated instruction and confirm that the audit rejects the mismatch. This is an offline evaluation check, not another production contract or stage.

The known baselines were collected earlier, not simultaneously. There is one sample per condition; neither latency nor quality differences are statistically established. The alternate reader-focused prompt's earlier false merge is retained as a failure example, **not substituted for the unchanged baseline in these comparisons**.

## False merges, false splits and important omissions

| Pair | False merges: baseline → candidate | Important developments included | Assessment |
|---|---|---|---|
| Known Arabic | 0 → 0 | 4/4 → 4/4 | No demonstrated gain |
| New window EN | 0 → 0 | 2/2 → 2/2 | No demonstrated gain |
| New window AR | 0 → 0 | 2/2 → 2/2 | No demonstrated gain |
| Consolidation | 0 → 1 | 6/6 → 3/6 on pre-existing priority labels | Material regression |

The Qantara same-occurrence control is preserved: both Arabic baseline and candidate combine the two reports `S7`/`S8` into one item. No unnecessary split was observed in that control. This is one case, not a general false-split rate. Both Iran versions keep the reported proposal and the separate conditional threat distinct while retaining the related proposal clauses within one item.

The consolidation candidate explicitly concatenates the EFS announcement and Barclays adoption under `from: [0,3]`. This is confirmed in its text, not inferred solely from shared references. The baseline kept them separate. The candidate returns four items representing five draft developments; the baseline returns thirteen items representing thirteen developments.

Not every omitted draft is important or must be reproduced. The specific concern is that the candidate drops three of the six previously identified priority developments: the Accenture evaluation investment, Genesis Mission funding and the proposed Public Benefit Fund. It retains EFS, Cyber Verification and Cyber Mission. The priority labels are pre-existing AI-assisted engineering judgments, not independent human gold. Its omission reasons include "future commitment, not yet implemented" for the fund—an editorial selection decision, not a finding of unsupported facts.

## Factual support and continuity limits

The Iran versions preserve reported/attributed sourcing, the exchange condition for the Hormuz proposal, and the condition and attribution of the threat. Neither says that a deal, reopening or attack has occurred. Both Arabic variants add October 24 narration from source metadata; this is shared behavior, not a demonstrated improvement in temporal reasoning. This run does not qualify the relative-date fix, and no duplicate date change was made.

The known Arabic candidate retains the four selected developments without repeating previously communicated Karak, drills or Brent news. No broad cross-window update/correction reliability is established by these samples.

No verifier or repair calls were authorized in this experiment. These remain editor/consolidation drafts, not factually approved or persisted editions. Earlier source-level factual concerns in the larger draft set were not resolved by this run. Correctly shaped JSON is not factual approval.

The reader-notification evidence correction remains: its verifier checked the separate baseline items, not the merged Arabic alternative. That artifact cannot establish verifier approval of the merge.

## Actual costs and inference times

| Comparison | Baseline cost / latency | Candidate cost / latency |
|---|---|---|
| Known Arabic | $0.012030 / 3.572 s, reused | $0.012426 / 3.718 s |
| New window EN | $0.006486 / 2.304 s | $0.006306 / 2.233 s |
| New window AR | $0.006798 / 2.396 s | $0.006922 / 1.975 s |
| Consolidation | $0.020196 / 9.046 s, reused | $0.011408 / 5.641 s |

The new calls total **$0.050346**. Conservative reservations summed to **$0.345466**, with **$0 outstanding** after settlement. Historical holds/grants/receipts and the account ceiling were not changed. The candidate's lower consolidation cost reflects much less delivered news and is not an accepted efficiency gain. These are per-call replay latencies, not acquisition-to-publication timing or measured recurring full-pipeline cost.

## Dataset access restored in part

The exact private 95-window archive was not found after searching registered project worktrees and relevant project archives. The report/exporter are committed; the original snapshot, plan, interval files and checksums were deliberately ignored. They cannot be recovered from that Git commit alone.

Read-only access to the source QA D1 database was restored using the existing login. An authorization error during inspection was resolved by refreshing that login; no new permissions or deployments were requested. Current inventory contains 1,038 acquired records; 891 have acquisition timestamps no later than the documented original freeze.

A separate local recovery now preserves:

- **891 acquired records**, approximately **4.19 million characters**, across 25 feeds.
- Original full acquired text, identifiers, timestamps, observations and acceptance receipts; none of those 891 records lacked its observation or receipt.
- Retained feed-version/history metadata. No current profile was silently substituted for a historical profile.
- **20/20 known source-body hashes match** the retained Space evaluation.
- A newly frozen snapshot hash and local ZIP. Only sanitized recovery metadata is committed; source data remains private and Git-ignored.

Recovery issued 11 SELECT queries, reporting 4,850 rows read and **0 rows written**. Preliminary count/inventory checks were also SELECT-only. No source fetching, inference, feed mutation or financial changes occurred during recovery.

Using the existing exporter and the interval bounds explicitly documented in the report, the **46 consecutive World News windows** were rebuilt locally. Integrity checks verify their hashes, consecutive half-open intervals, initial history and exact original text/timestamps/receipt membership for all 159 article occurrences. Fetch-health metadata was not recovered and is explicitly unknown, not zero.

This is **not the original 95-window export**. The reconstructed sequence has 50 mechanical recurrence indicators, including 40 changed-text same-URL indicators; the earlier report gives 47 and 38. Data or indicator-definition differences remain unverified. Matches are not semantic update/correction labels. The original snapshot also reportedly contained 912 acquired records, so counts alone cannot establish equivalence.

Private locations in this working tree:

- `.local-reports/v3-source-recovery-20261024/historical-source-snapshot.json`
- `.local-reports/v3-source-recovery-20261024/world-news-46/`
- `.local-reports/v3-source-recovery-20261024.zip` (about 3.59 MB)
- `.local-reports/v3-dataset-index.json`

The exact original ZIP, or its snapshot and interval plan/checksums, is still required for faithful 95-window restoration. Meanwhile, the separately labelled recovered corpus is available for stronger future testing; it must not be relabelled as original or already semantically certified.

## Verification and next step

- Exact request audits and comparison/recovery checks: **8 tests passed**.
- Briefing unit/recorded suite: **100 tests passed**.
- Briefing TypeScript check: **passed**.
- Recovered-track integrity: **46 windows / 159 occurrences verified**.
- Product changes retained: **none**.

Before another paid experiment, label a small selection of recovered real windows for distinct developments, valid same-occurrence consolidation and consequential omissions. Freeze those labels and exact input/history/model settings first. Do not repeat broad compression experiments or interpret stronger wording as a semantic guarantee. The failed candidate is not activated, and unused authorization is not used for another search.
