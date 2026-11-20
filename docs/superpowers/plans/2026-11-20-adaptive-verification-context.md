# Adaptive verification context

**Base:** latest main `eafa51e4`; branch `perf/adaptive-verification-context` in the existing isolated worktree.

**Goal:** Avoid the demonstrated short-input overhead without weakening verification or changing existing paid requests.

**Design:** Freeze `reader-unit-context-v2` on newly prepared opt-in windows. Build the original and compact reader payloads; choose compact only if its serialized user text plus the existing reference instructions is strictly smaller in both character count and UTF-8 bytes. Return user text and system suffix from the same decision. Otherwise send the exact original request format. v1 remains unconditional and byte-identical for old snapshots. Default/off and legacy behavior remain unchanged. Recovery uses the snapshot's marker.

**Why:** The funded v1 comparison passed its factual controls but added input on six short controls. Exact request selection is smaller and safer than changing the judge, dropping claims, adding caching infrastructure or inventing token-based guarantees. Size is a proxy; this change does not guarantee lower billed tokens, output length, cost or latency on arbitrary future inputs.

## Tasks

- [x] Test short, large, unchanged/default/v1, nonmatching claims and multilingual request decisions before implementation.
- [x] Implement atomic system/user selection and freeze v2 only for new opt-in windows; preserve undefined/v1 recovery.
- [x] Replay retained funded requests offline and verify every adaptive request exactly matches an already paid original or compact request. Preserve the paid study and append new measurements.
- [x] Run engine tests, targeted worker preparation/recovery tests, typechecks and offline evaluation checks. Local review complete; commit and push the continuation branch with its evidence.

**Constraints:** No deployment, merge, paid inference, model/claim/citation/schema/output-budget changes or historical operation replay. Prior negative results and $2 campaign receipts/holds remain unchanged. No 50% saving claim.
