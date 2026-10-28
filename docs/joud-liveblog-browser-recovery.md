# National liveblog and reviewed browser recovery, 28 October 2026

Worker `distilled-news-joud`, deployed version
`18a734ec-df17-4641-84b1-8abab8d8c0e5`.

## Implemented and verified

National's liveblog prose belongs to an Arena embed rather than the page's
ordinary article DOM. The new reader parses the page's own Fusion JSON without
executing scripts, requires its canonical path to match the fetched National
page, and accepts exactly one valid arena-api-inline embed. It fetches Arena's
[documented public SEO representation](https://docs.arena.im/docs/how-arena-improves-seo)
without credentials. The LiveBlogPosting identity, publisher, free-access flag
and post URLs must agree with the embedded feed. Only posts for the URL's UTC
date are retained, in timestamp order. Evidence exceeding the body budget is
rejected rather than truncated. Retained updates are explicitly PARTIAL.

Real public endpoint previews returned 8,836 and 17,366 characters for the Iran
and Israel-election liveblogs. Five existing National acquisition jobs were
verified DONE at attempt 2. The cumulative confirmed recovery count is 115.
Old-day aliases are not rebound to today's updates.

Operator-only recovery now supports reviewedRedirect with an exact original URL,
same-origin HTTPS destination and reviewed headline. It is restricted to unpaid
recovery of known identity, extraction or network failures. Existing paid-outcome
fences, source approval, leases, cumulative attempt limits and histories remain.
Browser navigation goes directly to the reviewed destination with
exactCandidateOnly. The returned URL, article classification, canonical and
headline are checked; original citation and observation identities survive.
No paid provider or model stage is enabled by this recovery capability.

Known listing URLs that still reach article HTTP acquisition now receive
UNSUPPORTED/LISTING_PAGE rather than extraction-failure browser escalation.
Historical listing records remain retained.

The helper can optionally wait up to 3.5 seconds for article text to hydrate
after DOMContentLoaded. The guarded update script verifies the expected code,
backs up the dedicated Joud Python source, syntax-checks the replacement and
preserves file ownership/mode. The user installed this patch on the VPS and
reported backup `source-execution.py.before-browser-readiness-20261028T201811Z`.
No service restart, credential replacement or firewall change was required.

## Validation and remaining blocker

The complete affected Worker suite passed 171 tests before the final narrow
network-recovery extension. Both reviewed identity/network authorization tests
passed afterward. The helper passed all 31 Python tests. After the hydration
flag change, all 51 affected fallback/runtime/liveblog tests and Worker typecheck
passed. Public-source identity, date, size, restriction, unknown-paid and
no-paid-fallback safeguards have regression coverage.

Five CBS jobs were explicitly reviewed against two publisher-owned project
destinations. Initial recovery did not acquire readable text. After the user
installed the helper update, bounded retries encountered helper capacity waits
and then again returned no readable text. These jobs are NOT claimed recovered.
The local anonymous browser exposed readable text, but production VPS behavior
still needs a direct redacted diagnostic. No further CBS attempt should be
granted until that diagnosis identifies an actionable repair.

Other cases remain correctly blocked or unsupported: wrong-story Newscord
redirects, JPost's cross-origin conference landing page, videos without readable
prose/transcripts, image-only cartoons and old-date liveblog aliases. Eighteen
uncertain paid article jobs remain paused. No paid submissions, spending-limit
increases or clearing of uncertain outcomes occurred in this repair.

Frontend assets, resource bindings, models and migrations are unchanged. Private
HTML, manifests and result snapshots remain ignored under .local-reports.

## CBS runtime diagnosis and prepared resource policy

The user's VPS diagnostics found ample free memory, a responsive helper listener
(unauthenticated HTTP 401), and a successful offline parser in 0.29 seconds.
An example.com browser request succeeded in 1.46 seconds. CBS alone still timed
out after 67.57 seconds; this is not evidence of a general browser startup failure.

A local isolated test restricted both reviewed CBS project pages to their own
HTTPS origin, blocked images/media/fonts and bounded requests. It retained the
complete extracted bodies (19,298 and 3,189 characters) in 1.521 and 2.404 seconds.
The prepared helper policy applies only to exactCandidateOnly CBS project pages:
third-party resources are blocked and at most 80 own-origin resources continue.
The initial public-origin check, required private-IP egress firewall, navigation
restriction and browser sandbox remain. Other publishers retain existing checks.
Thirty-two Python tests passed, including resource filtering and budget coverage.

The guarded `scripts/update-joud-cbs-resource-policy.sh` patches only the expected
browser function in Joud's dedicated helper, backs it up and syntax-checks it.
VPS installation and real CBS recovery verification are still pending at the
time of this note; the local speed measurement is not a production success claim.
