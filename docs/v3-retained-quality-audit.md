# V3 retained-briefing quality audit ? 2026-10-27

## Findings

V3 often distills a large input into a short, readable item and rejects obvious off-topic chatter. However, this sample demonstrates material causal strengthening approved by the verifier, avoidable Arabic repair work, weak continuity and reader-facing filler. Improving prompts/models is not yet justified without a focused comparison. No code, live feed state, model settings or prompts changed for this audit; no paid calls.

## Frozen sample and method

Twelve latest available published editions at audit capture, three each from AI Industry Watch3, Bitcoin institutions mixed-source test, Lebanon English and Lebanon Arabic. Exact acquisition text, URLs, timestamps, interest profile, reader history, saved result, model-operation responses and accounting are retained locally. This is an AI-assisted evidence review, not independently human-reviewed labels or a complete population estimate. All cases use GPT-4.1 editor / GPT-4.1 mini verifier. Published cases only: publication success rate and quiet/rejected-window economics cannot be inferred. Edition sections are not assumed to equal story count; saved V3 items are used.

| Feed | Editions | Items | Calls | Recorded USD | Mean model-path sec | Mean headline+body words | Editions with repairs |
|---|---:|---:|---:|---:|---:|---:|---:|
| lebanon-news | 3 | 3 | 6 | 0.021505 | 13.02 | 40.0 | 0 |
| lebanon-news2 | 3 | 3 | 14 | 0.048941 | 31.73 | 43.3 | 3 |
| bitcoin-institutions-mixed-source-test | 3 | 5 | 6 | 0.065246 | 16.67 | 88.0 | 0 |
| ai-industry-watch3 | 3 | 3 | 6 | 0.074932 | 20.41 | 80.7 | 0 |

Recorded successful-result cost totals $0.210625 across 32 calls; this is historical expenditure, not new audit spending. These costs exclude earlier failed operations not present in a successful result. Operation export contains 32 retained receipts with reported usage; exact records are local. Model timings do not include scheduling delays or acquisition time.

## Confirmed source-to-output defects

1. **Bitcoin causal chronology** (`bc857f4403...`, item 2): draft says the Saturday price fall caused $773.5M ETF outflows. Source lists those two-day outflows among signs already building before the weekend. Price-drop/liquidation causation is supported; price-drop/ETF-outflow causation is not. Mini returned ok for all three items.
2. **SEC causal strengthening** (`c48935d92b...`): headline/body imply SEC examination priorities followed the particular Saturday ETF trading gap. Source says the SEC added tokenization to priorities last week, discussing the weekend gap separately. No source establishes the causal link. Mini returned ok.
3. **PHP outage uncertainty** (`a106d2100d...`): body groups BBC sites among sites taken offline because of PHP vulnerabilities. Source explicitly says Edinburgh council and BBC programme sites had not confirmed a PHP link. Mini returned ok. Wiz 70% estimate remains attributed; omission of the reporter inability to verify it is secondary to the confirmed outage-link error.
4. **Unsupported status/title insertion** (`a540405e94...`): source says cousin of Bashar al-Assad; output adds President. The title is not established in the cited text. No independent current-office fact check was performed.

## Distillation and relevance

- English Syria item adds No further details were provided in the source; source does not require this empty commentary. Arabic Bani Hayyan item adds routine publication-date prose. Citations already identify evidence.
- English army-deployment item uses prompting for two facts the terse source juxtaposes; this is an unsupported causal interpretation to challenge, although the practical relationship may be plausible.
- Arabic election item includes Netanyahus four hours to save Israel slogan without a direct Lebanon consequence, while rejecting other local election coverage for limited relevance. This is inconsistent relevance application, not a measured recall rate.
- AI manager-survey item contains several survey percentages and peripheral detail (roughly 104 headline+body words). A main-idea-first version could retain management/oversight change with fewer numbers; needs human importance labels before automatic cuts.
- Bitcoin inflow item does not identify where coins flowed. The original post also omits the destination: this is input ambiguity, not grounds to invent exchange/ETF flows. Omit/deprioritize or preserve ambiguity.
- No complete important-news recall claim: external events absent from collected input were not evaluated. Most repeated off-topic posts were reasonably omitted.

## Continuity and input cost

The AI merger item at `200cf371bb...` repeats special committees considering Tesla/SpaceX combination, no agreement and required shareholder approval. Its supplied history already contains the same central announcement (`ccd86d4f...`). A complex/uncertain characterization may be added, but no clearly material new decision is established in this review. Treat as a likely repetition for human confirmation. In contrast, the Lebanon duplicate Furn El Chebbak report was explicitly omitted as already told.

AI snapshots contain roughly 30 offered articles, most carried off-topic/programme listings, plus 58?60 prior items before existing preparation selection. Many prior headline fields repeat the entire body; do not assume the model saw all raw history because prepare applies its own limits/deduplication. Measure actual prepared prompts before optimizing or changing memory. Do not discard source evidence with new keyword heuristics.

## Verification and repair overhead

All three Arabic sample editions required repair: four, four and six calls. On the occupation/withdrawal item the verifier requested changing ??? ????? ???? ???????? to ??? ??? ???? ???? ????????, a semantically equivalent formulation. In the election item, the first correction repaired a real attribution error; the second largely restated tense/wording and appears unnecessary. The Bani Hayyan request added southern Lebanon to the headline for clarity; evaluate against full headline+body before treating such omission as factual failure. Repair counts are confirmed; final judgments on false rejection remain AI-assisted. No blanket instruction to ignore verifier findings is recommended.

## Delivery vs inference

Arabic selected windows were published approximately 3?6 minutes after close. English Lebanon selected editions were 261?332 minutes late. Latest AI publications correspond to Oct 21 windows published Oct 27 (roughly 147?149 hours late); those are backlog recovery, not fresh-window timing evidence. Bitcoin has similarly delayed recovery cases. Public feed freshness cannot be inferred from fast individual model calls.

## Priority experiments ? no implementation yet

1. Freeze supported vs unsupported causal and attribution examples; change only verifier instruction on causal/temporal strengthening. Include accurate concise Arabic paraphrases as negative controls and unseen cases before retention.
2. Measure repair reasons/cost; test accepting equivalent wording without weakening real attribution, negation, temporal and uncertainty checks.
3. Measure novelty against exact ALREADY TOLD for the merger pair; test material-update selection without a new event graph or new mandatory calls.
4. Only then test main-idea concision/relevance on human-labeled busy windows. Shorter alone is not success.

Keep current model routing until comparative evidence warrants change. No broad model sweep. Four-feed observed successful-run mean costs are not a forecast for quiet/saturated populations; no recurring cost projection is justified from this biased sample alone.

## Artifacts

.local-reports/v3-quality-audit/: selected.json, documents.json, operations.jsonl, metrics.json and raw public feed exports preserve exact relationships. Human-readable full briefing text is saved in briefings.md. No credentials or private readers were exported. Original sources were not modified.
