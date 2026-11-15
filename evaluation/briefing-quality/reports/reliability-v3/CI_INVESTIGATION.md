# CI investigation and final verification

Research base: `f9a7a515`; integration ancestor: `c41d33b04d24b72efa7c7edf7ede0c9ad721f38f`.

## Applicable local checks

The final continuous run passed all seven checks: 68 evaluation Python tests, 159 evaluator/research Vitest tests, 373 existing engine tests, three exporter tests, and three TypeScript checks. The 14 research Python tests and existing briefing-package TypeScript check also passed separately: **617 tests, four typechecks**. This is offline regression verification, not a quality score.

Private logs: `private/funded-v3/final-checks/20261115T150947.411535Z-52ae12f8e490/`, `final-research-python.log`, `final-engine-types.log`. Financial, schema, request-status, Unicode and failure-aware statistics regressions were observed failing before their implementations, then passing. No mock test is counted as paid model evaluation.

## Broader Project checks at the starting commit

Read-only inspected [Project checks run 43705288373](https://github.com/AmmarMohanna/distilled.news/actions/runs/43705288373). Its dedicated [Briefing evaluation run 43705288434](https://github.com/AmmarMohanna/distilled.news/actions/runs/43705288434) passed.

| Job | Observed result | Diagnosis |
| --- | --- | --- |
| V3 correctness fixtures | 107 passed, one failed | Existing coverage-code fixture mismatch at `v3-window.test.ts:896`. Expected `INTAKE_DEFERRED_AT_CUTOFF`, received the more specific `ACQUISITION_DEFERRED_AFTER_VERIFICATION`. Delivery and incomplete/deferred counts matched. |
| Workspace worker tests | 2,947 passed, two failed, 19 skipped | Same coverage-code assertion; another changed-revision test failed inside Miniflare's synchronous proxy (`message?.id === id`). |
| Browser checks | 643 passed, 30 failed, one skipped | Selector/assertion and route-fixture failures; repeated unmocked `/api/.../sketch` and Explore calls reached absent local API `127.0.0.1:8787`, producing ECONNREFUSED. These are mixed fixture/environment symptoms, not proof of a production outage. |

Isolated unchanged V3 tests reproduced the deterministic coverage-code mismatch. The changed-revision test passed in isolation, supporting a Miniflare/shared-run instability diagnosis rather than a deterministic research regression. The failed isolated log remains preserved; assertions were not relaxed.

Comparison with the integration ancestor used:

```powershell
git diff c41d33b04 --name-only -- apps/worker apps/web tests/e2e playwright.config.ts pnpm-lock.yaml package.json packages/briefing/src
```

The output was empty. These runtime paths, browser fixtures/configuration, dependency lockfile and V3 tests are identical to the parent; the research candidate is not imported into them. This is a source/dependency comparison plus local isolation, **not a claim that the entire parent CI run was executed**. No research-introduced runtime/browser regression was established. Inherited fixture problems were not hidden by production changes or weaker assertions.

## Independent review

A fresh reviewer checked financial fences and paired fairness. It confirmed 24 packets, four × six matched windows, chronological separate reader histories and 12 source-only shared inventories. Two runner safeguards were added with regression tests: generation provider price ceilings/approved routes, and preserving `rejected` rather than mapping it to legitimate `quiet`. No recorded generation receipt exceeded its reservation; all six engine results were published/empty, so these fixes did not alter the measured cohort. Shared inventory costs are reported as evaluator overhead, not generation cost attributed to one system.

The post-push GitHub status belongs to the pushed SHA and must be reported separately. Local passing checks do not imply that the broader inherited Project checks are green.
