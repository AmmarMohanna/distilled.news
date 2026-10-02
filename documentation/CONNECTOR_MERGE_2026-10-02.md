# Connector integration merge — 2026-10-02

Destination: `feat/source-connectors-v15` (local integration; no push or deployment).

Direction: `testing-api-scrapers` into `feat/source-connectors-v15`. The testing branch remains at `748515c`; the friend's branch is untouched. The earlier incorrectly targeted local merge is retained only as `backup/local-merge-380af3c`.

Parents:
- Existing testing/UI/ingestion work: `748515c7d121f777cfaf486954b0d0f03f0bf18d`.
- Connector interface and adapters: `7e9f48f8357469ab654d4e91cbd9f91745f24993`, including the friend's runtime branch at `606f7d32f157b53b55077015a8269b4508c5d9fe`.

The merge preserves the agreed ownership split. Connector work stays behind the narrow interface documented in `CONNECTOR_V15_INTERFACE.md`. Canonical intake, runtime transport/storage bindings and downstream integration remain pending; this merge does not claim to complete those bindings. Existing benchmark code and evidence remain separate from production connector code.

## Conflict resolutions

- `.gitignore`: retained both branches' protections, including credentials, sessions and raw benchmark artifacts.
- Worker processor: kept edit-affected items beyond the recent-item cap and the runtime branch's news-processing path.
- D1 repository: retained batched writes and new document provenance columns; retained evidence updates on conflict, including the new columns.
- Wrangler: retained local development host settings and the runtime branch's browser/container bindings.
- Core processing: retained stable-message edit matching and the named-storm conflict guard for distinct observations.

No UI files changed relative to the testing branch. The runtime/browser implementation was imported unchanged; no Web Operator redesign was performed.

## Validation

- All six workspace package typechecks passed.
- Connector suite: 100 passed.
- Core suite: 43 passed.
- Operational script tests: 4 passed.
- Web production build passed.
- Runtime full rerun: 260 passed, 3 failed, 2 skipped. The two lease-renewal failures passed when rerun in isolation; the API guard remains failing. This is not a fully green full-suite run.
- Worker first full run: 197 passed, 15 failed (14 lacked the installed browser; one retention test timed out). After installing Chromium, those 15 cases yielded 14 passes and one lease-renewal failure. That remaining recovery case passed in isolation. All 212 worker cases passed across these runs, but no single full-suite green run is claimed.
- Missing locked dependencies and Chromium were installed locally; no provider calls or paid benchmark runs were initiated. Live smoke tests remained skipped.

The browser API guard already fails on the unchanged runtime branch because its source-text scan matches `this.dispatchEvent` inside the inert WebSocket hardening string. The guard and browser implementation are byte-identical to the imported runtime branch. This is an outstanding upstream test issue, not a newly introduced merge difference; it was not weakened to make the merge appear green.
