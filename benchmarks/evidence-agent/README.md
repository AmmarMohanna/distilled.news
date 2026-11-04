# Evidence-first candidate benchmark

See `docs/evidence-first-briefing-agent.md` for scope, limitations and proposed comparison.

- `comparison.ts`: offline preparation plus an injected-native-port runner. No credentials/network provider adapter.
- `offline-plan.json`: exact frozen inputs, requests, hashes and provisional expectations. No model results.
- Source labels remain AI-assisted engineering expectations, not human ground truth.
- Initial preparation was offline. Authorized follow-up: **39 calls / $0.2491448**, zero uncertain operations. See `trial-results-2026-11-04.json`, `trial-review-2026-11-04.json`, `trial-outputs-2026-11-04.md` and `docs/evidence-agent-real-comparison-2026-11-04.md`. Adoption: **REVISE; not qualified**.

Regenerate offline in PowerShell from the repository root:

```powershell
$env:FREEZE_EVIDENCE_AGENT='1'
node node_modules/vitest/vitest.mjs run --project @distilled/briefing test/evidence-agent-comparison.test.ts
Remove-Item Env:FREEZE_EVIDENCE_AGENT
```

Future paid execution requires a new explicit approval and fresh conservative pricing/exposure preflight. A previously approved scope or unused balance is not sufficient.

Protocol fix: `docs/evidence-agent-v2-protocol-fix.md`. `v2-offline-controls.json` contains mechanically modified saved fixtures with scripted verification, not new provider evidence. V1 paid results remain unchanged.
