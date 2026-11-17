# V3 prepared-source accounting diagnostic

The editor now records prepared references that appear in neither its raw `items[*].sources` nor `left_out[*].sources`. Newly generated results include `unaccounted: [{ref, sourceIds}]`; the result type is optional for historical-result compatibility. An empty array means no reference-presence gaps, not complete factual or development coverage. A legacy result without this field remains unmeasured, not silently treated as an empty audit.

This is mechanical bookkeeping only. It does not infer relevance, importance, factual accuracy, a deliberate exclusion or an important omission. One article may contain multiple developments, and a cited reference alone does not establish their completeness. Original IDs folded during normal preparation stay attached to the prepared reference. Unknown publisher IDs or malformed reference lists do not count as valid prepared refs.

The audit runs once per existing editor response, accumulates across chunks and is stored with the normal generation result. It does not change prompts, introduce a call, create a repair/retry, block an otherwise valid empty or nonempty briefing, change carry eligibility, modify feed pointers or alter published reader text. Existing selected-output/citation validation remains unchanged. No database schema or deployment change is needed for the additive result metadata.

Retained V6 replay reports six unaccounted refs: S4, S9, S11, S12, S13 and S15. They include optional/off-topic material as well as the specifically diagnosed S13 announcement; six gaps is **not** six important omitted developments. Raw paid responses, prior results and original evidence were not rewritten.

Tests cover explicit exclusions, valid empty results, multiple developments citing one source, aliases, chunk accumulation, retained S13 and unchanged request/call identities. A local D1 Worker integration test verifies that an accepted edition persists despite an unaccounted source, the diagnostic survives read-back, and duplicate delivery sends no further provider calls. Its provider is mocked; this is integration evidence, not live factual qualification. The first fixture attempts reused identical article URLs and were correctly folded by existing deduplication; the fixture was corrected to use distinct evidence and URLs. Runtime deduplication was untouched.

V4 remains the production/default prompt version. No prompt, model routing, financial authorization, real feed, notification or cloud deployment was changed.
