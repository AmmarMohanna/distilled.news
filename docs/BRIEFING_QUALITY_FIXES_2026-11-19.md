# Observed briefing and evaluator failures — 19 November 2026

Branch: `fix/briefing-accounting-and-quality`, based on main `4710b31e`.
Scope: implementation and offline verification only. No deployment, new paid inference, historical financial changes or rewritten evaluation results.

## Findings and repairs

1. **An omitted source decision discarded valid selected work.** The retained Lebanon production run had a corrected editor batch selecting three drafts but missing S44. The old policy deferred all 91 source revisions in that batch. The versioned `isolate-unaccounted-sources-v2` policy validates received decisions and retains valid selected drafts for subsequent novelty/factual verification, while carrying missing sources forward. Conflicting/fabricated decisions cannot be salvaged. A missing decision cannot manufacture QUIET. Malformed single-batch output retains the existing error/recovery behavior; provider and uncertain-payment errors propagate.
2. **Consolidation silently removed selected developments.** Retained AI output discarded a coding-model release and an infrastructure dataset as routine/background despite the feed interests. New frozen inputs use `preserve-selected-developments-v1`: consolidation merges/shortens rather than introducing an independent significance threshold. Unrepresented selections are restored and still undergo existing verification. Occurrence checks now return validated explicit update/correction links under this policy. This does not establish that every restored selection is important or every semantic merge correct.
3. **Evaluator contradictions and omission/history disagreements.** Protocol v4 reuses the existing research consistency correction, bounded to one received-output correction. Original responses and adverse findings persist; invalid evidence and exhausted corrections remain failures. A conditional candidate-blind history diagnostic can dispute an omission but cannot silently turn it into a pass. Disagreements become uncertain with original judgments preserved. The headline recall denominator includes uncertainty; conditional recall and lower/upper bounds are separate. Source inventories remain independent of candidate prose. Already-paid v3/v2 jobs retain their original request protocol and identities.
4. **Optional owner diagnostics could break reader delivery.** Source-health collection is now owner/admin-only and isolated from published-data reads. Diagnostic failure produces an explicit localized warning, while authorization, withdrawal/version checks and publication reads remain authoritative. This fixes an injected, reproducible failure mechanism; it does not eliminate real D1 outages. The live staging 503 was observed, but its exact underlying D1 exception was not independently traced.

## Recorded-response replay (no provider transport)

Frozen input SHA-256: `8424ef8a8556c1f11ac4cee12cfd510af63c46dcd4462ace96c346ab4336789a`.

| Replay | Observed result |
|---|---|
| Original policy | Exact match of nine retained requests/responses; reproduced three published items and 91 deferred revisions |
| New accounting policy | Exact match of four editor requests/responses; seven consolidation candidates instead of four |
| Changed downstream request | Deliberately stopped with `OFFLINE_UNRECORDED_REQUEST`; no new consolidation or verification result exists |
| New inference cost | $0; zero provider calls |

Blocked consolidation request hash: `efb25280f36afabb8a898b5d5e8bf4603a286713853606f94769af4ae608735f`.
The replay demonstrates candidate recovery, **not** additional verified publications or a measured editorial-quality improvement. Private evidence and paid records remain in ignored local artifacts; no credentials or retained raw payloads are committed.

## Verification

- Briefing engine: 513 tests.
- Evaluator: 156 tests, including paid-protocol preservation, bounded correction, history disagreements and conservative recall aggregation.
- Web: 267 tests; production web bundle built.
- Worker feed-cache routes: 13 tests, including owner diagnostic failures and anonymous/public isolation.
- Full V3 publication integration run: 111 passed, four failed initially. Three exposed overly broad malformed-output isolation, now fixed without changing their assertions. The fourth exceeded its timeout during the full run. All four passed on targeted rerun, including duplicate-inference/recovery assertions.
- Briefing, Worker, Web and evaluator TypeScript checks; Worker dry-run bundle.

Reproduction commands (from package directories unless otherwise stated):

```text
packages/briefing: node node_modules/vitest/vitest.mjs run
apps/web: node node_modules/vitest/vitest.mjs run
apps/web: node node_modules/vite/bin/vite.js build
apps/worker: node node_modules/vitest/vitest.mjs run src/feed-read-cache.test.ts
apps/worker: node node_modules/vitest/vitest.mjs run src/v1-intelligence/v3-window.test.ts
root: node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts
root: node apps/worker/node_modules/typescript/bin/tsc -p <package>/tsconfig.json --noEmit
apps/worker: node node_modules/wrangler/bin/wrangler.js deploy --dry-run --containers-rollout=none --outdir ../../.local-reports/worker-build
```

Evaluator tsconfig is `evaluation/briefing-quality/worker/tsconfig.json`.

## Remaining qualification

These changes are not deployed. Fresh-model publication quality, latency and additional conditional evaluation cost have not been measured. Existing spending reservations/accounting bound every new evaluator stage; no historical UNKNOWN request is replayed. Live staging qualification and any subsequent production rollout require separate deployment authorization. Passing regressions do not prove universal factual accuracy, comprehensive selection or uninterrupted service.
