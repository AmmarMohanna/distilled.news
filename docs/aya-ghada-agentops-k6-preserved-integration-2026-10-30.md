# Aya/Ghada plus AgentOps/k6 preservation merge

New branch: `integration/aya-ghada-agentops-k6-preserved`.

- First parent/base: latest fetched `origin/aya-ghada-preserved-integration`, `a7bc18bdcfcb90c4b692d2f76b47d2dd8adcd6df`.
- Merged source: `feat/agentops-k6-observability`, `93d6eb33b2e837c9877d08b883d3be9853943ffb`.
- Common ancestor: `feb20d9d74aba538cd0666863bf2e75f7b289480`.

Neither input branch was changed, reset or rewritten. This branch starts from Aya/Ghada and uses a normal two-parent merge of the complete k6/Grafana history.

## Preservation evidence

The merge was conflict-free. Exact Git index/blob comparisons verified all 49 Aya/Ghada-exclusive changed paths and all 55 k6/Grafana-exclusive changed paths match their corresponding input tips. Only two edited paths overlap:

- `apps/worker/src/types.ts`: retains Aya/Ghada's `SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS` and our `AGENTOPS_ENABLED`.
- `apps/worker/src/v1-intake/types.ts`: retains Aya/Ghada's public HTTP recovery evidence, verified redirects, prior failure and recovery authorization fields, plus our real-clock `enqueuedAt` proxy.

Relative to the Aya/Ghada input these shared files gain only one and two lines respectively. No frontend files differ from the Aya/Ghada input. All paid-operation fences, recovery, source acquisition, retained evidence, V3 scheduling/publication behavior and private/public access rules are retained; no branch-side feature was selected wholesale over the other.

## Validation on the merged tree

- Workspace TypeScript checks: passed for all projects with a typecheck script.
- Worker regression tests: **265 passed across 15 files**, including acquisition/recovery, fallback/redirects, source verification, paid fences, availability/health, indexed window coverage, intake/replay, Worker queue entrypoints, trace authorization and AgentOps behavior.
- Full connector suite: **340 passed, one existing skip across 20 files**.
- Script/evaluation/k6 configuration tests: **103 passed**, zero failed/skipped.
- Observability static validation: **67 metric definitions, 14 panels, 11 paused alerts and eight synthetic documents** accepted.
- Both Cloudflare environment fragments validate against installed Wrangler schema and merge as valid TOML.
- Existing repository build passed, including the explicit Wrangler dry-run exit. No deployment.
- Staged whitespace check passed; there are no unresolved merge entries.

These are local deterministic checks, not full repository CI, live provider acceptance or production performance evidence. Historical fixture campaign evidence in docs/observability remains explicitly tied to its original code SHA. Grafana/Cloudflare activation, live alert delivery and the previously documented measurement limitations remain unchanged.

No account mutation, migration application, paid provider request, real source collection or user notification was performed. Only this new integration branch may be published; both original branches remain intact.
