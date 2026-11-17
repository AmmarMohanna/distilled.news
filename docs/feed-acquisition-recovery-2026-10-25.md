# Feed acquisition recovery — October 25, 2026

## Scope and preserved behavior

The original read-only audit covered 35 feeds in Joud's deployment. The user
subsequently authorized fixes and live testing on sources-QA, including a $10
model-spending allowance. Changes were deployed only to sources-QA; Joud and
production were not deployed or repaired by these QA operations.

V3 remains editor → verifier → targeted repair → persistence, with GPT-4.1 for
editing/repair and GPT-4.1 mini for verification. Full retained evidence, original
publication dates, fixed reporting windows, citation ownership, publication
memory, financial reservations and uncertain-outcome fences remain protected.

## Reproduced defects and changes

- Native execution replaced the helper port and lost Google News decoding,
  browser rendering and alternate-egress article HTTP. Execution is now composed:
  parsing/extraction can run natively while the configured helper retains those
  capabilities. VPC authorization, capacity admission and deadlines remain.
- Native public-article results omitted their fetched URL and failed exact article
  identity validation. Successful responses now attest that URL separately from
  publisher canonical metadata.
- Naharnet reporting in a unique, multi-paragraph Article-owned
  `itemprop=description` container was ignored. Extraction now supports this
  layout with article metadata, excluding comments and sharing controls. Generic
  descriptions, single-paragraph teasers and ambiguous containers remain excluded.
- AS articles embedded CollectionPage metadata for their parent section, causing
  false listing classification. Collection metadata must bind to the current URL
  to override article evidence; genuine listings remain discovery surfaces.
- WAtoday's inspected page contains an explicit restricted teaser without an
  identifiable full article body. Collection and acquisition now report restricted
  access instead of misclassifying it as a listing or promoting unrelated links.
  Identifiable full bodies are not rejected merely for subscription metadata.
- Python/private and native HTTP diagnostics can distinguish attested upstream
  failures from unattributed helper failures. The Python script change has not
  been installed on the VPS; old responses remain compatible.
- Added an operator-only acquisition recovery primitive. It grants one bounded
  additional attempt, keeps cumulative attempts and failure history, refuses
  unresolved paid operations or retained fetch results, requires a live source,
  and caps lifetime attempts at ten. Reopening a terminal failure advances the
  source epoch so stale publication snapshots cannot race past changed coverage.
  No automatic reset or public recovery endpoint was added.

## Automated validation

- 110 worker tests passed across acquisition, article integrity, fallback,
  native execution and source backend suites.
- 119 connector tests passed across provider runtime and website discovery.
- Three focused Python public-article transport tests passed.
- Nine overlapping targeted acquisition/recovery tests passed after the source
  epoch safeguard; these are not counted again in the 232-test total.
- Worker TypeScript check and `git diff --check` passed.

Initial sandboxed D1 tests failed during Miniflare setup, before application
assertions; rerunning with loopback access passed. A broader Python run hit an
environment-dependent error and was interrupted. Only the three focused Python
checks above are claimed.

Full publisher HTML, acquired text and live operator evidence remain in ignored
private storage under `.local-reports/feed-audit-20261025/`. They are not public
fixtures or benchmark excerpts.

## QA deployment and spending authorization

The actual sources-QA database is `f34f4399-1e3b-4d4f-ba17-564e54e9f941`, with
bucket `distilled-news-qa-v3-raw`. The older checked-in sources-QA configuration
points to another database and was not used to select resources. Migration 0069
was applied to the actual QA database; existing schedule origins were preserved.

The final tested backend version is `9c085e77-7395-46d3-9daf-35cd62a1eb31`,
deployed at `2026-10-25T13:21:28.407416Z`. Existing secret bindings, resources and
frontend assets were retained. Binding comparison passed and public frontend
HTML matched the pre-deployment bytes. Native extraction was explicitly enabled;
helper composition preserves the configured non-native capabilities. Source
provider budgets remain $15, with existing per-operation ceilings unchanged.

The user's explicit $10 approval was recorded through the existing model-spending
authorization primitive, not a separate ledger or a bypass. Authorization ID
`qa-openrouter-recovery-20261025-10usd` maps the configured OpenRouter account
`openrouter-sources-qa`, permits only the two deployed models, and allows one
concurrent operation. Its validity is `2026-10-25T12:46:46.823Z` through
`2026-10-26T12:46:46.823Z`. At the recorded `13:25Z` check, confirmed model
settlements totaled $0.1290744. This is actual reported model cost at that check,
not a total source-provider bill or a final cost while processing continues.

