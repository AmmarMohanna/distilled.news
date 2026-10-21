# V2 versus V3 on the retained Laplace, Replit and Anthropic articles

**Result:** V3 with complete article text automatically produced, verified, persisted and read back a concise three-item briefing in **15.560 seconds**, using **2 calls/$0.0122076**. Independent AI-assisted source review passes it as a useful briefing with minor precision/completeness caveats and moderate confidence. This is one successful private saved-evidence run, not proof of general reliability or deployment readiness.

Compared V2 `8b7dee7432ecc98941caae39406a9c407b011532` with V3 `1ba497171f5724cf3e334edfb9e47d2f3410237a` (`v3/fresh-start`). Corpus SHA-256: `d8651e44c878a0738b3b5d5fc5ad4d7f330e3b43d18b279c9e30ba3c109f77c6`. No product code or model routing was changed on either branch. These documentation/result artifacts record the experiment only.

## What was tested

Both V3 arms used its unchanged editor/verifier/repair engine with GPT-4.1 editing and GPT-4.1 mini verification over OpenRouter, the same original sources/metadata, empty reader history, original V2 comparison window and a daily reading budget. The default arm used V3's shipped preprocessing. The full-evidence arm used its existing `prepare.maxArticleChars` option to preserve each entire source body. No prompt or generated text was edited between arms; independent responses may vary.

An isolated evaluation transport reserved every call through the existing account ledger before sending, settled actual provider-reported charges, checked the served model identity, stopped unknown outcomes, and enforced the approved shared 12-call/$0.10/two-hour scope and original $1 task total. V3's separate native spending ledger was not used to bypass V2 liabilities. The remote evaluation account received only the newly approved successor authority; historical grants, receipts, holds and account ceiling remained unchanged. Local D1 stored original evidence and editions constructed by V3's `buildV3Edition`.

## Measured results

| Run | Calls | Actual cost | End-to-end saved-evidence attempt | Edition persisted | Independent source quality |
|---|---:|---:|---:|---|---|
| Retained V2 X: Luna low, Luna medium verifier | 8 | $0.02747329 | 375.350 s | No | Not a successful edition |
| Retained V2 Y: Luna understanding/planning, Haiku writer | 5 | $0.013834225 | 128.762 s | No | Output exhausted before completed prose |
| Retained V2 Z: requested specialized hybrid | 8 | $0.03562210522 | 316.034 s | No | Verification rejected date; editorial caveats |
| V3 default | 2 | $0.0121116 | Generation 15.567 s; automatic persistence failed in harness | Yes, recovered without new inference | Pass with caveats, moderate confidence |
| V3 complete original article text | 2 | $0.0122076 | **15.560 s including local persistence/read-back** | **Yes, automatically** | **Pass with caveats, moderate confidence** |

V3 full-evidence engine time: 14.574 seconds, including edit9.407 and verify5.122. Additional scope used **4/12 calls and $0.0243192/$0.10**. Combined original task actual charges are **$0.91148441522/$1**. Final ledger audit reports zero unsettled V3 operations. Old unresolved holds remain54/$6.0268524892999995. No further paid trials were run.

The V2 rows are retained real trials, not fresh matched-model reruns. Different model mappings, output lengths, generated editorial choices and repaired failures confound causal attribution. The observed V3 result is substantially better on delivery for this sample; these data do not isolate architecture from model quality or establish a population-level speed/cost improvement.

## Persistence evidence and harness correction

Full-evidence edition `edition_1kl1hw3`, created `2026-10-21T20:31:00.324Z`, has hash `d6fe1f32ba2fc03ada336eed80210f5edd0f167ba766ef10bff56d4d71c2ed35`. Its three sections match the paid editor result; the verifier approved all three without repairs. A separate process reopened the persisted local database, compared the stored edition to the exported edition/result and confirmed all three original evidence rows.

The default run's first persistence attempt failed because the comparison harness linked the V3 worker adapter to V2's core package, which lacks V3's `editionId` export. This was a harness mistake, not a provider or V3 engine failure. The original failure report remains unchanged. Exporting the matching V3 core allowed the already-paid result to persist with zero new inference and no text/verdict changes. That arm is explicitly operator-assisted and has no comparable automatic-delivery latency. Full-evidence started with the correct matching core and needed no recovery.

