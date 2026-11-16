# Continuous personalized news research

Offline implementation from `research/binding-budget@92be8812`, isolated on `research/continuous-value`. Start with [REPORT.md](REPORT.md), [PROTOCOL.md](PROTOCOL.md), and [EXECUTION_PLAN.json](EXECUTION_PLAN.json). No paid inference is authorized or enabled by these commands.

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/continuous-value/offline.ts
node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts evaluation/briefing-quality/continuous-loop.test.ts evaluation/briefing-quality/continuous-editors.test.ts evaluation/briefing-quality/continuous-metrics.test.ts evaluation/briefing-quality/continuous-plan.test.ts evaluation/briefing-quality/continuous-packets.test.ts
node node_modules/typescript/bin/tsc -p evaluation/briefing-quality/continuous-value/tsconfig.json
python evaluation/briefing-quality/continuous.py --output evaluation/briefing-quality/private/continuous-value-checks
```

`offline.ts` freezes deterministic source/reference/code hashes, then exercises scripted reference controls. It writes public control summaries and ignored private full trajectories. These outputs are harness checks, **not model quality scores**. `EXECUTION_PLAN.json` pins source files with LF-normalized SHA-256 and the exact serialized source dataset with byte SHA-256. Re-running after source changes creates a new proposed freeze; preserve any paid campaign's immutable snapshot before execution.

`loop.ts` accepts an injected generator and owns actual publication history. `editors.ts` adapts the existing V4 engine and existing strong single-generation baseline; it records raw drafts and every attempted call before parsing. `packets.ts` builds blinded cases for the existing evaluator, retaining failed opportunities separately. `metrics.ts` supplies exact-control lower bounds, operational trajectories and cost receipt accounting. Legitimate unmatched paraphrases are unknown.

There is deliberately no new paid provider transport or financial ledger. After explicit approval, connect these interfaces to the existing `budgetPort`/`FundedRuntime`, freeze requests and receipts, reserve the campaign exposure before dispatch, and preserve UNKNOWN states. A cap is not enforced merely by importing this offline harness. Do not run an unaccounted ad-hoc port.

Dependencies use the repository's installed package/Worker types. The local source-path typecheck prevents stale linked package exports from masquerading as current branch types. Production code, deployment settings and existing protocols are unchanged.
