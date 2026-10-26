# Aya / Ghada integration — October 26, 2026

Branch: `aya-ghada-integration`.
Parents: Aya `17b58b926e297728251e2a2e1dcb9efe7460dc61` (`aya-performance-reliability-evaluation`) and Ghada `efb2073` (`origin/ghada/v3-repair-context-staging`, refreshed before merging).

This is a merge of both final branch states, retaining their histories and evaluation evidence. It does not deploy either environment or run paid acquisition/inference.

## Conflict resolutions

- V3 window input retains Aya's superseded-unstarted-evidence recovery metadata and catalogue context alongside Ghada's frozen prompt version. New inputs use version 3; legacy inputs retain version 1 behavior. Results remain keyed by the actual frozen input ID, including recovered successors. Full evidence and financial retry fences remain intact.
- Both V3 regression groups remain: serialized large-batch commits and frozen prompt versions 1/2/3 with interruption/replay.
- Staging configuration retains Ghada's enabled recommendations, GPT-4.1 discovery and GPT-4.1-mini assessment, and Aya's native acquisition recovery, durable Zyte configuration and unlimited aggregate collection setting. Accounting, per-operation reservations and uncertain-outcome fences remain. Existing disabled Google Apify authorization is retained. No live bindings or credentials are changed by this merge.

Ghada's complete web tree and briefing engine/prompt source are unchanged relative to her parent. Aya's collector-budget, source-backend and acquisition implementation remain intact; the only incoming connector-runtime change distinguishes Apify's external monthly usage limit from authentication failures. The incoming Telegram helper change reuses cached input peers. No database migration, shared contract, dependency version or lockfile change is introduced by the merge. Migration 0069 and dedicated resource identities remain intact.

## Validation

- TypeScript: all eight workspace packages passed, using installed compiler directly.
- Briefing: 100 tests passed.
- Connectors: 295 tests passed.
- Frontend: 62 tests passed.
- Frontend production build passed.
- Staging Worker dry-run bundle passed; no deployment issued.

Focused Worker: 84 tests passed across six files, covering V3 windows (21), catalogue acquisition, collection accounting/recovery, the complete clean migration chain, scheduling (32), and provider recovery. Full Worker/browser suites and live factual evaluation were not run for this merge. Local tests use mocks/local databases and do not prove publisher accessibility or factual accuracy. Two inherited benchmark Markdown files retain their extra trailing blank line; evidence was not rewritten for whitespace cleanup.

Ignored logs and dry-run output: `.local-reports/aya-ghada-*`. Initial pnpm invocations attempted dependency-store registration blocked by the sandbox; checks instead used already installed tools. Connector/Worker local-server checks require local loopback access and were rerun with it.

