# QA acknowledgement of historical unknown source requests

On 29 October 2026, Aya explicitly approved retaining the reservations for five historical requests on her four sources-QA feeds and allowing fresh collection, accepting possible overlapping charges. This is acceptance of uncertainty, not provider reconciliation or evidence of successful acquisition.

## Behavior

- A trusted operator can record `acknowledgement.kind = UNKNOWN_OUTCOME_ACCEPTED_NO_REPLAY` in an exact operation's retained headers. The record binds the request hash, original reserved ceiling, approver, approval reference and timestamp.
- Admission recognizes this only for scoped TwitterAPI.io and Zyte operations with an unknown outcome and a failed or expired original claim.
- The original status, absent payload, diagnostics, operation identity and financial reservation remain intact. The acknowledgement neither refunds money nor reports a successful provider response.
- The exact original request remains non-replayable (`RESULT_LOST` with an explicit acknowledgement diagnostic). Fresh operation identities may proceed through normal accounting and admission.
- Incomplete or mismatched acknowledgement metadata does not remove a hold. Unacknowledged unknown operations continue to block normally. No blanket timeout-based forgiveness is added.
- Feed availability checks actual outstanding operations before retaining an old payment-block warning. Operational health keeps cumulative historical attempt counts separate from active reconciliation alerts.

## QA execution

The operator action was limited to three historical TwitterAPI.io requests and two historical Zyte requests owned by `aya-admin-20261027`. Their combined reserved ceiling is $0.13. No spending allowance was increased, no model route changed, and no historical request was submitted again by the acknowledgement action. Exact before/after evidence is retained in private local operational reports, not this repository.

## Validation

Focused provider tests cover admission of fresh requests, rejection of original-request replay, retained reservations, and refusal of mismatched hashes, amounts or missing approvers. Worker tests cover the source admission query, social and website stale-warning cases, and active-versus-historical operational alerts. Provider/recovery regressions, worker checks, TypeScript checks and a minified worker build passed before QA deployment.
