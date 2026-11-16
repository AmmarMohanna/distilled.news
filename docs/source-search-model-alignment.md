# Source search alignment

Submitted searches with a feed title and description now use one bounded model
batch to judge the retrieved result titles and excerpts against the complete
feed context and query. Broad category titles do not impose an exact-word AND
rule. Named people, institutions and required geography still need a supported
connection. The model may recognize translations and synonyms; discovery does
not discard those candidates through literal query or title matching first.

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
