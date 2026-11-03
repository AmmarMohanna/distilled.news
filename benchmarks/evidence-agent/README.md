# Evidence-first candidate benchmark

See `docs/evidence-first-briefing-agent.md` for scope, limitations and proposed comparison.

- `comparison.ts`: offline preparation plus an injected-native-port runner. No credentials/network provider adapter.
- `offline-plan.json`: exact frozen inputs, requests, hashes and provisional expectations. No model results.
- Source labels remain AI-assisted engineering expectations, not human ground truth.
- Real calls: **0**. Additional paid charges: **$0**. Adoption: **not qualified**.

Regenerate offline in PowerShell from the repository root:

```powershell
$env:FREEZE_EVIDENCE_AGENT='1'
node node_modules/vitest/vitest.mjs run --project @distilled/briefing test/evidence-agent-comparison.test.ts
Remove-Item Env:FREEZE_EVIDENCE_AGENT
```

Future paid execution requires a new explicit approval and fresh conservative pricing/exposure preflight. A previously approved scope or unused balance is not sufficient.
