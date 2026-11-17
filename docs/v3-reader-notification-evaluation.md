# Reader-focused editing and notification preview evaluation — 2026-10-23

## Outcome
- Reject the reader-focused editor prompt. It made English longer and dropped important Arabic coverage. Existing editor, verifier, repair prompts and model routing remain unchanged.
- Reject generated notification copy in the final verification call. A required output contract produced messages, but they introduced factual problems; the optional extension returned no notification.
- Retain a small deterministic notification feature: reuse the final published V3 lead headline plus a remaining-item count, with a safe generic fallback. No extra inference, model output fields or publication stages.
- No deployment or real notification was sent in this task. The retained implementation is local/committed only.

## Controlled paid experiment
User approved 8 calls/$0.30 over two hours, then explicitly approved 2 more calls with at most $0.025 additional reservations inside the same total and original expiry. All **10 calls settled**, actual **$0.0549796**, conservative reservations **$0.2410196**, no outstanding/uncertain charge, retries or repairs. Historical grants, reservations, holds and account settings were not rewritten.

Models: GPT-4.1 editing ($2/M input, $8/M output) and GPT-4.1 mini verification ($0.40/M input, $1.60/M output), via OpenRouter with matching provider price ceilings and no fallback. Actual usage: 30,001 input and 2,546 output tokens. Price sources: https://openrouter.ai/openai/gpt-4.1 and https://openrouter.ai/openai/gpt-4.1-mini.

### Saved-source replay
The same 15 real Telegram posts, original text/URLs/timestamps and actual early publication history were offered in English/Arabic. A constructed 120-minute replay ending 20:20 Beirut deliberately includes older source posts to test repetition and late discovery; this is not claimed to be a newly acquired live reporting window. All inputs are retained exactly in the result artifact. This is a known development corpus, not unseen human-labelled gold or a multi-source accuracy benchmark.

The editor pairs differed only in the system prompt. The candidate added a reader-value paragraph about topic relevance and complementary headline/body detail. Required core developments were fixed before calls: Qantara, Barashit, the Lebanese-front warning and electricity cutoff. Related regional reporting was labelled optional rather than automatically wrong to include or omit.

| Editor | English | Arabic |
|---|---|---|
| Baseline | 4 items, 125 whitespace-delimited words, $0.011880 | 4 items, 118 words, $0.012496 |
| Reader-focused | 4 items, 140 words, $0.012008 | 2 items, 92 words, $0.012248 |

English candidate adds absent-detail filler rather than reducing repetition. Arabic candidate drops both Qantara posts as repeated/insufficiently detailed despite no Qantara item in the provided publication history. It also combines the completed Barashit strike and distinct future warning in one item, contrary to the current editor contract. This grouping alone does not prove it mistook them for the same occurrence; the concrete important omission is sufficient to reject the candidate. Reduced word count is not success when coverage is lost.

### Notification comparison
The baseline drafts were chosen for both languages before running the notification phase, following the approved source-review selection rule.

1. Unchanged final verification on the baseline drafts.
2. Same draft/evidence, with optional notification-writing instructions appended to the verifier. Both languages returned verdicts but omitted the optional notification field. This is not proof that the model cannot write a message; the optional contract did not guarantee one.
3. Two separately authorized strict-contract requests required both `results` and `notification`. They returned actual messages. This follow-up changes the output contract/schema and output-token cap, so it is not presented as a one-variable reliability benchmark against the original verifier.

Actual English AI message:
> Lebanon's electricity board to cut power to unpaid public entities from Nov 2; Israeli airstrikes reported near Baraachit and imminent in Upper Galilee.

Problem: the source names the Upper Galilee Regional Council as the speaker, while the threatened target is the **Lebanese front**. The preview relocates the impending strikes to Upper Galilee. The same request also changed Qantara from ok to fix, claiming the attributed Israeli responsibility was unsupported even though the source explicitly attributes the explosion to Israeli forces. This is an unnecessary rejection in this sample; the experiment does not establish a causal model-wide false-rejection increase from the extra task.

