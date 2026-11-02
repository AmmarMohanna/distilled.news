# V3 novelty across publication history

## Confirmed failure

The November 1 staging Arabic Lebanon briefing repeated a conditional occupation/blockade report at 10:00 after two 09:00 items had already communicated those details. The exact retained editor and verifier requests both contained those two prior items. The editor classified the recombination as new; the verifier approved it. This is a semantic novelty failure, not missing publication memory.

A sanitized retained regression is in `packages/briefing/test/fixtures/v3-recombined-prior.json`. Source passages and published prose are retained; private account/feed identifiers are replaced. The user identified the repetition. Other source judgments are not represented as independently reviewed gold labels.

## Narrow candidate

Prompt version 5 instructs existing editor, consolidation and verifier calls to compare against the union of prior items. Rewording, recombination and repetitions of the same originating report are redundant. Evidenced material changes, corrections, distinct occurrences and genuinely consequential independent confirmation remain eligible.

No extra calls, stages, lexical similarity filters or evidence transformations were added. Version 4 remains the default. New requests can explicitly opt into version 5 with `BRIEFING_PROMPT_VERSION=5`; saved requests retain their frozen version, including across recovery and unstarted-window refresh. Existing staging has not been changed.

## Offline evidence

- Briefing package: 24 files, 115 tests passed.
- Focused Worker coverage: 7 passed, 35 unrelated cases skipped. Covers frozen versions, settled-call reuse and opt-in routing.
- Recorded baseline is reproduced as a false approval. Scripted candidate verdicts verify routing, duplicate omission and update preservation mechanically; they do not establish improved model judgment.

## Prepared real comparison, not executed

`benchmarks/novelty-union/prepare.ts` prepares eight fixed requests offline: baseline/candidate pairs for the exact retained editor and verifier inputs, plus English editor/verifier controls. Only system instructions change within each pair. Controls cover recombination, same-origin reporting, an approved proposal, a correction, a distinct occurrence and material independent confirmation. Synthetic controls are explicitly labeled.

Conservative combined reservation: **$0.4571688**, eight calls, no retries. Actual additional cost so far: **$0**. Paid execution requires a fresh applicable authorization and existing authoritative admission. No publication, deployment or notifications are part of this comparison.

Private request artifacts and execution logs remain in `.local-reports/leb-repeat-nov1/`. The script needs the retained private operations artifact; it makes no network requests. Model-quality improvement and false-positive rates remain unproven. Do not activate this candidate solely because deterministic tests pass.

Workspace recursive TypeScript checks and git diff whitespace validation also passed.
