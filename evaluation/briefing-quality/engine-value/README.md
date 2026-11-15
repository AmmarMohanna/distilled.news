# Engine value pilot

This is isolated research starting at `a2e111e2`. Read [the report](../reports/engine-value-v1/RESEARCH_REPORT.md) and [preregistration](PREREGISTRATION.md). Only a $5 initial pilot was authorized. There is no deployed candidate or demonstrated overall winner.

## Reproduce recorded results offline

Node 24, Python 3.11+, repository dependencies and the original private evidence are required. No model access is needed for these commands:

```powershell
$env:DISTILLED_PRIOR_EVALUATION_ROOT='<original reliability worktree>/evaluation/briefing-quality/private'
node evaluation/briefing-quality/engine-value/audit.mjs
python evaluation/briefing-quality/engine-value/analyze.py
python -m unittest discover -s evaluation/briefing-quality/engine-value -p 'test_*.py'
python -m unittest discover -s evaluation/briefing-quality/validation -p 'test_*.py'
python evaluation/briefing-quality/continuous.py --output evaluation/briefing-quality/private/value-v1/verification
```

The audit checks the original fixture hashes, every completed generation's eligible-source hash and all exact recorded code snapshots. Analysis reads the existing `private/value-v1/pilot` campaign ledger in SQLite read-only mode; it never sends requests. It reproduces public JSON aggregates and a deterministic source-code-only tarball. Failed reviews remain in all attempt counts; quiet-window 0/0 metrics remain undefined. Paired differences match frozen case IDs and exclude unresolved per-metric pairs explicitly. A single exposed chronological block cannot support a generalization interval.

Private raw evidence is intentionally not uploaded to GitHub. Public hashes and code permit audit, but complete end-to-end reproduction requires authorized access to the original retained sources, request/response files, histories and receipts. The report does not claim fully public data reproducibility.

## Recorded paid phases

- `pilot.ts`: initial 9-arm development experiment, protocol v1.
- `pilot-followup.ts`: indexed atomic-failure isolation and source-script prompt, v2.
- `pilot-wire.ts`: narrow same-guard engine/single comparison, v3.

All three use **the same** `private/value-v1/pilot/campaign.sqlite`, `ceilingUsd:5`, original paid accounting adapter, immutable responses and UNKNOWN fencing. The root must not be replaced or the ceiling increased to continue under this authorization. The pilot stopped at $2.649593 settled, zero new holds. Earlier campaigns' unresolved holds remain separate and unchanged.

Do not invoke these scripts as an implicit authorization for new requests. The scripts pin immutable protocols and refuse changed code/input identities. For forensic replay of recorded versions, use the exact versioned source bytes in `reports/engine-value-v1/source-snapshots.tar.gz` in a separate checkout, verify against its manifest and run `audit.mjs` first. The current follow-up runners add the reviewed input-hash preflight; their code hashes consequently differ from the historical protocols, and they must not overwrite those protocols. A new experiment requires a new versioned protocol and an agreed campaign ceiling that includes existing exposure. Never replay UNKNOWN requests or clear holds based on a failed receipt lookup.

Provider credentials are read only in memory using `DISTILLED_EVAL_KEY_FILE` in the existing adapter. No key values belong in artifacts, command output or Git. Account balance is shared with staging; funding is not spending authorization.

## Experimental engine options

The actual core has research-only opt-ins for a hard word ceiling, candidate-development ledger, atomic verifier rows, original-script entity instructions and a narrowly recognized Arabic locality wire renderer. Defaults are unchanged. Failed ablations are retained for reproducibility, not selected as improvements. The wire renderer is not a general entity or fact checker and does not process arbitrary articles, contradictory evidence, corrections or multi-source synthesis.

The single-call comparator receives the same source evidence, interests, reader cap and its own history. Source-script and wire experiments explicitly give it the same instruction/zero-call guard. The old unconstrained single, all-headlines and keyword outputs are preserved instead of silently replacing their algorithms.

No staging/production resources, publishing flags, monitoring deployments, main merges or notifications are part of this research.