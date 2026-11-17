# Source search alignment

Submitted searches with a feed title and description now use one bounded model
batch to judge the retrieved result titles and excerpts against the complete
feed context and query. Broad category titles do not impose an exact-word AND
rule. Named people, institutions and required geography still need a supported
connection. The model may recognize translations and synonyms; discovery does
not discard those candidates through literal query or title matching first. The submitted query is kept intact rather than appending every
word of the category title as an upstream search requirement.

Public publisher samples, web results and the configured public Google route
run concurrently. The relevance batch includes at most 60 candidates and uses
`SOURCE_ASSESSMENT_MODEL` (default `openai/gpt-4.1-mini`), a 2,200-token output
limit and an eight-second response deadline, with no tools or retries.
Autocomplete does not invoke this check. Successful API results retain the
existing owner/context-scoped cache; the cache version changed to invalidate
previous keyword-filtered results.

Authenticated calls use the existing durable assessment spending and provider
capacity controls, including retained reservations for uncertain outcomes and
saved-response reuse. Missing configuration, invalid decisions and timeouts
hide unverified results and report search unavailability. A fully rejected
batch reports the existing off-topic message. Public readability is checked
independently before returning accepted results. No paid retrieval is enabled.

Regression coverage includes Economy and Finance, Science and Technology,
French and Arabic equivalents, named institutions, named-person overlap,
authenticated API integration, malformed/unknown decisions, timeout handling,
public access, caching and existing accounting recovery. Model responses in
these tests are mocked: they establish the application contract and removal
of the exact-word prefilter, not measured live-model factual accuracy.

## Review fixes

Publisher feeds now contribute a larger bounded candidate pool, interleaved
with the other routes before the single 60-result model batch. A sixth article
can reach relevance assessment; the displayed-result cap is applied afterward.
Unknown candidates remain hidden, while accepted candidates make a mixed batch
a successful cacheable search. Fully inconclusive batches remain unavailable.

The public/helper race chooses the first nonempty result, waiting for the other
route when the first is empty. Both routes returning readable empty results
returns an empty search without enabling paid retrieval.

Uncached authenticated source assessments are limited to 30 per owner per five
minutes, with HTTP 429 and Retry-After: 300. Accepted assessment-cache receipts
can still be reused without spending this allowance.

Readability checks verify both the source and the selected article under the
existing shared short deadline. Article cache identities are separate from
publisher cache identities, so one blocked article does not hide another free
article. Public HTTPS redirects are bounded and checked at every hop; private,
credentialed and login destinations are denied. An unresolved Google article
wrapper is not treated as readable publisher evidence. When explicitly enabled,
the existing private `google_resolve` helper resolves up to 60 listing links in
one four-second bounded batch with a two-second helper decoding budget (other
collection callers retain their existing default budget). Validated same-publisher public HTTPS targets are
cached for an hour; actual article readability is checked independently. Invalid
targets, missing resolutions and blocked articles stay hidden. No paid resolution
is started. The search-result cache version invalidates older access checks.

Completing a source addition clears its query only if the user has not changed
that query while verification was running. Regression tests cover the review fixes
with mocked HTTP/model responses and local account authentication.

Model candidates carry the actual publisher hostname and canonical source URL
as well as the article URL. This preserves publisher identity when an indexed
article still has an opaque Google News URL. A regression uses identical article
headlines/excerpts from two different publishers. API and UI regressions verify
mixed accepted/unknown batches remain successful and use their normal caches.
