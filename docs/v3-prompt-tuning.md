# V3 prompt v1 freeze and concise-briefing tuning

## Outcome

The current prompts are frozen as **v3-prompts-v1**, from `33c1ab500b0def676aa290e9cd91e24bcbf44ba4`. This benchmark name does not change the product's durable `promptVersion: 3` or reinterpret old operations. No runtime prompts, models, budgets, feed data or deployments changed. The source/item date-context correction is included in the frozen repository baseline; this report does not imply that correction was deployed.

**Short, useful main ideas are the objective. More facts, more words or more items are not automatically better.** Added length earns its place only when needed to communicate an important development accurately. None of the tested changes met the acceptance threshold, so all were rejected.

11 real paid calls settled for **$0.202510**, against the newly authorized $5 maximum. Outstanding reservations for this task: **$0**. The sum of conservative per-request reservations was $0.969980; that is not an actual charge. An older GLM task's unresolved $0.005 reservation remains untouched. No further paid testing is needed to reject these candidates.

## Frozen evidence and method

- Baseline: `benchmarks/prompts/v3-v1.json`, exact source module, system prompts, reading budgets and SHA-256. The snapshot includes user-prompt builders, not just system strings.
- Development batch: 15 retained real Arabic Telegram posts, original two-hour window and publication history, evaluated in English and Arabic. Source timestamps/text were not altered to pretend this was a 30-minute batch. Four important developments: EDL's November 2 nonpayer cutoff; Baraachit strike; Qantara explosion (two reports of one occurrence); prospective Lebanese-front strikes attributed to the Upper Galilee Regional Council. Optional regional statements are not mandatory coverage.
- Larger replay: all 19 retained full Anthropic articles, normal preparation and 90,000-character chunking; two actual chunk editor outputs became the identical 19-draft input for every consolidation variant. This is historical backlog replay, not a fresh daily window. Original source date inconsistencies are preserved, not silently corrected.
- Three-draft transfer control: source-supported reference drafts on the benefit fund, METR access and Genesis funding. These are new draft inputs but reuse articles from the larger replay. Despite legacy artifact names `heldout-*`, **they are not independent unseen-source holdout evidence**. No candidate qualified for further held-out promotion testing.
- Identical models and parameters: OpenRouter GPT-4.1, temperature 0.1, JSON mode, 4,000 output-token cap, no retries. Existing atomic reservation/settlement and two-slot provider coordination were used; calls ran serially. Initial one-slot admission was refused before any request was sent. Using the existing two-slot setting preserved the older hold and reserved every new operation.
- Engineering review checked actual source passages, not citation count alone. Labels are AI-assisted engineering judgments, not independent human gold. The verifier was not called: these editor/consolidation experiments cannot establish verifier quality, repaired publication or complete factual accuracy.

## Results

Words include headline and body; Arabic whitespace counts are descriptive, not directly comparable with English. Costs below are actual provider-reported charges. Latencies are individual inference times, not acquisition-to-publication times.

| Test | Items | Words | Cost USD | Model latency |
|---|---:|---:|---:|---:|
| Lebanon baseline EN | 4 | 124 | 0.011568 | 4.071 s |
| Main-idea policy EN | 4 | 133 | 0.010454 | 2.788 s |
| Lebanon baseline AR | 4 | 123 | 0.012030 | 3.572 s |
| Main-idea policy AR | 3 | 97 | 0.011444 | 3.249 s |
| Larger consolidation baseline | 13 | 983 | 0.020196 | 9.046 s |
| Global-ranking consolidation | 11 | 921 | 0.019154 | 6.882 s |
| Compression consolidation | 12 | 957 | 0.019752 | 7.730 s |
| Transfer control baseline | 2 | 136 | 0.003384 | 2.204 s |
| Transfer control compression | 2 | 112 | 0.003292 | 1.841 s |

Two shared chunk calls cost $0.091236 (9.323 s and 7.019 s). Across all 11 calls, inference time summed to 57.725 s; serial harness durations including accounting summed to 86.742 s. This is not a production briefing delivery benchmark. Single samples do not establish statistically reliable cost or latency improvements.

