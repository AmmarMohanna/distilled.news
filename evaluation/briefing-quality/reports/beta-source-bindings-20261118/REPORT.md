# Beta identity/source-binding fixes: results and remaining blocker

Authorization: new $5 maximum for implementation and real-model verification. All new runs share this ceiling; the prior $2 campaign and its original negative report remain immutable. No deployment, production writes, live publication or merging occurred.

## What improved

The previous character-by-character model inventory failed all ten cases. V2 removes model-generated quotations and IDs as prerequisites for checking reader text. Code preserves every complete headline/body and reconstructs personal names and occupational titles from inclusive original token spans. The reviewer must assess those full reader units. A separate source-only identity extraction never sees candidate prose or prior judgments. Its literal person/role bindings prevent a reader-conditioned verifier from silently substituting an old office. Sources remain complete; paragraph passage IDs bind proofs to exact retained text. Every attached citation is assessed separately. Required keyed schemas prevent omitted decisions. Unknown provider failures propagate; exhausted received-output failures withhold affected sources/stories and preserve healthy siblings.

The candidate is frozen as `source-bound-claims-v2`; V1 frozen inputs retain the old parser/prompts. The rollout flag remains disabled. If separately enabled, new V2 windows use the existing GPT-4.1 model (override `BRIEFING_SOURCE_BINDINGS_MODEL`), while the disabled path preserves original routing. Normal verification uses three requests rather than one: reader identities, source identities, full-text/source assessment. Repairs repeat reader checks; exact source-only requests reuse durable paid records. All full reader facts remain model judgments; deterministic bindings do not prove source entailment or semantic identity extraction completeness. Same-script aliases/role paraphrases can still cause withholding; cross-script transliteration still relies on the reviewer. There is no office-holder dictionary.

Material-recovery coverage uses current-reader IDs and exact source-passage IDs only under V2. This fixes demonstrated ellipsized/invented quote failures and prevents a prior draft being cited as current reader evidence. Missing independently supported material still blocks publication. V2 repair asks for the original supported story body to be retained while correcting demonstrated facts, within existing repair slots.

## Measured results

Development cases are exposed production failures plus constructed/source-derived controls, not untouched independent news events. All intermediate failures remain in `measurements.json`; no favourable-only selection or general accuracy claim is justified.

| Experiment | Actual outcome |
|---|---|
| Earlier intermediate candidates | Multiple inventory/schema failures, false withholding and missed names/roles; preserved separately |
| Final compact source-binding regression, 14 cases | **5/5 labelled faults rejected; 9/9 valid controls accepted**, including Arabic compound names, invented name, changed final surname, English amount/qualification, French paraphrases and surname references, and cross-script transliteration |
| Coverage controls | Materially incomplete wanted-suspect-only account rejected; complete account retaining the additional Lebanese/Palestinian/123 Syrian groups accepted |
| Cabinet full-engine replay | Original writer request/response reused exactly; real verification/repair corrected unsupported `نجيب سلام` to source-supported `سلام`; **4 items retained, none withheld** |
| Aoun full-engine replay | Wrong army-commander title detected; unrelated Saudi story retained; Aoun story withheld with source evidence carried forward |
| First Aoun follow-up | Coverage output became usable, correctly identifying that repair had dropped material developments; still withheld |
| Final Aoun preservation follow-up | First repair preserved body and changed title to president; a subsequent reviewer falsely demanded reverting to army commander; source-only role binding blocked that reversal. **Still withheld**, unrelated Saudi story retained |

Final regression operational matrix: TP=5, FP=0, TN=9, FN=0 on these 14 development targets; precision/recall/F1=100% on this small dependent set only. This does **not** establish population accuracy. The compact pass completed ten cases, then received an explicit HTTP 429 refusal on case 11. A separately saved continuation attempted only the four refused/unperformed cases; all four completed. The original refusal remains recorded. Do not call that a single uninterrupted 14-case run.

