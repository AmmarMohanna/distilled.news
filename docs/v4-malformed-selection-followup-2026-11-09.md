# V4 malformed-selection review follow-up

Reviewed base: `72218077`; branch: `integration/v4-finalized`.

## Confirmed defects and minimal fixes

1. **Editor headline validation:** nonempty V4 `items` could lose entries with
   missing, non-string or whitespace-only headlines before body/reference checks.
   Every selected current-format item now requires a nonempty string headline.
   Invalid entries reject the whole reply through the existing one-correction
   `callJson` path; exhaustion remains a typed `BriefingModelError`.
2. **Consolidation validation:** invalid selected fields were filtered before
   legitimate cuts, allowing non-lead drafts to disappear. V4 consolidation now
   validates headlines, required string bodies and nonempty arrays of integer
   draft indices in range before applying cuts. Invalid indices cannot be coerced
   or partially filtered into a valid selection. Explicit empty selections,
   valid cuts, lead restoration and valid headline-only bodies retain their
   existing behavior. Prompt versions 1–3 retain their prior parsing rules.
3. **Safe JSON error boundary:** both ordinary JSON requests and unsuccessful
   recommendation requests now read `error` only from non-null, non-array
   objects. JSON null, arrays and primitives use the canonical `REQUEST_FAILED`
   fallback with safe HTTP metadata. Existing identifier translation handles
   English, Arabic and French at render time, including changing an already
   displayed error and Arabic RTL.

Runtime changes are confined to `packages/briefing/src/engine.ts` and
`apps/web/src/api.ts`. Prompts, GPT-4.1 editing/repair, mini independent
verification, conditional repair, Worker completion/error handling, source
preparation and financial accounting are unchanged. No mandatory stage is added.

## Verification

All checks passed: 334 briefing tests (52 files), 151 frontend tests (25 files),
and 99 affected Worker tests (four files). The targeted Worker run also passed
all five selected tests, including the two new P1 cases. Briefing, frontend and
Worker typechecks, the web production build and `git diff --check` passed.
See [machine-readable validation](v4-malformed-selection-validation-2026-11-09.json).

Regression coverage includes missing/empty/invalid headlines, mixed valid and
invalid editor selections, malformed consolidation headline/body/from fields,
partial-invalid index arrays, corrected complete selections, bounded failure,
explicit quiet selections, deliberate cuts and valid empty-string bodies.

Local Worker tests use real isolated database transactions and mocked provider
responses. Missing headlines and malformed multi-chunk consolidation remain
`PENDING/PUBLICATION_FAILED`, produce no saved successful result, edition or
delivery, and surface `TEMPORARY_UNAVAILABLE`. Retrying reuses the settled calls
without a provider resend. A valid `items: []` still completes `DONE/QUIET`.

Frontend regressions use `Response.json(null, {status: 502})` in all three locales
and a mounted error display that changes language without another request.

## Scope and limitations

Retained exact-request replays check unchanged valid V4 request bytes, outputs
and recorded cost across 18 cases and 38 historical calls. These are offline
compatibility checks, not fresh editorial or natural-Arabic quality evidence.
There is no new live latency or cost measurement. Valid responses add no model
calls; malformed responses may now consume the existing bounded correction
instead of incorrectly completing as quiet.

No paid inference, deployment, production selection, historical receipt,
financial hold or buffer changes were made. Read-only reconciliation confirms
all 1,239 campaign comparison rows and five complete quarantine records match
the retained pre-release snapshot. Existing semantic selection, source ambiguity
and Arabic editorial-quality limitations remain; the human-review pack and all
research evidence are preserved.
