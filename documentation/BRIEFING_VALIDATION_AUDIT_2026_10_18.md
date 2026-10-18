# Briefing validation audit — 18 October 2026

**Finding: deterministic prechecks produce real false rejections, but neither inspected briefing was safe to publish unchanged.** The larger failure also exposes an editorial contract problem: automatic normalization expanded three explicitly mandatory facts into 181 requirements, including article-navigation metadata. Replacing these checks with unconditional semantic approval would introduce a different failure mode: the latest saved verifier approved a whole claim containing incorrect speaker attribution.

Investigation only, on `backend-briefing-review`, starting at `c3b28242b919f7d3530a5490da614a713e32fda5`. No runtime edits, inference calls, spending changes, deployment, queue replay, or remote data mutations. Read-only staging SELECTs retrieved existing artifacts; all experiments ran locally. “Genuine error” below includes material coverage omissions. The owner confirmed five source/draft changes as described below; other editorial classifications remain investigator judgments.

## Saved evidence and deduplicated rejections

Two attempts were inspected, including their complete original/repaired drafts, frozen approved writer packets, editorial plans, shortlists, feedback, and 13 immutable source revisions:

- **A:** job `e7c079c3a7027ebfb7a7dbb009c8a2bc7cec17871ade7774946b57f0fe7b67b2`, selection `e154e22e087b5e5130c2fcbe5bbb22913d068357437e4a2a2277904fe2977f5c`. Original feedback 13:52:51 UTC; repair feedback 13:56:03. Both stopped at prechecks.
- **B, latest failed job at the read snapshot:** `4e7f5da021087f81ddf24d75af98dbf097a639a4b06105d77376429bad3916e5`, selection `e84efb518daa9cd3138120557ba1dcc8814635014fc11fa6da54ef453129e495`. Original feedback 14:11:19 UTC; repair feedback 14:12:42. **Its repair passed prechecks and reached semantic verification.** The earlier explanation that verification was never reached applies to A, not B.

A has 76 issue records; B has nine. Collapse the automatic `LOST_QUANTITY` → `MISSING_REQUIRED_FACT` duplicates, repeated draft/repair findings, and multiple numbers within one omitted proposition. Fold the generic incomplete-claims wrapper into its underlying failure. Keep the two October 15 occurrences separate because they concern different developments. Result: **25 distinct rejection groups: six validator false positives, 11 excessive editorial requirements, four genuine errors, four uncertain.** This is an adjudicated failure sample, not an estimated population error rate.

The table accounts for every group. R-identifiers resolve to the [private evidence ledger](../.local-reports/briefing-latency/validation-rejection-ledger.json), which retains exact fact IDs, approved support/revision IDs, draft prose, and feedback occurrences. Full drafts and source bodies remain in ignored local artifacts rather than committed documentation.

| Groups | Exact evidence → reader prose or omission | Classification |
|---|---|---|
| R01 | Approved fact: “Vercel data published on Thursday”; article timestamp October 16, 2026. Draft dates **the data** October 16, a Friday. Article time cannot replace the stated data-release day. | Genuine error |
| R02 | Approved cost “more than $1bn (£866m)”; draft preserves the dollar estimate but omits the conversion. | Excessive requirement: secondary currency |
| R03 | Approved competitor prices `$159`, `$189`, `$129`; draft gives Bee's own supported `$74.99` price without the comparison. | Excessive requirement: optional comparison |
| R04 | Approved trailer views “roughly 447 million”; absent from the current-release summary. | Excessive requirement: background statistic |
| R05 | Approved separate Meta development: “816 billion parameters” and “1 million token context window”; the development disappears entirely. | Genuine selected-evidence coverage error |
| R06–08, R11 | Four approved “facts”: `- Published26 August`, `- Published28 November 2022`, `- Published28 August`, `- Published13 April`. The retained GTA article places these among related-link material; draft omits them. | Four excessive requirements: navigation metadata |
| R09 | Approved GTA 5 background says “September 2013”; draft discusses GTA 5 sales without its old release year. | Excessive requirement: optional history |
| R10 | Headline says “starting at $75”; approved body says “Bee Frontier is $74.99”; draft uses `$74.99`. Still rejected for losing `75`. | False positive: supported precision versus rounded headline |
| R12–13 | Approved Bee launch and Panay appearance say “Thursday”; both have October 15 report timestamps. Draft resolves both to October 15, 2026; no explicit `eventTime` is retained. | Two uncertain contextual date resolutions, not demonstrated falsehoods |
| R14 | Approved release fact says “19 November”; contextual delay references mention May 2026. Draft supplies November 19, **2026**. | Uncertain year resolution; explicit year not established by the release proposition |
| R15 | Source `“broke college kids”`; draft `"broke college kids"`. | False positive: delimiter typography only; repair paraphrases |
| R16 | Source `“self-driving company,”`; draft `"self-driving company"`. | False positive: delimiters and editorial comma; repair paraphrases |
| R17 | Source `10,000+`; draft “over 10,000”. Owner reviewed this stated change as PASS. | False positive under the reviewed coverage standard |
| R18 | Source `320+`; draft “over 320”. | Uncertain boundary reading; likely the same issue, but not separately human-reviewed |
| R19 | Source “over the course of two days”; draft “over two days”. Rejected as numerical bound `>2`. | False positive: temporal duration mistaken for inequality |
| R20 | Required text “Day 3 highlights”; draft “the final day”. | Excessive requirement: section-heading numeral |
| R21 | Source identifies a “Forbes 30 Under 30 alumnus” and describes influencer payments. Draft preserves the payment strategy but omits the accolade. | Excessive requirement: biographical label treated as quantity |
| R22 | Source quotation ends `sexual violence".`; draft ends `sexual violence."`. Words unchanged. | False positive: terminal period placement |
| R23 | Required step/foster-relations provision says “one person … under 18”. Original omits that legal scope; repair restores it. | Genuine material omission; `1` and `18` are one failure |
| R24 | Source identifies “BBC Radio 4's Today programme”; original preserves Bertin's substantive statement but omits interview venue. | Excessive requirement: venue metadata made mandatory |
| R25 | Full source explicitly says `“If you've got this material, delete it. If you're sharing it, stop,” Davies-Jones added.` Repair instead says Bertin “urged those who possess such material to delete it”. | Genuine wrong attribution; semantic `attribution=false` blocks it |

