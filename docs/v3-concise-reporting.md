# V3 concise source-grounded reporting — 2026-10-23

## Cause and change
Retained `.local-reports/lebanon-feeds/newest-model-feedback.json` shows the editor introducing “according to a report published on 2026-10-23” and repair retaining it. The previous 30–70-word norm could encourage padding of one-sentence developments. This is generated prose, not citation rendering.

Changed only editor/verifier/repair instructions in `packages/briefing/src/prompts.ts`:
- A simple update may be one short sentence; no minimum word target.
- Separate citations carry routine provenance; omit generic channel/report labels and publication metadata.
- Preserve meaningful attribution, uncertainty, disputed responsibility, event timing and corrections.
- Omit routine lists of unavailable details; include an unknown only when central or needed to prevent a materially misleading impression.
- Verification must not demand routine source labels, metadata dates or absence-of-information sentences. It still challenges unsupported responsibility and unsupported claims of no casualties.
- Targeted repair must not add this padding.

No source text stripping, new model calls/stages, routing changes or special company/location rules. Existing temporal and factual checks remain. No deployment in this task.

## Review examples
These are manually reviewed intended rewrites, not new model outputs or independently confirmed news:

Original: “A Telegram channel reported a large explosion in the town of Qantara, southern Lebanon, which it attributed to an Israeli operation. No details on casualties or damage were provided as of the sources' publication on 2026-10-23.”
Intended: “A large explosion was reported in Qantara, southern Lebanon, attributed to an Israeli operation. [1]”
Reason: removes routine sourcing/date and missing-detail boilerplate while retaining reported status and attributed responsibility. “Israel caused the explosion. No one was injured.” would strengthen the evidence and must not be accepted.

Original: “A video posted online shows a moment of an attack on a church in Karak. No further details on casualties, perpetrators, or official confirmation were provided as of the source's publication on 2026-10-23.”
Intended: “A video appears to show an attack on a church in Karak. [2]”
Reason: retains visual-evidence uncertainty without inventing perpetrator, casualties, confirmation or filming date. Location remains dependent on the cited source; this review does not independently geolocate the footage.

Original: “Brent crude oil jumped to $116 per barrel, according to a report published on 2026-10-23.”
Intended: “Brent crude oil jumped to $116 per barrel. [1]”
Reason: publication metadata adds no necessary event detail. Dates are still needed when distinguishing older reporting from a new development.

## Validation and limits
- 12 test files, 66 tests passed, including two new scripted integration regressions for concise delivery/source ownership and targeted repair/recheck.
- Scripted tests use explicitly synthetic source snippets. They prove mechanics, not semantic model quality or improvement.
- Existing interest-grounding evaluation artifacts remain unchanged. Its test now checks the retained interest instruction instead of requiring the entire current prompt to equal the historical evaluated prompt; historical paid outputs do not validate these new prompt additions.
- No paid inference, additional charges or deployment. Actual model compliance, false approvals/rejections, cost and latency under the revised instructions remain unmeasured. A bounded real comparison is the next validation step when explicitly authorized.
- TypeScript checks passed for both the briefing package and Worker; git diff whitespace check passed.
