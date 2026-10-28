# Joud source follow-up, 28 October 2026

Worker: `distilled-news-joud`. Final deployed version:
`d0558d78-1d10-4bac-97cb-e006e4487a62`.
No model, financial limit, account permission, frontend asset or resource binding changed.

## Completed

Recovered another **57 existing failed acquisitions** using anonymous HTTP and
native parsing: 8 Al Jazeera and 49 Voice of Emirates. Every selected page was
previewed for readable text and same-page canonical identity before authorization.
All 57 were confirmed `DONE`, with the original observation/job identities and
one extra cumulative attempt (1 to 2). This is additional to the 29 recoveries
recorded in `joud-unpaid-source-recovery.md`. Descriptions remain descriptions;
acquisition completion does not establish full video coverage or factual accuracy.

- URL comparison now treats hexadecimal percent-escape casing as equivalent,
  without decoding encoded separators, folding path text or dropping meaningful
  query parameters.
- The private free-recovery route accepts optional `canonicalEvidence:{from,to}`.
  Its source must exactly match the retained observation URL. Only the existing
  strict same-article comparator or scholarly abstract alias can authorize it.
  An unchanged canonical can reaffirm a historical mismatch **only in unpaid
  mode**; ordinary paid recovery still rejects that reaffirmation. Acquisition
  independently rechecks the actual response identity and readable evidence.
- Unknown paid outcomes, unrelated articles, source revocation and cumulative
  attempt limits remain fenced.
- Known maintenance `HandoffError` storage waits now return a typed retryable
  response rather than an undifferentiated server error. Unexpected errors are
  not converted into success. Some live maintenance requests still returned 500;
  same-approval replay and durable state checks confirmed eventual completion
  without granting another attempt.

## Publication diagnosis and pending decision

The stored briefing grant permits GPT-4.1 and GPT-4.1 mini with $1 maximum
exposure and one concurrent operation. It expired **23 October 2026**. The earlier
mini-only grant expired 17 October. No tracking-only account mapping is installed.
Thus `ACCOUNT_AUTHORIZATION_REQUIRED` is expected admission behavior, not a
request to switch models. There were no unmapped model intents or unsettled model
liabilities in the inspected ledger.

A new 24-hour grant capped at $1 total, for the same two models and one concurrent
operation, was proposed to the owner. **It has not been applied.** Existing grants
are explicitly nonrenewing; an unanswered request does not renew them. End-to-end
publication remains unvalidated until permission is resolved and coverage/review
waits complete. No default grant, tracking-only bypass or unlimited model mode
was introduced.

## Remaining boundaries

- Ten unresolved Zyte operations have no retained result. Nine lacked a recorded
  failure phase/target; the other stopped at response headers. This is insufficient
  evidence to settle, release or resubmit their unknown paid outcomes. Other
  providers also retain unknown operations; their reservations were not cleared.
- The inspected MTV public HTML contains a client-rendered shell and related cards,
  not a readable article body. Its long slug canonicalizes to a short CMS-ID URL.
  Neither unrelated text nor a URL-only ID match was promoted to article evidence.
- A Newscord URL redirected to a different story; rejecting that replacement is
  correct. One inspected CBS story redirected to an investigation page without
  extractable body. One Al Jazeera mismatch preview also had no usable text.
- Genuine listing pages, access restrictions and unresolved liveblogs remain
  explicit failures; historical records are preserved. These changes do not mean
  every source or future request is guaranteed to succeed.

## Validation

Worker typecheck passed. All 13 URL comparison tests and 9 existing runtime tests
passed; four focused recovery-authorization tests and the new maintenance-wait
regression passed. Relevant earlier tests are documented in the previous report.
Live preview manifests and redacted result metadata remain ignored under
`.local-reports/live-check`; article HTML and credentials are not committed.