### Editorial recall and continuity

The baseline included all four priority Lebanon developments in both languages within its existing 140-word guide. Neither candidate improved important-development recall. The Arabic candidate put the observed Baraachit strike and a separate prospective strike announcement into one item. The main ideas remain in its text, so this is an event-grouping regression, not a missing-development count. Both variants excluded previously communicated stories in this batch. Meaningful updates and corrections were not newly qualified by this experiment.

The current 30-minute guide remains approximately 110 words and is not a hard quota. This two-hour case does not prove that 110 words always suffices, or that it suppresses important news. We did not increase any reading budget.

### Conciseness

The English main-idea candidate was longer, adding "No details on casualties or damage were provided" and "No further details were given." These are the unwanted filler it should avoid. The shorter Arabic output cannot count as a win because it combined separate developments.

The larger baseline retained 983 words despite a 580-word guide. Its consolidation instruction to keep surviving draft facts unchanged encourages copying long drafts. Permitting meaning-preserving compression reduced the total only to 957 words and introduced the same unrelated EFS/Barclays grouping as the global-ranking candidate. The transfer control shortened from 136 to 112 words but still cut METR's evaluation-access development; it also returned draft reference 3 although only 0–2 existed. The current engine filters invalid references, so this is a model-output defect, not proof of an invented citation reaching publication.

### Lead protection

The two real chunk outputs marked four drafts importance 1: EFS, the $100 million Academy, Cyber Verification and Cyber Mission. It would be wrong to assume the Academy is trivial solely because it is training. No clearly low-value protected lead was demonstrated here, and no candidate actually cut a lead. The global-ranking candidate combined EFS with Barclays, unrelated announcements, instead.

`engine.ts` additionally restores omitted/cut importance-1 drafts. A prompt-only rule change therefore cannot establish an improved running implementation. That protection remains unchanged; this experiment did not justify loosening it.

### Factual grounding and attribution

Lebanon baseline bodies retained reported/attributed language and prospective status rather than asserting that announced future strikes already occurred. EDL's actual November 2 effective date remained. Ordinary concise source-supported statements are not treated as false simply for omitting optional background.

The larger draft set still warrants factual scrutiny: the fund headline omits the stockholder-approval condition present in its body; "to invest" is firmer than Accenture's source "expect to invest"; and the watermark draft described implemented watermarking where the source starts with future models (that draft was cut by consolidation). These are retained review targets, **not measured verifier false approvals**, since no verifier ran. Candidates did not resolve them. A structural JSON pass is not factual qualification.

## Changes retained, reproducibility and checks

Only the frozen baseline, sanitized exact outputs, corpus identities/mappings, rejected-candidate systems, request hashes, ledger summary, this report and offline evidence checks are retained. No deterministic copy filter was added. No production/editor/verifier/repair behavior changed.

Artifacts:

- `benchmarks/results/v3-prompt-tuning/inputs.json`: original Lebanon corpus/history, existing Anthropic corpus hash, prepared refs, drafts, labels, systems and request identities.
- `benchmarks/results/v3-prompt-tuning/results.json`: all exact parsed responses, usage, timing, decisions and limitations.
- `benchmarks/results/v3-prompt-tuning/briefings.md`: all generated headlines/bodies and references for human review; these are unverified drafts, not published briefings.
- `benchmarks/results/v3-prompt-tuning/ledger-summary.json`: independent read-back of this task's 11 settled operations.
- `.local-reports/v3-prompt-tuning/`: append-only progress, exact requests/provider responses, authorization, runner, reservations and ledger read-back; local only, no credentials committed.

Validation: **96 tests passed across 20 briefing test files; briefing TypeScript check passed.** Unrelated pre-existing CI/UI work was left untouched. No Worker runtime files changed, so no deployment or new Worker integration testing was needed for this evidence-only change.

## Next action

Keep the concise baseline. Before another prompt search, have a human editor review the exact larger replay and label a small unseen real news batch by the main ideas a reader needs—not by exhaustive source fact coverage. This would make future comparisons about better distillation rather than merely different word counts. The remaining $4.797490 is unused authorization, not a reason to keep experimenting.
