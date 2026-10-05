# Semantic synthesis staging proof — 2026-10-05

Starting HEAD: `ac95cdb81f6a48bbd10866be387b20b04564ffe2`.
Branch: `integration/staging-end-to-end-v1`. Only the staging Worker/account is authorized.

## Diagnosis of the four retained attempts

The durable jobs record `INVALID_REQUEST`; none has a corresponding semantic
verification result. The more specific gates below were reconstructed from the
immutable drafts, selected plans, retained source bodies, and the checkpoint's
code. They are not invented historical verifier verdicts.

| OpenRouter call | Required meaning and generated prose | Assessment | Actual blocking gate |
| --- | --- | --- | --- |
| `e4d01357-4f87-4c01-8580-160d311cc15f` | Birthday, emojis, morning crew launch, and arrival invitation were copied. The required live coverage at 5:20pm ET / 2120 UTC (`228f5b54…`) was absent. | Genuine omission; the other four propositions were present. | Verification payload 13,733 bytes plus 3,702 already consumed input tokens exceeded the 12,000 ceiling. No GROUNDING call. |
| `27254cd1-5693-44fd-864d-32d9f3b51ecd` | Same coverage-time omission. Both personal-reminders propositions were copied completely. | Genuine birthday-story omission; personal-reminders meaning present. | Verification payload 20,094 bytes plus 5,072 consumed input tokens exceeded the ceiling. No GROUNDING call. |
| `84c8ff88-267c-4dcd-acf4-7cc1f7d10e7a` | Same coverage-time omission; personal-reminders wording was faithful, but its canonical candidate hash was altered. | Genuine omission and identity error; not a paraphrase failure. | Unknown candidate rejected locally before GROUNDING. Short story aliases already fixed this in the preceding checkpoint. |
| `f4b4ac2e-987c-428f-8233-8c47acf78c55` | Arrival invitation and coverage time were combined faithfully; the six-month question and personal belongings were naturally paraphrased. Birthday prose added “October 1, 2026,” absent from approved facts. “Crew-13 launched” and emotional interpretation of emojis need contextual semantic judgment. | Unsupported calendar date is a genuine error. Several required meanings are semantically present despite changed wording. Remaining identity/emotion inferences are uncertain, not recorded semantic omissions. | Verification payload 13,188 bytes plus 2,697 consumed input tokens exceeded the ceiling. No GROUNDING call. |

Every support string offered by all four drafts is an exact retained-source
substring. None contains a reader-facing invented direct quotation. The previous
report's claim that the fourth draft changed citation whitespace was incorrect
and has been corrected. There is no observed semantic-verifier false negative
in these attempts because semantic verification never ran.

Inspection did identify two potential false-rejection mechanisms: lexical
qualifier/attribution floors before semantic judgment, and digits in shortened
URLs counted as required quantities. Regression tests now cover both. URI
identifiers remain provenance; omitting their digits is not a missing numerical
proposition. A generated URI must still occur in approved support.

## Contract and correctness

The writer sees selected stories, approved propositions, explicit must-include
flags, treatment, language, attribution/certainty/temporal metadata, and only
approved exact support spans. It chooses short story/fact/span IDs. Span IDs map
back to immutable EvidenceRevision IDs and exact source text; it cannot rewrite
citations or obtain broader raw evidence during repair.

Natural paraphrase, combination, compression, synonyms, and fact reordering are
explicitly allowed. `communicatedFactIds` are bookkeeping, not proof; omissions
from that metadata alone do not trigger repair or reject faithful prose.

The existing bounded verification call independently asks two constrained
questions: do approved facts and permitted evidence entail every generated
claim, and does generated prose communicate every required proposition? Each
required proposition has durable coverage, attribution, certainty, temporal,
and qualifier verdicts with a reason and exact reader-prose witnesses. All must pass. Negative semantic verdicts
cannot be overridden by literal wording or model-declared IDs. Full retained
source context remains available only to the verifier to detect refutations.

Exact quotations, support identity, schema, source/current-plan fencing,
quantities/dates/bounds (including exact age equivalence), allowed URLs, and immutable/idempotent publication remain
deterministic. Lexical qualifier floors remain for deterministic/legacy paths;
an explicit independent semantic verdict resolves wording differences in the
model path. A missing or negative verdict fails closed. Numeric/date guards
are not overridden by semantic attestations.

