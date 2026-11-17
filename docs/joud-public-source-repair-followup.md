# Public source repair follow-up, 28 October 2026

Worker: `distilled-news-joud`. Deployed version:
`ccd0e71f-dfaf-40dd-bad7-95602d3fa01d`.

## Verified changes and recoveries

The MTV parser now reads the explicit `articles-report` prose container, excluding
ads and login chrome. This is limited to HTTPS www.mtv.com.lb long-form News URLs.
The URL ID, unique articleParams owner ID, canonical ID, og:url and nonempty
articleTitle/og:title must agree. At least 200 characters of real body text are
required. Numeric identity permits the publisher's short canonical alias while
preserving the original observation and citation URL. No transcript or metadata
teaser is substituted for prose.

Twelve existing failed MTV jobs were recovered through the guarded unpaid-only
endpoint. Final D1 verification found all 12 DONE, each at attempt 2. Two waited
for feed admission and completed on idempotent approval replay. Earlier failure
history remains retained. The cumulative confirmed public recovery total is 110.
Five other MTV pages still had no readable body and were not retried.

Discovery now excludes observed, exact publisher section/podcast-series paths
on JPost, National and LBC, including LBC latest-news language listings. Article
children remain discoverable. Whole-card links now retain their nested headline
instead of concatenating category labels, summaries and video durations. Old
observations are not rewritten and old listing failures are not deleted.

Validation: 164 affected Worker tests passed; 59 connector tests passed with one
existing fixture-dependent test skipped. Worker and connector typechecks passed.
Negative cases cover other hosts, wrong article IDs/headlines/canonicals, and
section/article-child distinctions. A real MTV public-only router preview also
returned the correct 576-character body without a fallback. Frontend assets,
models, provider budgets, resource bindings and migrations are unchanged.

## Remaining cases, freshly inspected

- CBS: two distinct investigations (three saved jobs) expose 3,189 and 19,298
  readable characters in an isolated anonymous local browser. Static HTML lacks
  the body. Both redirect from news URLs to projects URLs; one headline changed
  and the old card titles include labels/decks. The current strict identity and
  free-only runtime do not accept these. No browser snapshot was imported and
  these jobs remain unresolved; this deploy does not add a browser recovery lane.
- National: seven of the previously unreadable URLs are genuine section or
  podcast-series listings; two videos expose only 56/64-character descriptions.
  The cartoon has no body. The liveblog still exposes no readable body in the
  browser and its changing URL/headline triggered two identity failures by the
  final audit. These are not declared successful.
- LBC: the remaining unreadable URL is `/latest-news/ar`, a listing now filtered
  from new discovery. Two other historical listing records remain.
- JPost: the conference news URL redirects to a different-origin event landing
  page with a different headline. It remains rejected. Fourteen historical
  section/listing records remain correctly excluded.
- Newscord: the retained Putin story redirects to a Qatar emir story. Rejection
  remains correct.

The existing receipt metadata was audited read-only: 42 database-wide uncertain
operations have no retained payloads or runId/requestId fields. This does not
establish provider outcomes. The feed's 18 paid-held article jobs remain paused;
no paid requests were submitted, holds cleared or spending limits increased.

Final public feed check returned HTTP 200 with two published editions and
publicationState `checking`. Saved item diagnostics remain historical records,
not proof of a current source-wide outage. Fresh live workloads can introduce
additional failures; the reported recoveries are specifically the 12 verified
jobs, not an all-sources reliability guarantee.

Private page captures, browser checks, manifests and D1 snapshots remain ignored
under `.local-reports/live-check` and are not included in Git.
