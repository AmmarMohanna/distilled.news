# Public edge and signup capacity

## Cache contract

The expensive anonymous public reads use the Cloudflare Cache API plus an
isolate-local single flight:

| Surface | Edge TTL |
| --- | ---: |
| `/api/status` | 15 seconds |
| `/api/capabilities` | 15 seconds |
| Explore feeds | 30 seconds |
| Feed and edition reads | 30 seconds |
| Published-feed search | 15 seconds |
| Sitemap | 5 minutes |

Cache keys include the route, normalized bounded inputs, and the immutable
release SHA. A deployment therefore cannot reuse an older release's entry.
Interactive feed mutations delete the matching feed/Explore entry in the
serving POP. Other POPs and asynchronous publications converge no later than
the short route TTL; the sitemap has a separate five-minute discovery budget.

Requests carrying `Cookie`, `Authorization`, `Range`, `Cache-Control:
no-cache/no-store`, or `Pragma: no-cache` bypass both the Cache API and
coalescing. Only successful responses without `Set-Cookie`, private/no-store
directives, or the stale R2 snapshot marker are stored. That prevents
viewer-specific star state, authenticated data, errors, and degraded fallbacks
from entering the anonymous cache.

`x-distilled-cache` reports `HIT`, `MISS`, `COALESCED`, or `BYPASS`. This is
operational evidence, not an authorization signal. Cache API entries are
POP-local, and a Cache API hit still invokes the Worker. The objective is to
collapse repeated D1 work and control rows read; it does not claim to eliminate
Worker invocations.

## Cost-aware staging load gate

Run only against isolated staging:

```sh
RELEASE_SHA=<full-protected-main-sha> pnpm load:public-edge:staging
```

The script discovers a real public staging feed, exercises status,
capabilities, Explore, feed, edition, search, and sitemap routes, and samples
Cloudflare GraphQL before and after. The JSON evidence includes:

- successful and failed HTTP requests;
- observed Cache API outcomes;
- Worker invocation and error deltas;
- D1 rows-read, read-query, and write-query deltas;
- D1 rows-read/request and read-queries/request thresholds.

It deliberately does not treat latency as a cost proxy. Cloudflare analytics
can lag and includes concurrent staging traffic and the minute scheduler, so
retain the full measurement window with the release evidence. The command
reuses the existing analytics-read Cloudflare credential; it does not create,
rotate, or broaden any token.

For hosted launch evidence, dispatch the protected `Public edge cost evidence`
workflow from the exact staging SHA. Retain its workflow run ID, artifact ID,
and GitHub-reported artifact SHA-256. Registration opening verifies all three
against GitHub Actions and refuses an expired, failed, different-branch, or
different-SHA artifact.

## Hosted pending-registration queue

Hosted signup remains first-come, first-served without letting abandoned email
verification records hold all slots indefinitely:

- the database atomically enforces the total account cap and separate pending
  cap;
- each unverified hosted account owns a pending slot for 60 minutes;
- the minute scheduler expires hosted pending slots, and a full registration
  request performs the same bounded cleanup before refusing a legitimate user;
- hosted email verification links use the same 60-minute lifetime;
- one email can attempt registration twice per day;
- one HMAC-pseudonymized client IP can reserve at most two pending slots per
  hour and three per day;
- Turnstile host and action validation remains mandatory.

When every live pending slot is occupied, the API returns `429` with
`Retry-After`, capabilities expose the 60-minute lease, and the UI says the
verification queue is temporarily full. Existing users and all public reads
remain available.

At the Cloudflare edge, add a WAF rate-limiting rule for
`POST /api/auth/register` keyed by source IP and use a managed challenge before
the Worker. Keep its threshold no looser than the application ceiling, and
exclude only reviewed internal test traffic. The application limits and atomic
D1 cap remain authoritative if a self-hoster does not have that WAF feature.