One repair may consume the original restricted input, failed draft, and durable
precise feedback. A second failure is terminal. Settled results are reused after
storage failure/replay; uncertain outcomes retain their reservations and are not
blindly repeated. No model call occurs inside a correctness-critical CAS.
The sequence is capped at four calls, $0.10 total, 12,000 input tokens, 1,500
output tokens, and the existing 60-second execution lease. Default deterministic
fallback remains approved-span rendering and fails closed when unsafe.

No migration is required: `verification_feedback` is a new immutable document
kind in the existing unconstrained document-kind column; existing immutable
triggers apply. Frozen migrations were not changed.

## Live proof and final verification

Code commits after the starting checkpoint:

| Commit | Change |
| --- | --- |
| `044b9b7` | Independent semantic coverage, restricted wire contracts, durable single repair. |
| `3556519` | Retained publisher provenance, hypothetical preservation, compact repair feedback. |
| `d92a22d` | Exact reader-prose witnesses for positive coverage; no source-only witnesses. |
| `0e11f42` | Invalid witnesses become settled negative verdicts with usage, not unknown provider executions. |
| `795d2ee` | Reconcile publication storage schema and test durable witness preservation/replay. |
| `2e37a8f` | Exact numerical bounds, age equivalence, explicit writer quantities, compact semantic attribution contract. |
| `9ff2c44` | Story-wide witnesses across multiple claims; recheck actual reader witnesses at publication, including cached results. |

All were pushed to the integration branch. A final documentation commit records
this proof and corrects the previous quotation diagnosis. No main merge, frozen
migration edit, source-provider activation, or production deployment occurred.

### Further live diagnosis, without threshold tuning

| Window end / edition key | Durable outcome and semantic assessment |
| --- | --- |
| `14:57:03` / `dcdb4fc9...` | v9 writer changed a hypothetical six-month question into an actual Crew-13 duration forecast: genuine meaning error. Two settled calls cost $0.0028568. Precise feedback persisted; repair was blocked before a call by the unchanged input ceiling. Publisher provenance and redundant repair payload were corrected. |
| `14:57:04` / `69c51680...` | v10 model edition published, two calls $0.002584. All seven propositions received positive verdicts. Manual review found verifier explanations describing source sentences as generated prose. This was an unreliable verification explanation, not proof of an observed prior lexical rejection. Reader witnesses were added; this immutable edition was not rewritten. |
| `14:57:05` / `09ec6e07...` | v11 writer changed exact watch age into “over a century”: genuine quantity error. Grounding outcome fenced as unknown. |
| `14:57:06` / `be158c30...` | v12 attempt similarly fenced. Inspection found a guaranteed settlement defect: publication's strict schema had not accepted the new readerSpans field. Raw results were not retained, so an earlier decode failure cannot be ruled out for either individual call. That schema was reconciled and tested through actual publication. Neither uncertain call was repeated. Their raw verifier results were not retained, so their individual semantic verdicts and costs cannot honestly be reconstructed. |
| `14:57:07` / `0fb3b31f...` | Settled verifier falsely said “NASA asked…” lacked explicit NASA attribution, and treated a source quote/link as required reader wording. These are verifier false negatives, not true omissions. The draft also genuinely changed exact age into “over a hundred years.” One repair occurred; its subsequent verification request exceeded the unchanged input ceiling, so no fourth call or publication occurred. Three settled calls cost $0.0022192. Deterministic quantity bounds and the semantic attribution instructions were corrected; redundant verification prose was compacted. |
| `14:57:08` / `387f20af...` | Final v13 genuinely generated and fully verified model edition, two settled calls $0.001630, no repair, no rejected claim. |

There was also a normal deterministic staging edition
`298253a1df7e1491d59562aa0286c7a65103ec058717a4f448371045784e34ac`
for the distinct scheduled window 18:30–19:00. A queued scheduled message was
processed while the model was disabled. It used retained evidence and no source
fetch; it is not the model milestone or a duplicate of either proof window.
Cron changes propagate asynchronously and do not cancel already queued work.

### Final model publication