Actual Arabic AI message:
> مؤسسة كهرباء لبنان تقرر قطع التيار عن المتخلفين عن الدفع، وغارات إسرائيلية وتفجير ضخم جنوب لبنان مع إعلان غارات جوية مرتقبة.

Problem: the electricity measure applies to specified **public entities**, not nonpaying customers generally. The compressed preview removes that scope. It is engaging but materially broader than the source. Neither generated message is accepted for live delivery.

Deterministic English alternative from the same draft:
> Lebanon's state electricity company to cut power to public entities with unpaid bills from November 2 · 3 more updates

Deterministic Arabic alternative:
> مؤسسة كهرباء لبنان تقرر قطع التيار عن المؤسسات المتخلفة عن الدفع · ومستجدات أخرى (3)

These alternatives reuse existing approved headline wording. They do not independently fix any error or insufficient qualification already present in a headline. They are less comprehensive than a free-form digest but do not introduce newly generated factual wording.

## Retained implementation
`apps/worker/src/push-preview.ts` derives a preview from the oldest eligible, unaccepted edition, in the same order as the existing acceptance outbox. It reuses the first published V3 story headline, adds the count of that edition's other stories when it fits, and uses the briefing's language. It never truncates a headline: omit the count first, then use the existing generic message if the headline exceeds 180 Unicode code points. Legacy/malformed editions fall back to the generic message.

The lookup uses existing publication, fidelity, projection, ownership, public-feed, active-account, subscription-cutoff and receipt checks. It adds one bounded D1 lookup per attempted push. The sender's preview lookup can fail without blocking the existing generic notification path. Existing signing, manual redirect handling, leases, receipt persistence and settlement remain unchanged. No newly generated summary, private feed preview or new model call is introduced. Coalesced catch-up delivery previews one eligible edition, not every story across all pending feeds.

Files: push-preview.ts, push-preview.test.ts, and a small call-site change in push.ts. Model prompts remain unchanged; the rejected candidate exists only in evaluation artifacts.

## Validation
- 77 briefing tests pass, including three new exact-result/hash/accounting regressions that record the rejected candidates rather than treating JSON validity as success.
- 14 focused sender/preview tests pass, including a real isolated local D1 fixture feeding the actual sender, actual Web Push payload construction, mocked 201 acceptance, durable browser receipt and DONE delivery job.
- Preview tests cover conditions/negation, length fallback, English/Arabic/French, ownership, private/withdrawn/unverified/unprojected records, disabled accounts, subscription cutoff and duplicate receipts. The sender fallback is also exercised when preview lookup is unavailable.
- No real push endpoint is called by tests. No new live edition was generated or deployed. This is not a device-display or deadline-to-publication test.

Exact sanitized paid requests, outputs, source relationships, usage, pricing bounds and settlement read-back: `benchmarks/results/v3-reader-notification/summary.json`. All readable drafts and verdicts: `benchmarks/results/v3-reader-notification/outputs.md`. Sensitive attempt/reservation artifacts remain in ignored `.local-reports/v3-reader-notification/`.

## Remaining limitations
This small corpus does not establish general editorial reliability. The proposed relevance/brevity instruction is rejected, so those quality problems remain. Free-form AI notifications need a stronger demonstrated solution before adoption; the fact that adding a required JSON field works mechanically does not make its text accurate. The retained headline preview can be deployed only after staging approval and then checked on a fresh nonempty publication; its behavior is currently proven by local fixtures and saved texts, not a live device notification.

Both briefing-package and Worker TypeScript checks passed. Whitespace checks passed. The strict AI-notification extension increased recorded verifier cost by about $0.0002 per language in this sample; cost was not the rejection reason. The factual errors were. No broad latency or recurring full-pipeline performance improvement is claimed.