## Live results

### NASA / Space

Thirty acquisitions completed with zero failures. Three V3 briefings were
persisted and separately read back through the public reader API. Each had one
section and one citation. Persistence and citations establish operational
success, not factual accuracy. Historical windows continue through ordinary
chronological processing under the spending authorization.

### Guardian / World News

All 72 historical exhausted acquisition jobs recovered. Seventy-one completed
under their first operator-approved extra attempt; one live-blog job required a
second bounded approval after an expired/no-result attempt. Cumulative attempts,
source identities, original dates and failure history were preserved. The final
reader check reported 447 completed acquisitions, zero pending and zero failed.

Two daily windows were reopened only after acquisition coverage became complete,
without changing their boundaries, request IDs or attempt counts, and with an
operator audit record and an unsettled-model-operation check. One window then
failed with SCOPE_DENIED. Read-only inspection established that its frozen V3
input contains three evidence revisions no longer active; the other frozen
window contains two. Feed revisions match. No new published Guardian edition was
verified. Frozen inputs and paid identities were not deleted or replaced to
force publication. A versioned recovery design is needed for these obsolete
historical snapshots; acquisition success must not be reported as publication
success.

### Exact-article diagnostic feed

The normal enrollment/intake paths acquired the retained real Naharnet article
(1,105 characters) and AS article (3,639 characters), matching native local
reproductions. Completeness remains UNKNOWN rather than claiming full text from
length alone. WAtoday reported restricted access; no full article was invented.
The diagnostic feed is paused, with evidence retained.

### Google News diagnostic feed

The live test resolved some publisher links and acquired seven articles. At a
recorded intermediate snapshot, 60 observations included 48 unresolved Google
listing URLs. The saved feed snapshot was still continuing, so these are a
bounded observation, not a final provider-wide success rate.

One Zyte operation retained status -1 with no response payload and a $0.05
reservation ceiling. Subsequent paid fallbacks for that source were fenced as
UNCERTAIN_PAID_SUBMISSION. This does not mean each failed article generated a
paid request: only one provider operation was recorded at that check. Its actual
charge is unknown. No reservation was erased and no duplicate paid request was
submitted. Provider-side evidence is required to reconcile that operation.
The diagnostic feed was paused; in-flight work can still settle or retain its
saved continuation. Google News resolution is therefore not claimed fully fixed.

## Remaining limitations

- Joud's original feed warnings have not been live-retested after a deployment
  because this work was explicitly redirected to QA.
- The helper diagnostic update still needs installing on the VPS.
- Google resolution is partial, and the uncertain Zyte response requires provider
  reconciliation before paid source recovery can safely proceed.
- Historical Guardian V3 snapshots reference superseded evidence and still need
  recovery that preserves immutable input and financial identities.
- WAtoday authentication/paywall restrictions, genuine missing pages, publisher
  challenges and external outages remain explicit failures. No scraper can
  guarantee access to every publisher.
- Paused source-matrix feeds were not activated, unrelated source queries were
  not silently edited, and no notifications were deliberately enabled for tests.

Browser control was disabled during this work. Dedicated diagnostic feeds were
created through existing repository and source-enrollment primitives. No app
session or persistent user-access credential was fabricated. Public reader
checks and D1 checks are the stated evidence; no browser UI verification is claimed.

## Follow-up fixes and QA verification

The user's follow-up requested fixes for the remaining three issues.

- V3 now refreshes a superseded snapshot only when no model intent or V3 result
  exists for it. It writes a new immutable input with a predecessor, timestamp
  and recovery reason, and stores the selected input ID on the original request
  and edition. The original reporting window, request/edition ID, attempt count,
  frozen predecessor and accounting records remain intact. Feed revision changes,
  source revocation and deletion still refuse publication. Started/uncertain paid
  work is not refreshed and receives V3_FROZEN_EVIDENCE_SUPERSEDED.
- Retained Google News links can now be decoded individually at acquisition,
  overcoming the collection helper's bounded snapshot decode allowance. A result
  must attest the exact input URL and a public publisher target. The stored
  observation and candidate identities remain unchanged; acquired evidence uses
  the publisher URL. Failed/unsafe decoding never invokes article scraping or a
  paid fallback. Approval denial, helper capacity and rate limits are preserved.