The 11 “excessive” judgments distinguish useful briefing coverage from literal reproduction of incidental details. They do **not** authorize discarding accepted evidence, changing an approved plan retrospectively, or suppressing corrections. None of these selected candidates had correction obligations or protected reasons in the saved shortlist. The Meta omission must remain unresolved work if it is not communicated.

## Confirmed causes and interaction with semantic review

1. **Novelty is being converted into mandatory reproduction.** A's real comparative planner declared broad `newUnderstandingFactIds`, but initially required one fact per selected story. [Normalization](../apps/worker/src/v1-intelligence/editorial-plan.ts) added 8, 134, and 36 facts: required counts became 9, 135, and 37, all with `STANDARD` treatment. The 134 additions include the four navigation labels and rounded headline price. This explains the excessive requirements; deterministic prechecks enforce the resulting contract rather than inventing those IDs themselves. B explicitly required all 18 approved facts.
2. **Lexical presence is treated as factual equivalence.** [Quantity/date checks](../apps/worker/src/v1-intelligence/fidelity.ts) compare story-wide normalized values and regex bounds, without binding each value to its actor, predicate, unit, and temporal role. That both rejects valid phrasing and allows swapped numbers through. Numeric dates, product/channel names, award names, and prose quantities share a recognizer. The [writer payload](../apps/worker/src/v1-intelligence/writer-wire.ts) also exports these lexical `numericValues`, reinforcing the contract.
3. **Quotation checking confuses presentation with quoted words.** [Direct-quote checking](../apps/worker/src/v1-intelligence/writer-feedback.ts) requires the entire delimited substring inside an approved span. It rejects typography and terminal punctuation differences even when words are exact.
4. **Upstream approval is insufficient context.** B's approved deletion instruction is a cut, unclosed quotation without speaker attribution; another approved fact retains “But she” while being marked self-contained. Full retained source identifies Davies-Jones and McGlynn. Both drafts wrongly assign deletion advice and platform-enforcement concerns to Bertin. Lost attribution during fact/context preparation is confirmed; whether it caused every writer error is a hypothesis. A also packs Bee, Rivian, Google, GTA and Meta into one EVENT candidate; its grouping's validity was not adjudicated here.

[Publication](../apps/worker/src/v1-intelligence/publication.ts) executes `inspectWriterDraft` **before** buying final verification. Any issue records durable feedback and throws; one repair is allowed. After repair, independent unblocked siblings may continue, but A had no clean sibling. `semanticPending=true` postpones some modality/negation/attribution judgments, **not** quantities, dates, action-strength floors, or direct quotations. Those floors also run after semantic approval, so changing their order alone would not resolve false rejections.

**Jev is not this final verifier.** Its configured code paths handle upstream event-relation decisions and optional salience; staging's salience policy is `DETERMINISTIC`. [Final synthesis/repair/verification](../apps/worker/src/v1-intelligence/model.ts) use `openai/gpt-4.1-mini` through the existing provider. Jev approval cannot override publication gates.

B's saved GPT verification marked its single whole claim `fullyEntailed=true`, yet one of 18 fact checks had `attribution=false`; combined coverage therefore rejected it. The negative flag is justified by R25, although its explanation incorrectly says a quotation occurs literally in the paraphrased draft. The whole-claim approval also missed the McGlynn→Bertin enforcement attribution error. **An “accept if the model says entailed” design would have accepted an erroneous claim.** Existing whole-claim and fact-facet verdicts contradict each other; exact reader witnesses establish where text occurs, not whether its meaning is true.

