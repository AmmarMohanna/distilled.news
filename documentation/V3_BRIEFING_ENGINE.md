# V3 briefing engine

Branch `v3/fresh-start`, package `packages/briefing`. Wired into scheduled editions behind
`BRIEFING_ENGINE=v3` (off by default; the legacy path is unchanged when off or when no model
credential is configured). It runs on the legacy edition path, so it applies only while
`PRODUCT_FEEDS_ENABLED` is not `'true'`.

## What went wrong before

V2 chained claim extraction, event construction, editorial planning, writing and verification. Each
stage enforced strict cross-reference invariants on model JSON (for example claim ownership per
group), and any violation rejected the whole briefing. The saved evidence shows about $0.25 and over
200 s for three articles with nothing published. More stages meant more ways to reject, and the
checks guarded structure rather than whether the prose matched the sources.

## V3 design

1. **Prepare (no model).** Normalise, drop empty items, fold exact/URL/near duplicates (every copy
   stays citable), order related articles together, trim very long articles (head and tail kept),
   and select a bounded set of previously published items the reader must not be told again.
2. **Edit (1 call).** One editor call chooses what matters, merges coverage of the same event, writes
   the items, and marks each `new`, `update` or `correction` against the already-told items. It ranks
   against a reading budget that scales with the window (about 33 s / 110 words for 30 min, about
   3 min / 580 words for a day). The budget is a guide the editor may exceed, not a quota. Windows
   larger than about 90k characters are edited in parallel chunks and one consolidation call, the
   only stage that sees every draft, makes the cross-window cut.
3. **Verify (1 call, cheaper model).** An independent model checks each item against only the sources
   it cites and the already-told items: changed numbers, dropped qualifiers, lost attribution or
   negation, plan-as-fact, merged events, repetition. Mechanical hints (a number not in the cited
   sources) are passed along but are never a verdict by themselves.
4. **Repair, then drop individually.** A flagged item gets one targeted rewrite and one re-check. An
   item that still fails is dropped on its own; the rest publish.
5. **Outcomes.** `published`; `empty` (nothing worth the reader's time, a valid result); `rejected`
   (items drafted but none survived; nothing saved, articles stay pending); or an error (provider
   unreachable or unusable output twice; nothing saved). In the worker, `published` and `empty`
   advance an evaluated-until watermark; `rejected` and errors do not, so the next window re-reads
   the same articles with the new ones. Edition writes keep the existing unique
   (feed, cadence, window) key, so a retry cannot publish twice.

Normal path: 2 model calls. With one repair: 4. There is no schema-strict structured output; replies
are parsed leniently and unusable ones get exactly one corrective retry.

## Evidence (read the limits)

**How the model calls were served.** This sandbox has no provider key and its egress policy blocks
OpenRouter and Cloudflare. The engine's real prompts were therefore answered by independent model
instances in the development session (Sonnet as editor/repair, Haiku as verifier), each seeing only
the request. This exercises the real prompts, parsing, verification, repair and persistence logic on
real articles. **It does not measure production cost or latency**, and it is not the production
model. Reports are in `packages/briefing/eval/results/`.

Real corpus: 19 posts from `anthropic.com/news` (Aug-Oct 2026), including the public-benefit-fund
article from the earlier failed set. The Laplace and Replit article texts were never committed and
are not available; the saved failure schemas remain only as diagnostics.

| Scenario | In | Out | What happened |
|---|---|---|---|
| real-continuity (3 windows) | 4 articles | 4 items | Verifier caught a misread of the METR source (an exception list written as an exclusion); repair fixed it. On the fund article it caught a headline that dropped "subject to stockholder approval"; repair fixed it. Final text matches the sources. |
| synthetic-continuity (fictional company) | 7 articles | 2 + 2 items | Two sources merged; noise skipped; update written as only what changed; pure recap skipped; rumor kept attribution and hedges; pending-permit plan kept as a plan. |
| real-volume (all 19 in one window) | 19 | 8 items, 547 words | First run without the budget surfaced 18 of 19 stories, which fails the "do not overwhelm" goal. After adding the budget and consolidation cut: 8 items led by the safety incidents, the fund and the evaluator access. Routine items were cut. |

I audited every figure and causal claim in the 8 volume items, and in the continuity items, against
the source text by search. No factual error survived in the published items. The verifier approved
all 8 volume items in one pass; that sweep alone is not evidence, so the audit was independent.

Editorial concern, unresolved: in the volume run the large Cyber Mission launch was folded under the
narrower Cyber Verification Program item and the midterms safeguards and Singapore office were cut.
That is a judgment call I would want a human editor to review on live runs.

## Not demonstrated

- Real provider cost and latency. Token counts observed in the volume run were 48k in / 3.4k out for
  4 calls; at the list prices in `DEFAULT_PRICES` (unverified against current billing) the
  all-GPT-4.1 upper bound is about $0.12 for a 19-article window and a typical 2-call run is a few
  cents or less. Treat these as estimates, not measurements.
- Behaviour on production feeds, Telegram-style short posts, Arabic/French feeds, or sustained
  multi-day runs.
- The shorter-brief prompt change was exercised in the continuity, synthetic and volume runs; the
  Oct 8 daily report in `results/` predates it and shows the longer style.
- A deployed worker run with real D1 data. Adapter behaviour is covered by unit tests with a fake
  repository only.
- Full worker test suite result (see the commit message / session notes for its status).

## Running it live

```
ANTHROPIC_API_KEY=... pnpm --filter @distilled/briefing exec tsx eval/run.ts \
  --scenario real-continuity --backend anthropic --editor claude-sonnet-5-5 --verifier claude-haiku-5-5
OPENROUTER_API_KEY=... ... --backend openrouter --editor openai/gpt-4.1 --verifier openai/gpt-4.1-mini
```

Output includes per-window calls, tokens, cost and wall time. Enable on one feed first with
`BRIEFING_ENGINE=v3` plus `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`
(`BRIEFING_EDITOR_MODEL` / `BRIEFING_VERIFIER_MODEL` override the defaults).
