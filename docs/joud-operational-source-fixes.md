# Operational source corrections, 28 October 2026

Branch: `joud/aya-integration-fixes`.
Final deployed Worker version: `1f5375fc-5a57-415f-89f4-bc8d7e03e7d9`.
Models, grants, provider budgets, data bindings, CSS and app icons are unchanged.

## Corrected behavior

1. Explicit article body containers can contain prose in list items. A liveblog's
   bullet-only summary is marked `PARTIAL` and persists as `ARTICLE_EXCERPT`,
   never as a complete article. Nested list/paragraph double counting and generic
   navigation acceptance are avoided. Six old Al Jazeera acquisition jobs were
   previewed on real public pages, recovered with one extra free-only attempt,
   and verified in D1 as `DONE` / `ARTICLE_EXCERPT` / `PARTIAL`. This brings the
   verified public-only recovery total to 92, including earlier reports.
2. The National News homepage uses styled paragraph headlines. Discovery now
   recognizes those semantic CSS headline elements and links wrapping headings.
   Its grid cannot be promoted to one full article merely because it has long
   previews and no h1. The real public homepage replay discovered 71 candidate
   links. One existing pending poll was authorized with persistent free-only
   capability restrictions for a live check; its final outcome is recorded below.
3. Recovery completion can encounter `IntelligenceTurnBusy` after saving fetched
   evidence. The maintenance API now returns HTTP 202 with `PENDING`, `RETRY`,
   `FEED_BUSY` and Retry-After, preserving the job's attempt/history. Normal queue
   retry behavior and durable fetched-result reuse remain unchanged. Before this
   turn all 86 earlier public recoveries were already DONE; none were stuck.
4. Source health now includes typed, counted failure categories. The frontend
   distinguishes unknown paid outcomes, access requirements, publisher blocks,
   identity mismatches, missing text, genuine listings and bounded fetch failures.
   Mixed failures retain their distinct causes. Stored diagnostics and URLs are
   never exposed as messages. A collection repair blocker now retains the actual
   provider cause (for example MALFORMED), and capacity waits are described as
   waits. New messages include French and Arabic translations and singular forms.

## Receipt investigation and limits

The inspected unresolved provider operation rows contain claim tokens and, in
one Zyte case, a response-headers timeout. They do not contain enough confirmed
outcome evidence to settle or safely resubmit the operations. The affected feed
has no blocked paid poll with a saved continuation token. No billing hold,
reservation, provider operation or unknown-result fence was cleared or reset.
No new paid-provider recovery submission was made.

Genuine category/index pages remain excluded. The inspected Newscord redirect
leads to another story and remains rejected. MTV's client-rendered shell is not
substituted with unrelated card text. Other access and identity failures remain
visible; the changed messages do not assert that every source now works.

## Validation

The complete affected Worker suites passed: 92 acquisition, 34 fallback,
11 runtime/recovery and 10 availability tests (147 at that point). The final
availability suite subsequently passed all 11 tests, including provider-cause
unwrapping. The final connector selection passed all 34 tests, including the
liveblog and National News regressions. Worker/frontend typechecks, connector
build/typecheck and frontend production build passed. CSS asset hash remained
unchanged. Publisher HTML, manifests and private result metadata remain ignored
under `.local-reports/live-check`.

## Live National News follow-up

The selected poll initially remained unleased behind queued work. The existing
secret-authenticated free poll recovery action now accepts optional `runNow:true`:
it runs exactly one bounded scheduler slice for the explicitly selected job,
through the scheduler's existing lease and source-approval checks. Paid credentials,
remote execution and funded ceilings are removed; accepted acquisition jobs inherit
unpaid-only restrictions. This path is opt-in, not automatic paid resubmission.
A regression test verifies one selected slice and stripped capabilities.

Three bounded public-only slices completed the same National News snapshot. The
job reached `DONE`, with `website_http` handoffs and provider cost $0; the homepage
snapshot contained 71 candidate items. A final public feed check returned HTTP 200
and National News `AVAILABLE`. At that instant its acquisition counts were 11
completed, 63 pending and one missing-readable-text failure, including historical
items. Collection completion therefore does not imply that every linked article
has been acquired or a briefing published.

One already-paid MTV response was downloaded from its scoped Joud R2 reference.
It was HTTP 200 with an HTTP-response body, no browser HTML, and zero readable
article-body characters after extraction. Its canonical URL used a short CMS ID.
This retained receipt could not safely supply article evidence. It was inspected
locally without contacting the provider or clearing any unknown-operation hold.

