# Collection deadlines and recoverable source capacity waits

Branch: `aya-collection-deadline-recovery`, based on `b11c12cd`.

## Retained trigger

The October 31 read-only staging audit of `product-proof/leb-arab` found six
published editions, 6 minutes 42 seconds to 22 minutes 19 seconds after their
intended hourly delivery. Average lateness was approximately 12 minutes. V3's
recorded editing/verification stages took 13–21 seconds; most waiting preceded
the first model intent. The 23:00 Beirut request was still pending in the final
audit snapshot. These observations are a dated workload, not a scalability result.

An Annahar X poll scheduled at 14:51:03 UTC only allocated its fetch run at
15:06:32 UTC, although TwitterAPI.io telemetry recorded 2.333 seconds. Almodon
polls retained `BACKPRESSURE / HELPER_GLOBAL_CAPACITY_BUSY / 503`; two final
retry eligibility times were immediately before the late 20:17 and 21:22 local
publications. Retry eligibility is not an exact completion timestamp.

Authenticated VPS status samples showed two occupied helper slots, then zero
three seconds later. That establishes transient occupancy, not a dead process
or proof of the tasks causing every historical delay. No server capacity or
service configuration was changed.

## Implementation

- Poll dispatch admits at most two live deliveries per feed and family by
  default. Atomic claims count existing live dispatch leases. Completion refills
  only that family instead of waiting for another feed/Cron scan. Other feeds
  retain their independent capacity, and every fifth minute retains oldest-due
  fairness. Telegram keeps its separate dispatch lane.
- Eligible polls holding closed pending windows receive priority. Future retry
  times and live canonical/transport leases remain authoritative. No provider
  request, source checkpoint, collection bound or paid identity is replaced.
- For V3, a confirmed `BACKPRESSURE` poll with no captured result may stop
  holding publication at cutoff plus the existing five-minute delivery lead.
  This is the intended clock delivery, not an extra five-minute delay.
  Unknown scheduling times, live execution leases, captured pages, unresolved
  handoffs, other failures and V2 keep their prior gate.
- Publication records `INCOMPLETE` coverage, a typed
  `COLLECTION_BACKPRESSURE_AT_DEADLINE` count and the affected source identities.
  Healthy evidence can publish; an empty incomplete window becomes `DEFERRED`,
  not `QUIET`. The refused poll stays pending with its original identity for
  recovery and the existing late-discovery path.
- Current source capacity refusals remain visible even when a previous poll
  succeeded. Recovery clears this warning naturally; no history is rewritten.
- Poll dispatch and consumer timing logs contain operational identities and
  timestamps, not source text, URLs, credentials or claim tokens. They supplement
  existing fetch-run and provider timings to separate future dispatch/queue waits
  from upstream work. Existing restricted Grafana export rules remain unchanged.
- Additive migration `0083_collection_dispatch_capacity.sql` indexes live pending
  dispatch occupancy and pending reporting deadlines. Collection-gate reads filter by feed inside each poll CTE,
  avoiding a global pending-poll scan before classification.

## NNA extraction and stale backlog

Anonymous HTTP for a retained failed NNA URL returned HTTP 200 after redirecting
to its article-specific title URL. The returned HTML was a client-rendered shell:
the deterministic extractor found the expected title/canonical identity and
article metadata, but zero article-body characters.

Previously, this verified publisher relocation could only use the existing
rendering fallback if it had a separate operator-reviewed redirect. It now uses
the already-authorized exact-article fallback after the same origin, headline,
page-kind and canonical-identity checks. Fallback results must still validate
against the original article identity. Foreign identities and unrelated headlines
remain rejected. No LLM extractor, login or paywall bypass was introduced.

The retained NNA examples had September publication dates, predating the October
31 feed. This branch already inherits initial-backlog deferral from Aya's work.
It must not turn those articles into fresh news or silently reopen the 20 old
failed jobs. Their live recovery and actual rendered-body acquisition have not
been performed by this change. Completed zero-result `@961news` polls likewise
do not establish a scraper defect; useful post delivery remains unverified.

## Validation and rollout boundaries

Regression tests cover deadline equality, active leases, captured/unknown work,
V2 preservation, truthful incomplete publication and empty-window deferral,
source warning recovery, concurrent dispatch bounds, cross-feed isolation,
periodic fairness and relocated client-rendered article identity checks. Existing
financial, stale-backlog, publication-window and recovery tests remain in place.

All provider/model tests use mocks and local D1. The anonymous NNA HTML check is
a read-only HTTP diagnostic, not a successful rendered acquisition or paid test.
No model/source authorization, server setting, live feed or deployed Worker was
changed. Deployments need the additive migration first. Follow-up live validation
must measure actual scheduled-to-published time and coverage; passing these tests
does not demonstrate 1,000-feed capacity, on-time delivery or factual accuracy.

## November 1 QA recovery follow-up

Live QA exposed two additional causes of backlog beyond collection polling:

- A started V3 window whose retained evidence was superseded could repeatedly
  monopolize the oldest runnable window. It now yields to later windows through
  the existing recovery bypass. The original input, request and financial history
  stay intact; the superseded work is not replayed or declared successful.
- Confirmed helper-capacity refusals in ACQUIRE jobs could stay pending after
  hundreds of waits and hold every later V3 window. After cutoff plus five minutes,
  these count as incomplete acquisition coverage while recovery keeps running.
  Admission, queue-consumption checks and final V3 publication use the same rule.
  Only the explicit local/global helper-capacity and helper-rate-limit details
  qualify. Unknown observation times, invalid/live leases, running acquisitions,
  provider-in-flight/unknown work, reassessment and retained V2 keep their gates.

This does not make unavailable source content available. Healthy retained evidence
can publish with honest incomplete coverage; missing acquisitions retain their
identities and recover through the existing late-discovery path. No paid hold is
released, source authentication bypassed or original reporting window expanded.
Local regression tests cover the refusal boundary and safeguards, plus full-text
V3 editor/verifier publication with citations and exactly-once result reuse.

## Backlog failure audit and legacy HTML follow-up

A November 1 QA audit found no failed ACQUIRE jobs in Aya's Cyberwar or Israeli
Elections feeds. The AI feed retained 21 failures; all their recorded publication
hints preceded subscription. Pandemic retained 25 non-authentication failures:
23 preceded subscription, while two observations concerned the same later
Portland Business Journal story. These are dated retained-record counts, not
proof that every currently configured source is available.

Anonymous direct HTTP checks returned 403/challenge pages for the Business
Journal story and sampled OpenAI URLs. No readable article body was received.
A FAO chapter returned HTTP 200 with substantive prose, but the extractor returned
zero body characters because its H1 and paragraphs were direct children of BODY.
The guarded legacy-layout fallback now recognizes one unlinked root H1 followed
by at least three substantial direct paragraphs (1,500 combined characters),
subject to existing link-density and competing-heading checks. It preserves
chapter tables, excludes navigation/footer elements, and does not fabricate dates.
The retained anonymous FAO response now yields 32,071 text characters and an
article classification, with no publication date inferred from body prose.

The connector suite passed 348 tests with one existing skipped test. Synthetic
regressions cover the root-level chapter, long linked news indexes and short
teasers. Full acquired HTML stays in private local evidence, outside the repo.
Old failures, login/payment responses, uncertain operations and stale article
dates are not erased or indiscriminately resubmitted to paid providers.
