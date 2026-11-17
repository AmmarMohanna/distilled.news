# V4 release blockers closed

All three reviewed blockers are fixed on `integration/v4-finalized`. No paid
inference, new model/stage, deployment, production switch or financial mutation.
This follow-up supersedes the initial release report's request-time error
localization and raw `Error.cause` description.

| Issue | Exact fix | Verification |
|---|---|---|
| P1: malformed selected draft became quiet | V4 `parseDrafts` rejects a missing/non-string `body` on a selected headline before it can be skipped. The existing single JSON correction is used; exhaustion throws the existing typed `BriefingModelError`. No Worker production code or retry policy changed. | Missing/invalid bodies, mixed selections, valid `body:""`, explicit empty selection and exhausted correction regressions pass. Native Worker tests prove unrecoverable malformed generation stays `PENDING/PUBLICATION_FAILED`, surfaces typed `TEMPORARY_UNAVAILABLE`, and saves no result/edition/delivery. A retry reuses both settled model responses without resending them. |
| P2: actionable auth errors hidden | `ApiError` maps a bounded whitelist of supported Worker auth messages to stable identifiers. Email-verification requirements, credentials, tokens, current password, account conflicts, setup, mail failure and rate-limit messages have English/French/Arabic copy. Unknown/unsuitable values become `REQUEST_FAILED`. | Auth contract cases, actual mocked login response, unknown/non-string/prototype-key inputs, safe metadata and every locale pass. Raw backend text is not retained in frontend error state or `cause`. |
| P2: displayed errors kept old locale | API errors store `{id, details}`; consumers use `toUiError` and translate through `t()` when rendering. Local validation copy remains untranslated keys; variable feed-name limits use structured data. Direct error displays in feed, archive and summary UI were updated. | Mounted error survives en/ar/fr switching with the same stored object and one request. Built login form passes ten desktop/mobile language states, preserving RTL, with one mocked login and no page errors. |

## Validation

- **311 briefing tests**, 51 files: full suite passed.
- **145 frontend tests**, 25 files: full suite passed. Final safe-key compatibility
  adjustment also passed all 36 focused API/localization/stream regressions.
- **97 relevant Worker tests**, four files: full affected V4 adapter, durable
  window recovery, public reads and publication-validation suites passed.
- **Three new native Worker blocker regressions passed**: unrecoverable malformed
  output never quiet, corrected empty body independently verified/published,
  explicit empty selection legitimately quiet. These are included in the 97.
- Briefing, frontend and Worker typechecks passed; final web build passed.
- **18 exact V4 cases / 38 historical requests** replay with unchanged hashes,
  outputs and represented costs. Explicit source-empty windows still make no call.
- Local Chromium check used the built actual login form at desktop/mobile sizes.
  All API responses were mocked; external hosts were blocked. One email-verification
  rejection remained actionable while its visible language changed without resubmit.

The P1 regression exercises `processV1Briefing`, existing error handling, persisted
request/result state and settled-response recovery in isolated local D1. It is
not only a parser test. `items:[]` remains an explicit editorial omission; source
validation and legacy prompt 1–3 handling remain intact. No failure is converted
to an approval or a successful quiet completion.

## Final diff and preservation

Editorial runtime change: one three-line body-type guard. GPT-4.1 editing/repair,
mini independent verification, prompt builders, model transport, preparation,
Worker window/runtime and financial safeguards are unchanged. A malformed reply
may consume the existing format correction; there is no new mandatory call.

Frontend changes are confined to error identifiers, a safe auth-message whitelist,
render-time copy and affected error-state consumers. Streaming source-recommendation
failures use the same safe boundary so arbitrary server/protocol details are not
displayed. Unknown fields are not copied: error metadata permits bounded HTTP
status/retry delay; the feed-name maximum is a trusted local value.

Read-only reconciliation including SQLite WAL confirms **1,239 original campaign
comparison rows and all five full quarantine records unchanged**. Settled spend
is still $4.472889622, holds $0.188534125 and the preserved buffer $1.25. No key
was read for inference, uncertain request resent or hold released. Research
reports, receipts and the 18-case review pack are preserved.

[Machine-readable verification](v4-release-blocker-validation-2026-11-09.json).

## Remaining risks

Existing semantic news-selection, relationship truth, source ambiguity and Arabic
editorial-quality limitations remain unchanged. Software tests and retained
replays are not new model-quality or human-naturalness evidence. Future backend
auth wording/contracts require explicit identifier mappings; unknown errors
intentionally receive a safe generic message. This is release verification,
not deployment authorization or a new optimization campaign.

Fix commits: `7dc730ca` (P1) and `37511808` (P2 canonical errors/localization).
