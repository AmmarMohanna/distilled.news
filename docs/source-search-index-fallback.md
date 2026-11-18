# Optional bounded web-index supplementation

`SOURCE_SEARCH_WEB_DISCOVERY_ENABLED=true` supplements source searches that
produce fewer than twelve verified matches. Free discovery and verification run
first and stream their results immediately. Successful broad searches do not
invoke the paid index. The default is disabled.

The optional route uses the configured `SOURCE_DISCOVERY_MODEL` and OpenRouter's
bounded Exa fast web-search tool: one invocation, at most 25 indexed candidates.
Only actual provider citation annotations supply URLs and titles. Excerpts are
optional; generated model prose is never used as discovery evidence. All
candidates still undergo the existing feed-title/description/query relevance
decision and anonymous readability verification. Confirmed blocked articles stay
hidden. Supplemental results merge with earlier verified matches rather than
replacing them. Distinct article URLs remain separate.

This route requires an authenticated owner, OpenRouter credentials, R2 receipts,
and an authorized shared-model spending grant covering `assessment:<owner>`.
Ordinary free discovery still works when these are unavailable. No paid article
retrieval is enabled by this flag. The model ledger reserves the bounded search
fee and retrieved-input allowance before calling the provider; reported provider
usage settles the operation. Oversized, aborted or uncertain outcomes keep their
hold and cannot be resent. Receipts are bounded to 256 KiB.

The retained index lookup identity includes the owner, exact query and UTC day.
Repeated discovery on that day reuses the immutable receipt. A later day is a new
source-discovery snapshot; this is not an article freshness or event-date claim.
Existing relevance and article-access caches remain owner/topic scoped.

Isolated Joud QA on 2026-11-18 returned twelve verified results for
`ammar mohanna aub` after the free index had returned unrelated property listings.
The index call cost $0.02886 plus relevance checks. Separate index-first transport
probes returned 20 English science, 13 French economy and 10 Arabic science
matches. Those probes establish discovery/access behavior, not factual briefing
quality or the final free-first latency. They did not create feeds or notifications.
The provider remains optional and deployment-specific; these observations do not
authorize ongoing inference spending elsewhere.