Edition ID: `387f20af7bcaf82620d28074c7bec599dabc0f8564371d9d0363bd6917342323`.
Feed revision: 1. Closed historical HOURLY window:
2026-10-05 14:56:20–14:57:08 UTC. This uses the supported historical-window
processing path on the staging proof feed; no failed or published window was
reset and no immutable edition was mutated.

Selection/verification ID:
`4abdea951a39661f6cf5f1002d797c66f35be1c90f77380a414dd0c6f55d711a`.
Event version: `f8bb2907-7682-4104-b33e-5ae1ec6498f3`.
Exact retained EvidenceRevision:
`b0f35871-ae71-4a72-939b-50238a5b0595`.
Published claim:
`613a4372deb746c260ae10951836e16434a6489b39ab92f387ebe91fa671d600`.

Required proposition IDs:

- `5840ce28e5fc820edccd6a4a8b365d9448d4e89ff168208bc08cb738dede9e5d`: hypothetical six-month question.
- `1d0395f049db4a8df430b8dee771d49041ef7b128ef0d1a85c41fd1f84a8785f`: ongoing transport of children's toys, rosaries, and exact hundred-year-old generational watch.

Published reader prose:

> NASA asked what items people would bring if they were to live on the Space Station for six months. The Crew-13 astronauts are taking personal keepsakes with them, including their children's toys, rosaries, and a pocket watch that is a century old and has been handed down through their family.

The first proposition remains an attributed hypothetical question; the second
remains ongoing. “Personal keepsakes” is a natural paraphrase of reminders of
home; “a century old” preserves the exact age. No reader-facing direct quote,
invented date, new duration forecast, or unapproved numerical bound occurs.
Both independently judged coverage verdicts have all five facets true and exact
reader substrings tied to the published claim ID. Both are preserved and novel
within the selected plan. Exact support quote is a substring of the retained
revision body, not a model-reconstructed citation. Grounding rejectedClaims=0;
grounding policy `approved-spans-semantic-coverage-v4`. Generation provider
OPENROUTER, prompt `approved-fact-spans-editorial-v13`, model
`openai/gpt-4.1-mini`; deterministic fallback was not used.

| Call | Phase | Input / output tokens | Confirmed charge |
| --- | --- | --- | --- |
| `307170fd-6c08-4001-9e4c-1cf885dbde87` | SYNTHESIS | 1190 / 110 | $0.000652 |
| `357ac81f-031d-4bbd-82cf-064fb8a4a972` | GROUNDING | 1285 / 290 | $0.000978 |
| Total for successful final edition | No repair | 2475 / 400 | $0.001630 |

Across this task, 13 OpenRouter intents/execution records were added: 11
settled confirmed results plus two fenced unknown outcomes. Confirmed results
total 16,622 input / 2,650 output tokens and $0.0105816. The two unknown calls
retain $0.04 reservations each; their actual charges/tokens are unavailable.
Do not interpret confirmed cost as the exact total charge including those calls.
There was one live repair, on the failed 14:57:07 attempt; the successful final
edition required none. No model change or unbounded repair loop was used.

### Replay, source conservation and public retrieval

The identical final queue request was resent while model synthesis remained
enabled. Queue backlog drained to zero. Both briefing request and synthesis job
are DONE; the job remains callsUsed=2, tokens=2475/400, cost=$0.001630.
There was no new model execution or duplicate edition on replay. Public API
returned HTTP 200 before and after replay with identical SHA-256:
`1356e779ddd94f931a1a94f618c5ba329ed60a0f9a4fe0016d39c46511a86610`.

Old deterministic edition `1f0a78b5...` still returns HTTP 200 with unchanged
response hash `34a5537d60a7306a9a280d63c84a2ab463d3823de1d30a17e7fb85607dbf310d`.
At the replay snapshot, the staging proof feed had four editions across distinct windows, including
the old edition, intermediate v10 edition, normal scheduled deterministic
edition, and final v13 edition. This does not mean replay created four editions.

| Durable source state | Before / after | Ordered-row SHA-256, unchanged |
| --- | --- | --- |
| Twitter EvidenceRevisions | 20 / 20 | `44dd2e78cfe853fe10317c343891a63551c8aaa19af352379026ef1809e84f27` |
| Canonical Events | 20 / 20 | `0fdbe11692ef9e642bfefbc8155fb9f79873accef3f0a36076647763b4769abb` |
| Canonical Storylines | 20 / 20 | `5736eccbb79c6c2fb2bed1893bf9f566f609ae5d46bee60610cf8f722c0ff666` |
| Fetch runs | 1 / 1 | No new fetch |
| Intake inputs / receipts | 20/20 before and after | No duplicate intake |
| Paid source operations | 1 / 1 | Existing `ac218349cc33bd72475393532724bf0c18ad5bf1646bc2405d068a7ff445a909` unchanged |

