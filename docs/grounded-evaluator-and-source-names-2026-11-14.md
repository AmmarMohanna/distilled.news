# Grounded evaluator and source names — 2026-11-14

The live 15:00 Beirut edition published on time with supported claims, but its evaluator's 1/3 recall score was unreliable. One inventory item imported detainee testimony/affiliation from prior reader history even though the cited current post only reported political criticism. Another changed a headline about union support and anticipated escalation into actual roadblocks at Martyrs' Square. The cited passages existed; their existence did not establish those invented developments. Source names also displayed `x.com` because canonical source catalog entries used the platform hostname.

## Corrections

New evaluations use `atomic-development-review-v3`. The independent inventory sees current source passages without prior reader prose or candidate output. A separate GPT-4.1 entailment check assesses every proposed development against only its cited current passages. Unsupported or uncertain candidates are excluded from omission scoring and retained as diagnostics; they are not silently converted into good coverage. Reader-history matching happens later and requires exact supplied prior IDs. Validated already-reported facts are excluded from the new-development denominator.

Coverage warnings are generated from validated, grounded inventory/coverage rows. Other warnings must name actual reader items and agree with adverse claim/item assessments; an omission cannot be relabeled as a factual warning. The review schema enforces those item bindings. Importance remains a machine judgment, not objective importance or human calibration. Partial retained inputs keep their explicit scope limits.

Never-sent pending reviews adopt v3; existing paid stages retain their legacy v2 request bytes and settled responses. Completed older reports and financial records are retained. Stable discovery IDs prevent a protocol rollout from automatically re-paying all historical reviews. The dashboard distinguishes current and historical protocols; current aggregate scores exclude historical protocol rows. One specifically identified bad report receives an append-only v3 re-evaluation and an operator triage note; no published briefing is rewritten.

Source labels resolve approved profile identities to account handles. New catalog records and new edition payloads use the resolved name. Generic historical artifact labels are enriched through batched, feed-scoped revision/source lookups, followed by the existing mutable visibility checks. Immutable artifact bytes, story text, evidence IDs and publisher IDs remain unchanged. Correct names require no enrichment read; unavailable optional metadata cannot break verified-artifact delivery. No account is guessed from a post URL or article text.

## Evidence and checks

The real-data qualification reused the exact retained public-source case behind the bad live report. Both invented inventory items were rejected as unsupported. The fresh inventory correctly recognized union support and frost damage, and the final review marked both published stories covered. It retained a potential omission of political criticism as a subjective importance judgment rather than inventing testimony or roadblocks. The secret-free record is `benchmarks/evaluator-grounding/qualification-2026-11-14.json`.

The final review uses a separately identified bound-findings request; unchanged settled inventory/grounding calls were replayed. Trials did not publish briefings or enter current aggregate scores. These curated checks do not establish general semantic accuracy. V3 adds one entailment call for a nonempty proposed inventory, using the existing configured GPT-4.1 evaluator and durable reservation/settlement/UNKNOWN safeguards. Unlimited spending mode remains unchanged.

Validation: 104 evaluator checks, 25 citation/identity/batching/visibility checks, and 13 source-enrollment checks passed. Worker and evaluator type checks and both staging bundles passed. Deployment versions and live proof follow below.

## Staging deployment and live proof

Code commit `01a0071e` was pushed to `ghada/v4-transactional-briefing-recovery`. Staging briefing Worker version: `75eca95f-7c30-49ec-8abb-e7d1a01d5731`. Dedicated staging evaluator version: `6332d538-bf51-4750-ada0-2394c63ff660`. Production was not deployed.

The 15:04:49 UTC live check returned public feed HTTP 200 and private feed HTTP 404. Actual feed responses showed `@LebanonDebate` and `@Annahar` instead of `x.com`, including archived editions. The 17:00 Beirut edition published at 17:00:10. Readiness remains `relay`, edition artifacts remain enabled, collection budget mode remains `unlimited`, and no feed allowlist was added.

The affected 15:00 Beirut briefing was re-evaluated as append-only v3 job `2de129bc431855d20233f224d842640c18085bd4a7f536e59ec0542c6620ecfb`. It completed without a processing error at 17:08:34. Its inventory contains neither the invented roadblocks nor the supposed detainee testimony/affiliation. Both published stories are covered and source-supported. Its remaining warning is a grounded political criticism assessed by the model as potentially important; the 2/3 recall value is explicitly scoped to partial retained evidence and is not human-calibrated importance.

The original v2 report remains intact, with a `needs_evidence` machine-assisted triage note linking the correction. Its two original paid calls remain settled with retained response keys. The new inventory, entailment and review calls also settled. A private `corrections/{newJobId}.json` manifest records the parent review and original evidence hash. Grafana export succeeded at 17:10:40, and the evaluator tick reported no spending fence.

A focused enrollment rerun also confirms that shared canonical names derive from public source identities rather than per-feed custom titles. The remaining twelve enrollment checks passed in the earlier full run; the final naming adjustment was checked directly along with Worker type checking.
