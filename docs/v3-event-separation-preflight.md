# V3 event-separation experiment: offline preflight

## Scope

Test the user's explicit one-development-per-item paragraph as a **single replacement** of the existing grouping paragraph. Editor and consolidation are tested separately. No broad rewrite, history-style experiment, model switch, verifier change, reading-budget change, compression change, JSON-example change, source-processing change, deployment or live-feed mutation is included. The repaired re-verification context, history prose deduplication and corrected date semantics remain untouched.

Candidate: `benchmarks/results/v3-event-separation/candidate.json`. It is inactive and not model-qualified. The paragraph is the user's proposed wording, not a claim that stronger instructions will work.

## Offline replay findings

`node benchmarks/v3-event-separation.mjs` replays the exact saved responses without inference:

- The reader-focused Arabic editor combined the reported Baraachit strike (`S10`) with the separate prospective-strike announcement (`S13`). The English baseline kept them separate.
- Two Qantara reports (`S7`, `S8`) describe the same occurrence; combining them is a valid control. Stronger separation must not turn that into duplicate items.
- Global-ranking consolidation combined EFS and Barclays adoption, distinct announcements. That remains a retained failure case.
- **Evidence correction:** the reader-notification verifier requests checked the separate four-item baseline. The merged Arabic candidate's exact body is absent from their `ITEMS TO CHECK`. This artifact therefore does not demonstrate verifier approval of that merge. Both factual support and development grouping require separate assessment, but an unobserved verdict must not be invented.

The replay's reference co-occurrence flags are review aids for these narrowly labelled posts/drafts. They are not a semantic classifier, do not infer that all cited facts were reported, and are not part of V3 runtime. A flag requires source review; shared context citations do not universally imply a false merge.

## Frozen paid plan — NOT AUTHORIZED

Six GPT-4.1 calls, maximum summed conservative reservations **$0.345466**, requested ceiling **$0.35** for two hours:

1. One candidate Arabic editor call on the retained known failure corpus; reuse its already recorded baseline.
2. Four calls: unchanged baseline versus grouping candidate, English and Arabic, on an actual two-post window containing a reported Iranian Hormuz proposal and a separate conditional threat.
3. One candidate consolidation call on the exact retained 19-draft input; reuse the saved baseline.

No retries, repairs, additional verification calls, publication, notifications or deployments. Every paid request would use the existing durable reservation/accounting path. Stop on uncertain charges. Historical grants, holds, settlements and the account ceiling stay unchanged. The earlier $5 authorization is **not reused**. No paid request has been sent for this experiment.

The proposed request bounds retain $2/M input and $8/M output provider price ceilings, a 4,000-token output cap, and an input upper bound of serialized UTF-8 bytes plus 1,024 tokens. Complete frozen requests remain local in `.local-reports/v3-event-separation-preflight/plan-NOT-AUTHORIZED.json`; public source inputs, hashes, systems, scoring and request identities are in `preflight.json`.

The two-post window was not used in the earlier paid prompt-tuning runs, but was read during prior live-quality assessment. It is not independent human gold. A disclosed hypothetical Iran/diplomacy/security interest profile makes both announcements relevant; original text, source IDs, timestamps, window and prior reader history remain unchanged. This is an isolated evaluation input, not a changed live Lebanon feed. The reported proposal must not become an agreement or an opened strait, and the conditional threat must not become an actual attack.

Evaluate false merges, false splits, important-development recall, justified omission reasons, attribution/conditions/certainty, continuity and actual cost/latency. A shorter answer or more items is not automatically better. Do not promote the candidate if it separates stories by simply losing important ones. Compare source meaning manually; citation counts do not establish coverage. No new mandatory product validation stage is proposed.

## Extended dataset availability

The committed report describes 95 windows, 13 feeds and 565 distinct acquired records. Its ignored export folder is absent from the accessible current workspace and checked original/continuation worktree locations. The report alone cannot establish source content or labels. The user has been asked for the export location. No missing data was reconstructed, inferred from URL matches or fetched from live feeds.

The extended export also overlaps the earlier pilot and lacks initial published history for some tracks. Any future reuse must retain those qualifications; exact URL/text matches are continuity candidates, not labels for updates or corrections.

## Checks and state

- `node --test scripts/v3-event-separation.test.mjs`: **4 tests passed**.
- `pnpm --filter @distilled/briefing typecheck`: **passed**.
- Offline replay: **0 paid calls, $0**.
- Runtime prompts: **unchanged**.
- Paid comparison: **waiting for new explicit spending authorization**.
- History-style experiment: **deferred until event-separation results**, not combined into this comparison.
