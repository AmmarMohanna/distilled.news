# V3 briefing engine

Branch `v3/fresh-start`, package `packages/briefing`, worker adapter `apps/worker/src/briefing-v3.ts`
and `v3-spend.ts`. Switched on per deployment with `BRIEFING_ENGINE=v3`; off by default, and the legacy
path is unchanged when it is off. It runs on the legacy edition path, so it applies only while
`PRODUCT_FEEDS_ENABLED` is not `'true'`.

**Status: not ready for unattended paid publication.** Everything below was exercised with stand-in
models in a sandbox with no provider access. Real cost, real latency and a deployed run are unmeasured.

## What went wrong before

V2 chained claim extraction, event construction, editorial planning, writing and verification. Each
stage enforced strict cross-reference invariants on model JSON, and any violation rejected the whole
briefing. Saved evidence: about $0.25 and over 200 s for three articles, nothing published.

## Design

1. **Prepare (no model).** Normalise, fold exact/URL/near duplicates (every copy stays citable), order
   related articles together, trim very long articles, and select a bounded set of previously
   published items the reader must not be told again.
2. **Edit (1 call).** One editor call chooses what matters, merges coverage of the same event, writes
   the items, marks each `new`/`update`/`correction`, and lists the on-topic articles it left out with
   a reason. It ranks against a reading budget that scales with the window (about 33 s / 110 words for
   30 min, about 3 min / 580 words for a day). The budget is a guide, not a quota. Windows over about
   90k characters are edited in parallel chunks, then one consolidation call, the only stage that sees
   every draft, makes the cross-window cut. Lead stories (importance 1) cannot be cut: this is enforced
   in code, not only in the prompt. Related-but-distinct announcements must stay separate items.
3. **Verify (1 call, cheaper model).** An independent model checks each item, headline included,
   against only the sources it cites and the already-told items: changed numbers, dropped hedges or
   qualifiers, lost attribution, plan-as-fact, merged events, repetition (`redundant`).
4. **Repair, then drop individually.** A flagged item gets up to two repairs, each followed by a
   re-check (extra calls only when something is flagged). The repair prompt demands the smallest edit
   and forbids adding claims. An item that still fails is dropped alone; the rest publish.
5. **Outcomes.** `published`, `empty` (nothing worth the reader's time; valid), `rejected` (items
   drafted but none survived), or an error. Every omission, by editorial choice or by the safety cap,
   is recorded with its reason and articles (`result.omitted`) and logged per run.

Normal path: 2 model calls. With repairs: 4-6. Replies are parsed leniently; unusable ones get one
corrective retry.

### Carry-forward (worker)

V3 reads from its **own per-feed cursor**, not from the scheduled window. (An earlier version of this
document claimed carry-forward while the code only filtered by a watermark and fetched the current
window, so rejected articles would not have come back; that was wrong and is fixed.)

- `published`, `empty`, `rejected`: the cursor advances to the end of what was read.
- An item dropped by verification sends its articles (those no published item cites) back for one
  more attempt in a later run, then records them as abandoned (kept, last 25, for operators). An item
  dropped as `redundant` is not retried.
- Provider error or budget refusal: nothing changes; the next run re-reads the same articles.
- Windows skipped by the scheduler are covered because reading starts at the cursor.
- A fuller-than-1000-message window is cut at a timestamp boundary and continued next run.
- Cursor and pending list are one setting value, so a crash cannot make them disagree. If the worker
  dies after saving an edition but before saving that state, the next run re-reads the same articles
  but the editor sees the saved edition as already told. This makes a duplicate unlikely, not
  impossible.

### Spending protection (worker)

V3 **does not run** without `BRIEFING_V3_DAILY_BUDGET_USD` (a positive number). Every provider attempt:

- is reserved at a pessimistic cost (3 characters/token in, the full output allowance out) in the D1
  table `v3_model_spend` by one atomic conditional INSERT against a rolling-24-hour deployment cap and
  a per-run ceiling (`BRIEFING_V3_RUN_BUDGET_USD`, default $0.50), before the request is sent;
- is settled to the actual cost afterwards;
- is released only when the provider definitely refused it (429/503/4xx). A timeout, dropped
  connection, other 5xx, or crash leaves its worst-case hold counted for 24 hours and is never
  automatically retried;
- is refused before any call if the model has no price (`BRIEFING_PRICES_JSON` adds prices) or the
  run's call limit is reached.

**Limits of this guard:** it is independent of V2's account authorizations, grants and unknown-usage
liabilities (the `v1_model_spending_*` tables); V3 does not read or write them. Set the V3 cap as a
fraction of what you are willing to spend, knowing V2's existing holds are separate. Built-in prices
(`DEFAULT_PRICES`) are from my knowledge of list prices and are unverified against current billing;
the cap is only as good as the prices.

## Evidence (read the limits)

**How the model calls were served.** The sandbox has no provider key and its egress policy blocks
OpenRouter and Cloudflare. The engine's real prompts were answered by independent model instances in
the development session (Sonnet as editor/repair, Haiku as verifier), each seeing only the request.
This exercises real prompts, parsing, verification, repair and persistence on real articles. **It does
not measure production cost or latency**, and these are not the production models. Reports and raw
JSON are in `packages/briefing/eval/results/`; the harness is `eval/run.ts`.

Corpus: 19 real posts from `anthropic.com/news` (Aug-Oct 2026), including the public-benefit-fund
article from the earlier failed set. The Laplace and Replit article texts were never committed and are
unavailable.