`publishedAt` in V3's edition builder is the reporting window end; actual delivery measurement uses the wall clock and `createdAt`/commit, not that backdated field. These are private local evaluation editions, not shared staging or external reader publication.

## Source quality, not exact wording or exhaustive reproduction

The reviewer initially rejected both editions too strictly. The user clarified that, here, “could significantly reduce” and “is expected to significantly reduce” are acceptable paraphrases preserving uncertainty. Independent review reassessed the **same unchanged paid text**, with no new model calls. The assessment now separates material falsehood/misleading omission from ordinary compression and optional background. No runtime validator was weakened and no paid verdict was rewritten.

The full-evidence edition:

- Keeps Replit, Anthropic and Laplace as separate items with little repetition. Replit is framed as a default/preferred-provider decision, not a claim that the Anthropic partnership ended. Continued Anthropic access is explicit. The insider dispute is vague but adequate under that framing; stating the specific counterclaim would be clearer.
- Retains Anthropic's 5% share commitment, optional2% for each50% valuation increase, wholly-owned structure, possible uses and pending governance.
- Conveys Laplace's simulation-based automated red-teaming without guaranteeing accuracy or safety. Automatic corner-case generation is a valuable omitted differentiator, but its omission does not make the concise account materially misleading. Grouping smart-city pilots under customer language is imprecise, without explicitly asserting paying customers.
- Avoids the original-publication/update-date error, unsupported benchmark-provider assignment and cross-company storyline links observed in prior V2 trials.

Default is slightly weaker: its phrase about a shift toward enterprise/government customers compresses observed enterprise growth with the2027 forecast. Review treats this as temporal ambiguity rather than a definite material false claim. It omits the fund's wholly-owned detail. These caveats are recorded, not hidden behind verifier acceptance.

This is AI-assisted independent source review, not human gold labeling. Both real V3 verifiers returned approval without detecting those caveats. Therefore an approved verification response alone is still insufficient evidence of product quality.

## Evidence completeness and architecture

V3's default article cap6000 removes326 original middle characters from Laplace's6319-character body and inserts a7-character marker. The removed passage includes uncertainty about generalized-robotics data/edge cases and part of the revenue/profit sentence. Its verifier sees the prepared text too. Replit3884 and Anthropic1185 characters are intact; none of these three sources were folded as duplicates. All fit one editor chunk. The full-evidence option raises editor input from11879 to12198 characters without modifying V3 code.

V3 combines understanding, event grouping, selection and writing in one editor call, then verifies complete item headlines/bodies. Individual repair/drop avoids requiring every intermediary model to reproduce a large fact-reference inventory. Current V2 is already article-first; V3's older documentation describing a mandatory deterministic-extractor V2 baseline is stale for this comparison.

The simpler V3 path is a promising next baseline because it produced a coherent useful edition here. It does not preserve all V2 infrastructure automatically: canonical knowledge versus publication memory, long-term event identity, retry/CAS/lease coordination, account liabilities and the active product-feed integration need explicit assessment before migration. V3 currently uses the legacy edition path and is not active when `PRODUCT_FEEDS_ENABLED=true`. Its worker carry-forward is article-based; a dropped development can miss retry if another accepted item cites the same article. None of those concerns was exercised by this empty-history single-feed sample.

## Tests and boundaries

V3 engine23, model6, prepare6 and exact-corpus audit1: **36 offline tests pass**. Default zero-inference persistence recovery and final two-database reopen/read-back checks also pass. Paid full-evidence run completes and persists. These are distinct from mock tests proving actual semantic quality.

No live acquisition, unattended schedule, later-update/correction memory, multilingual quality, concurrent feeds, shared staging deployment, merge or reader notification was tested or enabled. No unused spending allowance was treated as permission for further experiments.

Machine-readable calls, costs, timings, exact resulting item text, read-back hashes and review caveats: [v2-v3-three-article-comparison.json](../benchmarks/results/v2-v3-three-article-comparison.json).

**Decision:** prefer full-evidence V3 as the next evaluation baseline. Preserve this edition as a regression case and test another real corpus before broader migration or deployment. Do not add more V2 architectural machinery before comparing against this simpler path.