# Source search interaction

Typing now shows local query completions from the feed title/interests, recent searches in the open editor and publisher names/aliases. These are suggested queries, never verified sources. No network request, model or paid collector runs on each keystroke. Enter, a completion click or Search sources submits the search. URL entry retains its explicit source-check flow.

The submitted request includes the current title and interests in an authenticated POST body. Search adds a bounded topic hint to upstream discovery, and indexed titles/excerpts must match both the query and topic gate before public access checks. Literal short subjects found in the interest description retain all subject words, preventing generic AI articles from matching the Ammar Mohanna feed. Generic titles fall back to meaningful interest words. This is a conservative lexical filter, not a claim of semantic or factual verification. The existing independent passage audit still decides admission. Rejected selections are removed and their reason is shown.

Search/discovery caches remain owner-scoped and now include the topic context. Changing the topic hides previous results; caches for another topic cannot supply article evidence to assessment. Existing blocked-source filtering and already-added publisher filtering remain in place. Searches with only off-topic indexed evidence show an explanation rather than source choices.

Autocomplete is immediate. A new submitted web search can still wait for its upstream Google transport; cached searches retain the faster reuse introduced earlier.