- Zyte receives a bounded 60-second response allowance rather than the generic
  20-second deadline. Unknown results still retain their reservations. Future
  failures record a bounded diagnostic for response headers versus response body,
  timeout/transport/size failure, and provider request ID when available. This
  metadata does not settle or release the operation. Zyte's synchronous endpoint
  can take longer than this local allowance; it is not a success guarantee.
  Reference: https://docs.zyte.com/zyte-api/usage/reference.html and
  https://docs.zyte.com/zyte-api/usage/errors.html.

Live QA checks confirmed the two historical Guardian windows had no model intents
and were eligible for unstarted-input recovery. They were reopened with unchanged
windows and audit records. The oldest created a successor input and successfully
settled editor calls rather than repeating SCOPE_DENIED. Final publication is
recorded below separately from this intermediate progress.

The Google diagnostic feed was briefly resumed, then paused again. Two retained
Google listing URLs decoded at acquisition and yielded publisher article bodies
of 7,358 and 5,759 characters, respectively. The source observations still hold
those original Google URLs. The paid-provider table still contained exactly one
Zyte operation, with its original $0.05 reservation ceiling; no extra paid request
was submitted for this follow-up test.

The uncertain Zyte request was identified from its request hash as
`https://www.jpl.nasa.gov/news/nasa-jpl-looks-to-next-90-years-of-innovation-exploration/`.
No response payload or provider request ID was retained by the old implementation.
The user was asked for provider-side request history/outcome; the source's paid
fence remains until that evidence supports reconciliation. New diagnostics cannot
retroactively establish its charge or invent its missing response.

Follow-up validation passed the original 15 V3 window tests plus two new recovery
cases, five Google decoding/approval cases, and 17 provider-budget/backend tests.
The full acquisition run hit one invalid new HTML fixture (corrected and retested)
and one existing five-second Miniflare test deadline under concurrent runs; that
admission test passed alone with a 30-second deadline. The other 73 acquisition
cases passed in that run. Worker TypeScript and the minified Worker build passed.
These overlap earlier suites and are not added to the earlier total as distinct
new tests.

### Confirmed Zyte completion and batch-lock follow-up

Aya supplied provider request ID `170d02a213082c0c04ccd96c5a16f5d8`, timestamp
`2026-10-25T13:15:31.537000Z`, and a screenshot showing HTTP 200 after 30,753 ms.
This exceeds the previous 20-second local deadline. The dashboard link was not
accessible through web retrieval and browser control remained disabled; the
receipt is explicitly recorded as user-provided provider evidence, not as an
independently downloaded response.

An operator-only primitive matched the retained request hash, provider, feed and
source, then recorded COMPLETED_RESPONSE_LOST, the request ID, latency, evidence
link, confirming authority and screenshot hash. The response body remains null.
The $0.05 reservation remains unchanged; the displayed price per thousand was not
substituted for a confirmed bill. Same-operation reads permanently return
RESULT_LOST without dispatch, while unrelated future source operations may proceed
under existing caps. Unverified missing responses still block as before. No paid
request was sent by reconciliation, and no response body was fabricated.

Operator acquisition recovery can distinguish a job held by another reconciled
operation from the original job whose paid body was lost. It refuses recovery of
the latter. The new refusal/approval paths and accounting behavior passed tests.
The diagnostic Google feed remains paused; historical failed jobs were retained.

A live runtime trace also identified repeated FEED_TURN_BUSY during parallel V3
editor-result replay. The V3 store now uses the existing local transaction queue
for database bookkeeping, leaving provider execution outside the feed lock. A
regression with distinct long articles verifies multi-batch publication with no
overlapping feed commits. Its initial fixtures inadvertently shared the same
canonical URL and were deduplicated; fixtures were corrected through normal
immutable evidence acceptance. The final regression passed.

The deployment containing completion reconciliation and batch coordination was
uploaded at `2026-10-25T14:18:53.339853Z`, version
`7113a0d7-b523-477d-a4fe-aa177945bab7`. Binding comparison and byte-identical
frontend checks passed. Subsequent final QA readback is recorded separately.

### Final QA publication readback

Both recovered historical daily windows were subsequently published and separately
read through the public reader API. Window a7590008... published at
2026-10-25T14:22:10.113Z and window fc224d12... at 2026-10-25T14:28:58.728Z.
Each contains seven reader sections and nine citation references. Both keep their
original window identities and predecessor input records. The later recovery used
published reader history from the earlier window. This is operational publication
and persistence evidence, not independent certification of factual accuracy.

A later read-only staging inspection is recorded separately under ignored private
storage at `.local-reports/staging-ai-audit-20261026/findings.md`. Staging was not
modified or deployed as part of that inspection.
