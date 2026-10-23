# Aya source fixes and V3 post-integration merge

Integration branch: `codex/integrate-aya-v3-post-integration`.

Parents reviewed:

- `aya-fixes-sources-v3` at `d24bf72922e1f86c416f654b32addee9e1647913`.
- `origin/feat/v3-post-integration` at `6c26436bd678fbf8864cf7e14bba62b70f7290cb`.
- Shared base: `75f52aad8eaaaf5ac8a9eb44a8bcc7045ac787b5`.

This is a merge of both final branch states, not a selection of experimental commits. Both parent branches remain intact. No deployment, remote migration, acquisition trial, paid inference or push delivery was performed as part of this merge.

## Resolution and preservation

The only textual conflict was the HTTP recovery test parameter list in `apps/worker/src/v1-intake/acquisition.test.ts`. Retained the broader source-lane cases for 403, 406, 408, 425, 500, 502, 503 and 504. No whole-file ours/theirs resolution was used.

A comparison against the common base identified 20 paths changed in the source-fix lane. All 20 remain identical to `d24bf72`, including acquisition routing, fallback ownership/accounting, publication-date/readability protections, the Python helper, positive QA budgets, the benchmark exporter and reports. Twelve critical incoming paths match the friend's final branch, including `app.ts`, `main.tsx`, reader/styles, scheduling/runtime, prompts/engine and push sender/preview.

| Requirement | Retained behavior |
| --- | --- |
| Creation-relative schedules | Migration 0069 adds nullable `briefing_schedule_origin_at`; new subdaily feeds close exactly one interval after creation, including seconds/milliseconds. Existing feeds are not backfilled. Daily local delivery anchors, DST handling, old windows and recovery IDs remain valid. |
| No automatic Personal Briefing | Signup and email verification no longer call default-feed creation. Missing-ID lookup reads an existing personal feed without creating one. Explicit feed creation remains available. |
| V3 integration | Editor → verifier → targeted repair → persistence; full retained evidence, source references, actual publication memory, fixed windows, reservations and recovery fences retained. Existing V2 recovery remains under frozen identities. |
| Verifier/repair identity | Local item indices map back to original identities; invalid, duplicate and coerced verifier indices are rejected. |
| Source-grounded writing | Interests guide selection, not factual evidence. Concise writing retains necessary attribution, uncertainty, conditions and source-relative temporal checks. |
| Reader frontend | Explicit bold headline/body rendering, content-language RTL independent of UI language, existing reference controls and legacy-summary fallback retained. Artwork generation, loading behavior and source recommendations are not replaced. |
| Push runtime | Uses Workers-compatible `redirect: "manual"`, with existing signing, leases, receipts and failure diagnostics. |
| Push previews | Reuses the published lead headline and remaining-item count; retains eligibility/ownership/cutoff/receipt checks and generic fallback. No extra model call. |
| Acquisition | Broader bounded HTTP recovery, anonymous helper → Playwright → durable Zyte fallback, exact-source ownership and original date/readability protections remain unchanged. |
| Rejected experiments | Warning-selection and reader-focused/AI-notification candidates remain rejected. Evaluation evidence stays reachable; active prompts equal the final restored prompts at `6c26436`. |

## Migration and resource review

Only `0069_creation_relative_schedules.sql` is added relative to the source-fix branch; its number does not collide with another 0069. Existing migrations, including historical 0061 filenames, are unchanged. Apply migration 0069 before a later deployment of this merged code. This merge does not apply it remotely.

The dedicated sources-QA configuration is unchanged from `d24bf72`, including positive $15 budget configuration and source-assessment settings. Joud's resource configuration is unchanged. Staging retains the incoming three V3 routing variables: GPT-4.1 editing/repair and GPT-4.1 mini verification. Its resource bindings and other source/provider controls are unchanged. Package manifests and `pnpm-lock.yaml` have no merge changes.

## Validation

- All 77 briefing tests passed, including verdict association, source-grounded writing and retained rejected-experiment evidence.
- All 45 frontend tests passed, including headline/body, Arabic RTL, references, artwork and source recommendation controls.
- TypeScript checks passed for contracts, core, connectors, briefing, web and Worker.
- The frontend production build passed.
- Sources-QA Worker bundling passed with Wrangler `deploy --dry-run`; no assets/code were uploaded and no remote resource was changed.
- Preservation audit passed for all 20 source-lane changed paths and 12 critical incoming paths.
- All 309 selected Worker tests passed across the initial run and a targeted timeout rerun. The initial 17-file run passed 301 and hit eight default setup/test timeouts; rerunning only those eight with `--hookTimeout 60000 --testTimeout 60000` passed 8/8. Assertions and application code were not weakened or changed. Secondary "Server is not running" cleanup errors accompanied two timed-out setups in the first run and did not recur in the rerun.
- Worker coverage includes API/onboarding and precise schedule edits, product synchronization, scheduling/runtime recovery, V3 integration, legacy scheduled writing, publication eligibility, sender/previews, acquisition/fallback/date/readability, source backend, recommendations, illustration queue isolation, connector runtime and the complete clean-D1 migration chain through 0069.
- The local D1 migration test applied the entire chain and checked foreign keys. Remote existing-feed schedules were not queried or changed; no live migration was applied.

The package-manager wrapper attempted an interactive dependency refresh, so validation used the already-installed Vitest/TypeScript/Vite binaries directly; no dependency or lockfile changes were made. The private preservation audit and targeted rerun JSON are under `.local-reports/aya-post-integration-merge/`. Total distinct tests passing across briefing, frontend and selected Worker coverage: 431. This is focused merge validation, not a claim that every repository test was run.

## Remaining limits

Image-loading slowness has not been investigated or fixed. Frontend tests and a build do not establish live visual/device behavior. Saved factual failures remain relevant; a passing merge suite does not prove general factual accuracy. Private benchmark datasets remain ignored and are not included in the merge commit.
