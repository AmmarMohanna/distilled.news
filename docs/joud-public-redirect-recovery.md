# Public redirect recovery, 28 October 2026

Deployed Worker version: `49241f0e-a9a9-4fbd-bb20-14c6b1089c79`.

The remaining Al Jazeera stock-market article moved from `/news/` to `/economy/`
on the same publisher origin. The public destination contains 4,021 readable
characters and the exact headline retained from the original source observation.
Earlier acquisition rejected the changed URL instead of verifying the relocation.
The original failed job is now verified DONE with attempts increasing from 1 to 2,
using the same recovery approval through a temporary FEED_BUSY wait. The verified
public-only recovery total is 98.

Public HTML relocations now require the same HTTPS publisher origin, an exact
normalized retained headline of at least 20 characters, article classification,
a canonical matching the actual destination, readable evidence and no access
restriction. Only whitespace, Unicode compatibility, quote style and letter case
are normalized for headline comparison. Different stories, missing headings,
non-HTML redirects and unbound canonicals are rejected without stage escalation.
Original observation, citation and paid-operation identities remain unchanged;
the final URL is retained separately as resolvedUrl. Standard nonredirect
extraction behavior is preserved.

The secret-authenticated free recovery action accepts optional redirectEvidence
for one additional attempt. Same-origin historical policy-failure recovery is
allowed only in unpaid mode; a redirect assertion cannot bypass the router's
independent live identity checks. Unknown paid outcomes are still refused.

Validation: all 164 affected acquisition, fallback, public-fetch, article-HTTP
and downstream runtime tests passed after correcting an initial nonredirect
content-sniffing regression. Worker typecheck passed. The real publisher
relocation also passed a public-only router preview. No spending settings,
providers, models, frontend assets or billing holds changed.

An isolated local headless browser also inspected MTV, a CBS investigation and
a National cartoon without using a personal profile or paid provider. The MTV
and cartoon pages still contained no readable article body. The CBS investigation
exposed readable text after rendering, but that alone does not authorize
substitution for an old mismatched URL. Index/section pages remain excluded,
and unrelated Newscord redirects remain rejected. These cases were not marked
successful or deleted from history.

Private HTML, browser captures, manifests and result metadata remain ignored
under `.local-reports/live-check`.
