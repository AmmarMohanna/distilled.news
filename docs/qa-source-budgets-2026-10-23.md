# QA source acquisition allowances

At the user's explicit request, all configured QA source acquisition provider
allowances are USD 15: `x_twitterapi_io`, `x_apify`, `google_apify`,
`linkedin_apify` and `zyte`. Both environment configuration and persisted D1
provider grants were updated; deployment alone would have preserved the old zero
database grants because collector initialization deliberately retains existing grants.

The source/provider cap and shared daily collector cap are each USD 15. The daily
budget uses Asia/Beirut. This is a shared USD 15 daily ceiling across the providers,
not a promise of USD 15 additional spending for every source on the same day.

Per-request reservation ceilings are positive: TwitterAPI.io USD 0.01, Apify USD
0.25 and Zyte USD 0.05. These remain smaller than the allowances so that a single
request does not reserve the entire USD 15 budget. No acquisition provider
allowance or operation ceiling in this deployment is zero or null.

Existing provider/source reservations were retained. The new daily ledger was
seeded conservatively with the existing aggregate provider reservations
(USD 3.700012 at the change), rather than resetting spent/reserved exposure.
Historical operations, unresolved paid outcomes and retry fences were not removed.
No provider requests or paid evaluation were launched to verify this setting.

Validation checks compared all five D1 allowances to 15, all three operation
ceilings to positive values, and both scalar caps to 15. The QA build passed.
Deployment verification must compare the live settings against the expected
budget changes while preserving all other bindings, variables and secrets.
Production and Joud's dedicated deployment are outside this change.

Deployed QA version: `5803216a-9a63-42db-b157-0f6f14757e6e`, serving 100%.
Post-deployment verification matched the expected budget changes and preserved
all unrelated settings/resource bindings/secrets. Frontend assets matched the
existing build; session and explore APIs returned HTTP 200 JSON.
The final audit found no zero/null active acquisition budget or request ceiling,
and every persisted provider allowance matched the configured USD 15.
