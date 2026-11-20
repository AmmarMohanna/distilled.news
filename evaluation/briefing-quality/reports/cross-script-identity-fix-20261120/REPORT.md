# Cross-script identity validation correction

**Confirmed:** branch `perf/adaptive-verification-context` at `06ad2a24` treated disjoint writing systems as sufficient to accept otherwise unmatched people and occupational roles. This was a deterministic validation gap, not evidence that any particular published briefing contained the supplied example error.

## Change

Script detection is now diagnostic only. It cannot satisfy a person-name or role match. The fix covers independently extracted source bindings and the legacy reviewer-metadata path.

An unmatched cross-script name returns `CROSS_SCRIPT_IDENTITY_UNRESOLVED`; an unmatched cross-script occupational role returns `CROSS_SCRIPT_ROLE_UNRESOLVED`. Both use the existing repair/withholding path even when the final model labels the facet supported. A plausible transliteration or a model explanation is not independent evidence of equivalence. There is no new transliteration dictionary, trusted-model shortcut, outside-knowledge lookup or additional model stage.

Directly source-bound names, same-script name matching/surname handling and matching roles retain their existing checks. A truly equivalent name or translated role in a different script may now be conservatively withheld when equivalence is not independently established. This is the deliberate unresolved option in the review request. The code does not claim every such case is factually false. No new cross-script-equivalence certification mechanism is claimed implemented.

## Regression evidence

The new 34 deterministic tests cover both legacy and independent paths:

- Different Arabic/English/French people despite an approving final judgment.
- Different occupations across those languages despite an approving final judgment.
- Plausible but unverified transliteration and role translation remain unresolved.
- Directly supported same-script names and occupations remain accepted.

Before the fix, **20 tests reproduced false approvals or missing unresolved handling**; afterward all 34 pass. These are controlled regressions with model-approved inputs, not a paid-model reliability benchmark or population accuracy measurement.

One pre-existing test had explicitly expected an unverified Arabic/English transliteration to pass. It now expects `fix` with the exact unresolved diagnostic. Its source and reader texts remain unchanged; original paid measurements and financial records were not rewritten. Same-script mismatch diagnostics retain their existing assertions.

The zero-network exact-response replay still matched **81 requests across 22 retained cases**, preserving the original decisions and all 14 reader stories/citation arrays for those inputs. This confirms compatibility on that retained sample; it does not certify all published news or prove transliteration coverage. `REPLAY.json` preserves its hashes and selected paid operation identities.

## Financial and rollout scope

Additional paid requests: **0**. Additional inference cost: **$0**. The original campaign remains $3.3653396 settled out of $5; previous holds remain untouched. No deployment, merge, deployment-variable change, source mutation or published-news change occurred. This correction must reach an explicitly approved deployment before it affects live verification.

The remaining anonymous-role attribution limitation documented in the earlier rejected scope experiment is not represented as solved. This change removes the specific script-difference acceptance bypass; it does not independently establish full claim-inventory completeness or perfect source entailment.

## Final checks

The complete existing six-check offline workflow passed: 611 engine tests, 166 evaluator tests, Python/export tests and evaluator typechecks. Explicit engine, worker and qualification/replay CLI typechecks also passed. No assertion or timeout was weakened. `OFFLINE_CHECKS.json` records this offline run; remote CI is separate.
