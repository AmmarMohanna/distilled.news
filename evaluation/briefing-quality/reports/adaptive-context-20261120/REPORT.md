# Adaptive verification context

Continuation branch `perf/adaptive-verification-context`, based on main `eafa51e4`. No merge, deployment or new paid inference occurred. The production/staging v1 rollout is unchanged.

## Change

Newly prepared opt-in windows freeze `reader-unit-context-v2`. For each verification request, select the compact format only when its user JSON **plus the existing reference instructions** is strictly smaller in both character count and UTF-8 bytes than the original JSON. Otherwise use the exact original system/user format. Both fields are selected together to prevent adding reference instructions to an uncompressed payload.

Existing snapshots with v1 retain unconditional compaction and its byte-identical request format. Snapshots without a marker retain the original format. Recovery preserves undefined/v1/v2 regardless of subsequent flag changes. The existing `BRIEFING_COMPACT_VERIFICATION_ENABLED` flag controls new preparation; no new deployment variable is introduced. This candidate needs a later approved deployment to affect live preparation.

No claims, sources, citations, inventory obligations, response schema, models, output allowance, publishing state or financial safeguards were removed or changed. Serialized size is a proxy: the selector does **not** guarantee lower provider tokens, output length, price or latency for arbitrary future inputs.

## Offline evidence

The CLI `replay-adaptive-context.ts` explicitly forbids network access. It uses the retained funded campaign only as an exact request/response lookup: an unmatched request throws rather than invoking a provider. This replays the actual verifier for controls and the actual engine for real windows.

| Retained cases | Adaptive verification choice | Result |
|---|---|---|
| Six short source-derived controls, Arabic/English/French | Original format, 6 requests | Identical previously paid original decisions |
| Arabic real briefing, 5 stories | Existing compact v1 format, 1 request | Identical previously paid output |
| English real briefing, 9 stories | Existing compact v1 format, 3 requests | Identical previously paid output |

All **39 requests** across these eight cases matched completed paid records. This is recorded-response replay, **not new model assessments**, a held-out news evaluation or a fresh billing/latency measurement. Control variants are dependent; the original paid study's limitations remain unchanged. Source/case/ledger hashes and selected operation identities appear in `REPLAY.json`; full retained evidence remains private.

The chosen short-control requests are the original-format requests whose verification-only receipts summed to $0.045848, rather than the unconditional compact requests' $0.046330. This is an existing-receipt selection, not a new saving experiment. The large real requests remain exactly the already measured compact requests, so there is **no additional demonstrated cost reduction** for those two windows. Their prior matched-stage reconstructions remain $0.329698 Arabic and $0.706088 English. This does not meet the proposed 50% overall cost target.

## Verification

- Seven new helper tests were observed failing before implementation and passing afterward. Full engine suite: **541 passed**, including supported/uncertain/contradicted decision preservation and exact short-request fallback.
- Six targeted worker tests passed: default/opt-in preparation, replay after flag change, and actual unstarted-evidence recovery with undefined, v1 and v2 markers.
- Existing six-check offline workflow passed: Python tests, evaluator replay (162 tests), full engine tests, exporter tests and both evaluation typechecks. Explicit engine (including tests), worker and replay-CLI standalone typechecks also passed.
- Final local review checked frozen-policy propagation, unchanged v1/default serialization and atomic system/user selection. The pre-restart separate review did not return a retained result and is not counted as an independent review.
- Additional inference charges: **$0**. Historical receipts, UNKNOWN fences and holds were not modified or replayed against a provider.

## Reproduce

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/replay-adaptive-context.ts .local-reports/integration/compact-paid-20261119-v5
python evaluation/briefing-quality/continuous.py --output .local-reports/adaptive-offline
```

The CLI accepts a retained artifact directory; it reads immutable records and prints sanitized identity/selection metadata. It does not read API credentials, write financial state, or access the network. Do not rerun the original paid campaign directory with its paid runner.