The engine replay findings materially limit the favourable regression result. A factually corrected story can still be rejected by the fallible reviewer and later damaged by repair. The final Aoun run remained unsuccessful even though unsafe publication was prevented. Its withholding must not be counted as successful delivery or acceptable coverage. The claim that the first-beta blocker is fully solved is **not supported**.

The cabinet replay took 45.179 s and incurred $0.090424 new cost (10 logical calls, one historical writer reuse). The first Aoun replay took 63.061 s and incurred $0.125508 new cost (15 logical calls, one historical writer and one within-run reuse). Later Aoun follow-ups cost $0.079302 and $0.135562; final duration 55.549 s. These are local repair replays with paid-response reuse and provider pacing, **not fresh-edition cost estimates or live schedule-delay measurements**. Engine status `published` means a publishable local result, not an external database/publication side effect.

## Financial record

**$2.4846556 confirmed new cost**, 382 settled provider receipts; one explicit HTTP 429 refusal. Historical unresolved reservation **$0.012416** remains unchanged, giving $2.4970716 accounted exposure within the $5 ceiling. No new uncertain paid operation occurred. The 429 was initially conservatively recorded UNKNOWN by the runner; an append-only reconciliation uses recorded HTTP 429 headers and the exact existing adapter refusal classification. The old event remains; this is not evidence-free clearing. The previous interrupted HTTP-200 operation was never replayed or released.

Every paid call reserved conservative byte/schema/output exposure before dispatch and persisted full provider response/generation ID/actual cost before parsing. All subsequent campaigns included prior settled costs. Exact successful requests were reused only from complete settled records. The runner now paces requests for the provider's 20 RPM new-account limit. It never automatically resends uncertain operations. Model pricing was checked before each run. Shared account balance changes are not used as individual charge receipts.

`measurements.json` validates all saved request hashes, settled provider receipts and totals across all sixteen runs. It includes intermediate errors, negative decisions, refused requests, cost/tokens/latency, response hashes and explicit historical-response reuse. Full private source/request/response journals remain in the ignored `.local-reports/integration/beta-*` directories. Committed records contain no keys. Hashes use SHA256(JSON.stringify(parsed JSON)); ledger hashes use SHA256(JSON.stringify(raw UTF8 ledger text)).

## Verification and release decision

Local full briefing suite: **483/483** after the final changes. An earlier parallel run hit two unrelated five-second fixture timeouts; the unchanged assertions passed with two workers. Final typechecks cover briefing, application Worker and qualification script. Four targeted local-D1 tests pass (109 skipped), covering old/new fingerprints, V2 routing, four durable editor/verification stages and zero additional paid calls on redelivery. These checks do not constitute all repository CI or a production pilot.

**NO-GO for claiming unrestricted beta readiness or enabling globally.** Demonstrated improvements: reliable transport of reader/evidence references, correct decisions on the 14 development targets, correct material-omission blocking, and prevention of both retained unsafe publications while preserving unrelated stories. Unresolved: end-to-end successful delivery of the Aoun story, false adverse reviewer feedback, and cost/latency under live consecutive editions. No rollout flag was enabled and no deployment occurred.

Shortest remaining qualification: address the source-contradicting adverse review that reverses an already-correct role without allowing negative findings to become automatic passes; require the retained Aoun sequence to finish with supported material preserved. Then a separately approved staging rollout/pilot must verify consecutive real editions before production activation. The unused $5 balance is not evidence that further prompt trials should continue indiscriminately.

## Commands

```sh
# Offline checks, from packages/briefing
node node_modules/vitest/vitest.mjs run --maxWorkers=2
# From repository root
node node_modules/typescript/bin/tsc --noEmit -p packages/briefing/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/worker/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --lib ES2022,DOM evaluation/briefing-quality/qualify-source-bindings.ts
```

`qualify-source-bindings.ts` preserves frozen plans and refuses to restart an existing paid run. Preparation and summarization are offline; `run` is paid and requires authorization. Do not replay the saved campaigns. New requests need distinct identities and remaining authorization. `code-fingerprints.json` records the final implementation; per-run manifests identify historical development versions. Earlier intermediate outputs must not be reproduced against the final implementation and represented as identical historical requests.
