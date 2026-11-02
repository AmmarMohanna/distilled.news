# Offline editorial benchmark

See [evaluation and rubric](../../docs/v3-editorial-distillation.md).

- `corpus.json`: original evidence, prior reader memory and provisional labels.
- `baseline-v4.json`: exact runtime V4 system snapshot, not a deployment change.
- `comparison.mjs`: two isolated candidates and strict request-pair audit; descriptive metrics leave semantic fields null.
- `freeze-corpus.mjs`: reproducible source assembly from retained committed artifacts. Run from repository root only when intentionally reviewing a new corpus version; hash tests reject unreviewed drift.

Prepare: `corepack pnpm exec vitest run --config benchmarks/editorial-distillation.vitest.config.ts`.
Test: `corepack pnpm --filter @distilled/briefing exec vitest run test/editorial-distillation.test.ts`.

Preparation makes no network or paid requests. Frozen expected labels are never included in model inputs. Candidate quality, model latency and full-pipeline cost remain unmeasured until authorized real comparison and independent review.
