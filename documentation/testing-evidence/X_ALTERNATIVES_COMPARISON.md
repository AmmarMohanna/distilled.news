# TwitterAPI.io versus Apify: existing pilot evidence

Updated 2026-09-26. Official X API excluded. Media excluded from acceptance. No new collection or paid calls in this comparison; TwitterAPI.io was replayed from saved responses.

| Provider | Sample records, including repetitions | Field-preservation findings |
|---|---:|---|
| TwitterAPI.io | 40: 20 profile + 20 search | Saved-response replay retained all records; 240 required-field/text/author/date/post-link/expanded-link checks passed. |
| Apify Kaito actor | 160: 80 profile + 80 search | Existing after-fix checkpoints retain all records with no recorded text/author/date/link checkpoint failures. |

These samples are not matched by collection time or full target roster. Do not infer a coverage, latency or reliability winner. Preservation means matching the provider response, not independent verification against the original post. Repetitions do not establish unique-post sample size.

TwitterAPI.io pilot cost was user-reported as 600 credits ($0.006 at the user's recharge rate), not independently reconciled billing. Apify profile follow-up reports $0.005 per 20-record run; search billing evidence is retained separately. These are historical sample costs, not current price guarantees.

Remaining checkpoints: independent post-text verification; nested quote/repost semantics; matching time windows and query filters; provider identity (the reused TwitterAPI.io compatibility normalizer still labels source.provider as apify); production retention/edit/deletion handling. No provider recommendation or legal clearance follows from these checks.

Proposed expanded comparison remains 6 public profiles and 4 searches, up to 10 evaluated items per target per provider. Provider page sizes may exceed the evaluation cap and affect billing; verify that before dispatch. Existing legal-only instruction and unresolved provider-terms review remain recorded in X_TERMS_TEST_SCOPE.md. No new expanded campaign was launched.

Evidence: twitterapi-io-pilot-001/replay.txt; x-profile-pilot/after-fix-checks.json; x-profile-pilot/billing-followup.json; x-search-pilot/checkpoints.json; x-search-pilot/billing-verification.txt.
