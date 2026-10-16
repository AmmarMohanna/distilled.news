# Sources QA fixes — October 16, 2026

Branch: `backend-sources-mixed-source-fixes`. These changes follow the five-feed
validation recorded in `FIVE_FEED_QA_VALIDATION_2026_10_15.md`.

## Fixes to preserve when merging

- Coordinate acquisition, intake handoff and intelligence through the existing
  renewable feed turn. Different feeds remain concurrent; canonical CAS and
  authorization still fence every commit. Collection HTTP runs outside the
  handoff turn. Busy queue deliveries back off without consuming canonical
  attempts; exhausted contention remains durable scheduler recovery.
- Continue due review after acquisition and refill acquisition after review,
  rather than requiring another minute tick for each handoff between stages.
- Accept verifier verdicts for optional facts explicitly offered in that packet.
  Foreign fact/story ownership is still rejected, and complete mandatory fact
  and claim-entailment verdicts remain required. This fixes a real RSS
  `SCOPE_DENIED` path after otherwise valid model verification.
- Reuse immutable result timestamps on paid-result recovery. A restarted packet
  cannot create an idempotency conflict merely because its persistence clock
  advanced. Different result contents still fail immutable comparison.
- Use the claim extractor's sentence boundaries for approved spans, including
  closing quotation marks. Partial source sentences remain rejected. Retained
  Google News selected spans were exercised locally without model calls.
- Recognize equivalent age-bound wording: “under the age of eight” and “under
  eight.” A different age or an invented bound is still rejected.
- Preserve precise connector publication time when article metadata reduces the
  same calendar date to midnight. Distinct original-publication/update dates
  are not equated. Both observed timestamps and the selection rule are retained
  in acquisition provenance; existing evidence revisions are not rewritten.
- Discover NASA-style news indexes as independent article candidates; exclude
  div-based global navigation and recognize item-heading links. A fresh public
  NASA HTML capture yielded 15 actual news links. JavaScript-only pagination is
  explicitly incomplete; no next-page URL or archive exhaustion is invented.
  Downstream article acquisition also rejects discovered listings.
- Mixed acquisition failures use a generic failure warning rather than claiming
  the entire count consists of authentication failures.
- The shared article HTTP path now resolves at most three publisher-local
  redirects, preserving the observed candidate identity and final transport URL.
  Cross-origin, credential-bearing, insecure and looping redirects still fail
  before another fetch. Authentication responses remain unavailable content.
- Skip automatic publication windows ending before feed creation. The admission
  function lives in `connector-publication-window.ts`; the intelligence runtime
  has only its import/call integration. Existing historical requests are untouched.

No shared handoff contract, financial ledger identity or database migration is
changed. Staging remains outside this rollout. Preserve existing QA secrets,
bindings, source budgets and immutable frontend asset prefix on deployment.

## Validation

- Worker typecheck and sources-QA dry-run build passed during implementation.
- 104 tests passed across runtime scheduling, acquisition, adaptive publication,
  fidelity, connector integration safety and scale checks. The adaptive suite
  includes later-clock verification recovery without a second paid call.
- Additional focused queue, optional-fact verification, source-warning, approved
  synthesis and independent-story isolation suites passed.
- Website discovery: 12 tests passed. Website provider cases: seven passed.
- Publisher-local redirect and downstream runtime integration: 13 tests passed.
- Local 1,000-feed dispatcher and 1,000-consumer public-fetch reuse checks passed;
  these are bounded local checks, not sustained live production capacity proof.

## Limits of the result

Publisher authentication, policy refusals and exhausted acquisition recovery
remain genuine coverage failures. These changes do not bypass publisher access
rules or label blocked articles as collected. Uncertain X/LinkedIn payments and
the historical unknown model hold remain fenced pending authoritative receipts.

Model prose can still fail grounding, quantities or required-fact checks. Such
content must remain unpublished; no validation was disabled to force delivery.
A retained RSS replay needs fresh verification when a corrected precheck admits
more stories than its previously cached verification packet covered. The old
narrower verdict cannot be reused as approval of the expanded claim set.

## QA rollout

Code commit `926f151` was deployed to sources QA as version
`6350728c-7f4b-46b9-8510-e10ab052ed05`. A settings comparison found no missing or
unrelated changed bindings. The immutable frontend prefix and secrets remain
unchanged. The redirect follow-up has its own subsequent commit/deployment.

For follow-up validation on the same RSS test feed, the remaining original $5
allowance was calculated from recorded exposure: $2.2346228 already used,
$2.765377 maximum additional exposure (rounded down). A non-overlapping grant
expires October 16 at 02:21:51 Beirut. Existing charges and the old unknown
$0.02 hold remain intact; no additional $5 allowance was granted. Other test
feeds remain paused. Final observation and cleanup follow below.

Final redirect deployment: `ae948d36-91ea-4568-8123-9ee0dd8bd3d2`, confirmed
active on sources QA. No staging deployment was performed. At October 16,
08:06:37 Beirut the RSS feed was paused again; a database read confirmed all
five temporary feeds paused. The follow-up had 73 completed acquisitions and
50 completed reassessments, with no pending acquisition/reassessment jobs at
the final sample. Two checked fresh revisions retained exact RSS publication
times (17:47:22 and 15:26:16 UTC), rather than midnight.

**The follow-up did not publish an RSS edition.** The 23:00 UTC request remains
`PUBLICATION_EXECUTION_YIELD`; retained writer feedback also contains missing
quantities/facts and invalid direct quotes. Later windows encountered expired
account authorization. These outcomes must not be called an end-to-end pass.
The remaining work is reliable publication continuation plus writer fidelity;
scope/grounding checks must remain enforced. Old failed requests were not reset.

Follow-up reported model costs: $0.768936 (GPT-4.1) and $0.153506
(GPT-4.1-mini), total $0.922442. Combined with the original $2.2346228,
reported test spending is $3.1570648. No new unsettled model reservations
appeared in the final query; the historical unknown $0.02 remains. Both test
grants expired. A final binding comparison found no missing/unrelated changes.