## Recommended architecture — proposal only

Keep three responsibilities with one documented decision contract:

1. **Exact eligibility:** schema, authorized immutable evidence, story/fact/reference ownership, citation substring validity, required story presence, correction obligations, source identity, leases/CAS, accounting and receipts. Preserve these hard blockers. For direct quotes, compare quoted words with narrowly specified typography/terminal-punctuation equivalence; changed words remain a blocker. Uncertain parsing is unresolved, never approval.
2. **Meaning and coverage:** give an evidence-grounded verifier the draft, selected material requirements, explicit speaker/context links, source/report/event time roles, and surrounding authorized evidence. Use `SUPPORTED / CONTRADICTED / UNRESOLVED`, exact evidence and reader witnesses, and a requirement-coverage map. Bind numerical values to propositions; lexical scans supply warnings rather than universally authoritative meaning judgments. Never resolve a report timestamp into an event date automatically. Conflicting verdicts remain unresolved. Jev must earn its role against reviewed cases; no model is presumed correct.
3. **Publication decision:** require supported claims, covered material requirements, resolved protected corrections, provenance and current version fencing. No publication on unresolved meaning. Retain novelty/history separately from must-communicate requirements. Remove navigation from derived news facts while preserving raw evidence; distinguishing optional context from material requirements needs an explicit editorial rationale, not a “new ⇒ mandatory” rule.

Keeping the present gates leaves demonstrated false rejections. Using semantic approval alone loses demonstrated protection. The recommended hybrid changes the boundary of responsibility; it does not lower the factual standard. More drafts would reach paid verification; its cost and latency impact are unmeasured. No implementation is proposed for deployment until the evaluation gap below closes.

## Offline replay and limits

Reproduce with:

```powershell
corepack pnpm exec vitest run --config scripts/vitest.validation-audit.config.ts
```

[Harness](../benchmarks/validation-precheck-audit.test.ts), [controlled cases](../benchmarks/validation-audit-cases.json). Exact staging replay requires ignored `validation-artifacts.json`; without it that test explicitly skips. Fetch throws in the harness; no model or database writes occur.

| Evaluation | Observed result |
|---|---|
| Exact saved prechecks | A original **39**, repair **37**; B original **7**, repair **0**, matching every saved precheck issue and order. B's remaining two feedback records are semantic wrapper + attribution failure. |
| Controlled current prechecks: 12 valid / 12 invalid cases | **5/12 false rejections (41.7%)**; **5/12 unsafe passes (41.7%)**. Unsafe passes: swapped quantities, swapped speakers, lost negation, missing nonnumeric requirement, added causation. These are precheck false negatives, **not observed false publications**. |
| Owner-reviewed current prechecks: four valid / one invalid pair | **3/4 valid pairs rejected**: `10,000+ → over 10,000`, duration “over two days”, quotation-period placement. Singular “an image … on a phone” → plural “images … on devices” passes. **1/1 invalid pair passes prechecks**: McGlynn's concerns attributed to Bertin. |
| Offline hybrid routing probe | **0/12 false hard rejections**; changed quote words hard-rejected; **23/24 require semantic adjudication**, **zero automatically accepted**. All four saved drafts route to semantic review; none is declared publishable. |
| Same probe, five owner-reviewed pairs | **0/4 false hard rejections**; all five require semantic adjudication; zero automatically accepted. The wrong-speaker case remains unresolved, not approved. |
| Saved semantic decision | Whole-claim-only rule approves **1/1 inspected erroneous claim**; combined current fact coverage rejects it. This one-case counterexample is not a model accuracy estimate. |
| Audit command | **2 tests passed**, 0 failed; no inference calls. |

The owner answered **“agree”** to proposed A–D PASS / E FAIL labels for the five exact changes in the human-review table (`call_02f7858a9f2e40dc83a19b9363bac076`). This is real human review, but assisted and unblinded, not an independent gold corpus or approval of whole drafts. The separate 24 synthetic labels and remaining materiality judgments are investigator-adjudicated. These targeted samples cannot estimate normal traffic accuracy. The hybrid probe measures routing and exact-quote behavior only: **its final false-acceptance and false-rejection rates are unmeasured**, because compatible saved semantic verdicts do not exist for the newly admitted cases. Reporting zero false acceptances merely because the probe publishes nothing would be misleading.

**Next acceptance step:** independently review the supplied source/draft pairs and materiality labels; replay saved compatible semantic judgments, recording contradictions and unresolved cases; then evaluate the proposed final decision against both positive and adversarial negative cases. No further inference, deployment, or writer/performance work is needed to review this report. The evidence confirms an overbroad editorial contract and deterministic false positives; it does **not** establish that bypassing those checks alone would produce an accurate briefing.