### Selection, scored against blind labels

Three independent judges (2 Sonnet, 1 Opus) tiered each article MUST / SHOULD / COULD / SKIP from its
title and first 1,500 characters, blind to V3's output (`eval/labels/anthropic-news.json`). They split
on 3 of 19 articles. These are model judgments of the same family as the system, not human editors:
treat them as a smoke alarm for dropped news and noise, not a final verdict. `eval/score-selection.ts`
reports recall and the reason for every miss.

| Window (final configuration) | In | Items / words | Calls | MUST | SHOULD | COULD |
|---|---|---|---|---|---|---|
| Normal day (Oct 8) | 3 | 3 / 235 | 2 | 1/1 | 2/2 | none |
| Mid-size (Oct 1-12) | 7 | 6 / 391 | 4 | 1/1 | 4/4 | 1/2 |
| Stress, all 19 | 19 | 10 / 594 | 6 | 4/4 | 6/9 | 0/6 |

What this shows and does not show:
- Across every run MUST recall was 4/4 in the stress window and nothing rated COULD leaked into it.
  The 3 SHOULD articles missing from the stress window each have a recorded reason.
- **Borderline SHOULD choices are unstable run to run.** The Cyber Mission launch was cut in one stress
  run and published in the next, and the Cyber Verification expansion went the other way. Only two
  stress samples exist. Do not read the exact set as deterministic.
- Selectivity is budget-driven: when everything fits the budget, low-tier items are published (the
  7-article window kept the Frontier Academy item, rated COULD, at importance 3).
- A MUST article was lost once, in an earlier run: the usage-policy item was dropped after one failed
  repair, because the repairer added an unsupported phrase. That is why items now get two repairs and
  the repair prompt forbids additions. The fix was re-run on that scenario and the item published.

### Accuracy

The verifier caught real errors in these runs: a hedge dropped from the fund headline, an exception
list misread as an exclusion (METR), a headline dropping "early evidence suggests ... around"
(three independent runs), a qualifier lost from the policy item ("in a law enforcement or criminal
justice process"), and an overgeneralised enforcement claim. Repairs fixed them.

**Correction to my earlier claim.** I previously reported that my audit of the published items found
no factual error. That audit checked figures and body claims; it did not check headlines for stripped
hedges, and an earlier stress run published the distillation headline without "early evidence
suggests", which the verifier then passed. Headlines are now held to the body's hedges in the editor
prompt and checked by the verifier. The verifier approving everything in one pass is not evidence; my
own source checks were the independent audit, and they were not exhaustive.

Synthetic regression (fictional company): two sources merged, noise skipped, an update written as only
what changed, a pure recap skipped, a rumor kept attribution and hedges, a pending plan stayed a plan.

## Tests

Engine 35, worker adapter 11 (carry-forward, partial failure, abandonment, truncation, fail-closed
config), spend guard 11 against a real D1 (atomic admission under concurrency, settle, release, uncertain
holds that cannot be released, 24h ageing, unpriced model refusal), core 43. Migration `0067` applies
with `wrangler d1 migrations apply --local`. The full worker suite did not finish in 25 minutes here and
was stopped. The worker tests touching the edited legacy path ran: 59 of 60 pass; the failure
(`development-pipeline.test.ts`) and `migrations-clean.test.ts` fail identically on the untouched
baseline because the test splits migration SQL on `;` and trips on V2's trigger migration 0063.

## Not demonstrated

- Real provider cost and latency. Observed volume run: 57.7k tokens in / 4.6k out over 6 calls. At the
  built-in prices an all-GPT-4.1 upper bound is under about $0.15 for that 19-article window; a typical
  2-call day is a few cents or less. These are estimates, not measurements.
- Telegram-style short posts, Arabic or French feeds, multi-day autonomous runs, concurrent feeds.
- A deployed worker run with real D1 data and the real scheduler. The adapter is tested against a fake
  repository, and the spend guard against a real D1, but not end to end.
- Whether the real `listRawMessagesForWindow` timestamp formats mix millisecond and non-millisecond
  forms; the cursor uses string comparison like the rest of the repository.

## Before enabling it for real

1. Verify `DEFAULT_PRICES` (or set `BRIEFING_PRICES_JSON`) against actual billing.
2. Choose `BRIEFING_V3_DAILY_BUDGET_USD` deliberately, small to start.
3. Enable on one non-public feed. Watch the `v3_briefing` log line: status, dropped, omitted with
   reasons, carried, abandoned, tokens and cost.
4. Run `eval/run.ts` live to get real cost and latency.

```
ANTHROPIC_API_KEY=... pnpm --filter @distilled/briefing exec tsx eval/run.ts \
  --scenario real-moderate --backend anthropic --editor claude-sonnet-5-5 --verifier claude-haiku-5-5
OPENROUTER_API_KEY=... ... --backend openrouter --editor openai/gpt-4.1 --verifier openai/gpt-4.1-mini
```

Worker configuration: `BRIEFING_ENGINE=v3`, `BRIEFING_V3_DAILY_BUDGET_USD` (required), one of
`OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` (OpenRouter wins if both), optional
`BRIEFING_EDITOR_MODEL`, `BRIEFING_VERIFIER_MODEL`, `BRIEFING_V3_RUN_BUDGET_USD`, `BRIEFING_PRICES_JSON`.