Twitter provider budget limit remains zero. Its $0.01 reserved amount predates
this task and was not increased; it is not a new source charge. All configured
TwitterAPI.io, Apify and Zyte operation ceilings remained zero throughout.
No new TwitterAPI.io request or duplicate canonical source effect occurred.

### Verified final staging posture

- Worker `distilled-news-staging`; account `e32b564514d4f9b9e383b7dd30dbb026` only.
- DB `ab259bfe-6029-4e20-8cb6-eea6b7a67459`; RAW_ARCHIVE `distilled-news-staging-raw`.
- PROCESSING_QUEUE `distilled-news-staging-processing`, existing consumer, max concurrency 1; DLQ `distilled-news-staging-processing-dlq`.
- SOURCE_EXECUTION_SERVICE `01a1099d-e88a-7c23-a1c5-eeb51471e780`; private loopback route preserved.
- Final deployed version `5122acbe-5317-4d99-851b-379374d486d1`, deployment `bc73d94b-24ec-4a85-96e4-b8042988016e`, 100%.
- Code bundle SHA-256 `95d10ff20824d7a7e64a3d91e046047ac05136dec6e7c6d9621f099367271df1` from `9ff2c44`; final version preserves safe configuration. The final publication-boundary hardening was deployed model-off; it adds a second witness check without changing the successful writer/model contract.
- Model synthesis disabled again; downstream source IDs restored to RSS + Twitter; minute cron restored and read back.
- Semantic graph/salience/editorial planning remain deterministic fallback; only writer and verification were live model-backed. This is not a claim of a new live JEV Event/Storyline decision proof.
- No old lownoise binding/resource or custom production domain; Workers domains list empty. Compatibility flags nodejs_compat/global_fetch_strictly_public unchanged.
- No secret was installed or exposed during this task. Existing names preserved: OPENROUTER_API_KEY, TWITTERAPI_IO_API_KEY, APIFY_API_TOKEN, ZYTE_API_KEY, SOURCE_EXECUTION_TOKEN.

### Tests and limits

Focused unit tests cover exact quotations, invented quotation rejection, safe
paraphrase, short identity mapping, reader-source witness confusion, false fact
IDs, numbers/date drift, exact age equivalence and invented bounds. Publication
regressions cover A+B-only from A+B+C, required fact omission, qualifier /
attribution / certainty / temporal changes, one repair, second failure terminal,
provider failure with safe fallback, durable verification and publication replay.

- Final unit matrix: 22 passed. Four focused final publication-boundary tests passed, including faithful paraphrase and source-only-witness rejection. A larger final run was interrupted by a user status message and was not counted as completed.
- Final publication/semantic/RSS matrix: 31 passed, 2 timing/setup failures, 3 opt-in live tests skipped. Both failed cases passed unchanged in isolation (minister paraphrase and unapproved-fact setup); no assertion or timeout was weakened.
- Earlier complete intelligence regression: 211 passed, 5 failed, 10 skipped; affected regression/audit/label issues fixed and timing cases rerun unchanged in isolation. Subsequent stable affected matrices passed (36 publication tests, 26 worker/unit tests, 40 publication/connector-runtime tests, 40 witness-storage regressions).
- Workspace recursive typecheck passed after final code. Final staging minified dry-run build and git diff --check passed.
- Existing unrelated browser-guard / Windows cleanup behavior was not redesigned. No broad new browser feature is part of this change.

Remaining limits: semantic judgments are bounded contextual model judgments,
not mathematical guarantees for arbitrary future language. Missing/negative
verdicts or invalid witnesses fail closed. Two historical uncertain model
outcomes retain reservations and unresolved charges; they were not repeated or
rewritten. Live proof is a small historical staging test corpus, not all-source
or multilingual live validation. Source-agnostic contracts and controlled tests
exercise those boundaries. Model synthesis stays disabled outside the proof.
Production and main were untouched.

