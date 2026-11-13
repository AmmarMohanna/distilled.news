# Joud source-search and Lovin verification

Target: `distilled-news-joud`, using its existing Joud D1, R2, private execution binding and provider configuration. Other deployments were not changed.

## Live observations

- The initial authenticated Georges Khabbaz source search took 19.782 seconds. Preferring the configured private Google feed route reduced the measured first search to 13.318 seconds; the immediate owner-scoped cached repeat took 264 milliseconds. These are individual measurements, not latency guarantees.
- The final deployed check returned 12 results, including Lovin, in 13.544 seconds on the first request and 1.168 seconds on the repeat. The upstream first-search wait remains a limitation; the live frontend matched the new build.
- Direct public HTTP, anonymous private HTTP and the configured anonymous browser each returned HTTP 403 for Lovin. A 404 on the helper's separate status path did not establish that its execution endpoint was unavailable.
- The user authorized a two-request Zyte test with a total reserved ceiling of $0.10 and no model calls. The retained homepage response was reused during debugging. The ledger contains exactly two completed operations with retained payload references and $0.05 ceilings each. These ceilings are conservative reservations, not a claim about the provider's invoiced charges.
- Zyte returned HTTP 200 for the homepage and a Beirut entertainment article. The article request resolved to its `/beirut/en/` canonical URL. Offline extraction under that observed identity produced 3,036 readable characters. The old requested URL and immutable paid operations were not rewritten or treated as an independently verified redirect.
- No live relevance-model evaluation, feed creation, reader notification or publication ran as part of that test. Raw receipts, hashes and extraction checks are retained in the private Joud archive and ignored `.local-reports/lovin-paid-probe/` directory.

## Changes

Search preserves matching publishers without per-publisher access probes or silent substitutions. It uses a short owner-scoped edge cache, a component-local cache and a 300 ms typing delay. Search results can supply their existing server-owned indexed evidence to assessment, avoiding a second Google lookup; caller-supplied passages are never trusted.

Lovin's global and Beirut landing pages remain listings. WordPress body-template classes such as `elementor_header_footer` do not turn the entire page into navigation. Actual navigation elements and unrelated publishers retain their protections. A landing page supplies candidate links, not article evidence.

An ordinary failed website check never starts paid retrieval. When the deployment's existing paid verification and Zyte configuration permit it, the UI offers a priced, explicit retry with a $0.10 retrieval cap. The backend requires that exact approval, limits checks per owner, and permits at most a source-page request and one article request at no more than $0.05 each. Existing reservations, grants, immutable request identities and uncertain-outcome fences remain authoritative. Accepted assessments and hourly HTTP receipts are reused where applicable.

The independent relevance audit still decides admission. This work proves a viable retrieval route and deterministic extraction; it does not assert that a particular live feed's interests have passed that audit or that a briefing was published.

## November 13: free-only search policy

The user subsequently requested hiding sources that need paid retrieval. Search now checks public readability with a shared 1.5-second deadline, reuses availability checks, and omits blocked or unconfirmed results. Incomplete checks are not cached as complete query results. Existing indexed search and independent admission checks remain separate; an HTTP 200 response alone does not prove article relevance.

The Add Feed paid retry controls are removed and its assessment endpoint rejects explicit paid budgets before retrieval. Historical operations and receipts are preserved. No further paid checks were run. The interests field also displays two complete lines initially and supports vertical corner resizing.
