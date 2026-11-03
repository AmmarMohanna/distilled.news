# V3 prompt version 6

V6 contains the four clean rewrite prompts supplied by the user: editor, consolidator, verifier and repair. The instructions were transcribed as plain-text system prompts; Markdown emphasis/code delimiters are presentation only. Existing user-message builders continue supplying full evidence, feed/language/window context, prior reader history and repair context.

V6 is **opt-in, not deployed or model-qualified**. V4 remains the engine/product default. V1–V5 system text and frozen jobs remain unchanged. Select V6 for an offline engine invocation with `{promptVersion:6}`; a separately approved deployment can select `BRIEFING_PROMPT_VERSION=6` for new product windows. No environment configuration was changed here. Saved windows retain their original version across retry and duplicate delivery.

The call sequence is unchanged: editor -> verifier, targeted repair/re-verification only if needed, and existing consolidation only for chunked inputs. No extra stages, agents or mandatory calls were introduced. Existing source validation, lead protection, citation mapping, local repair numbering, native accounting, leases and persisted-result reuse remain in place.

Local scripted tests establish version routing and integration, not semantic accuracy, cost or model quality. They cover normal two-call execution, headline-only bodies, chunk consolidation with protected leads, subset repair numbering, re-verification, persisted V6 recovery and configuration changes without repeating settled work. Frozen V4 benchmark regressions continue to verify its exact system text.

No paid inference or deployment was performed for this addition. V6 still needs controlled comparison against V4 on the frozen editorial evidence, including full-pipeline verifier/repair outcomes, under fresh applicable authorization.

Validation: 137 briefing tests passed across 29 files; briefing and Worker TypeScript checks passed. The 51-case Worker window suite had 50 passes (including both V6 persistence/recovery cases) and one Miniflare synchronous proxy IPC assertion in an unchanged scheduling case. Replaying the exact scheduling cases passed (two passed, 49 deselected). The original failing log is preserved; this is not described as a clean first-pass suite. No security/assertion changes or speculative runtime fix were introduced for that dependency instability.

V6 was tested in a bounded live model comparison: see [results](v3-v6-evaluation-2026-11-03.md). It is not qualified for promotion: observed recall/verbosity regressions outweigh lower cost. V4 remains the default. No deployment or reader persistence occurred.
