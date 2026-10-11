# QA paid-source allowance — October 11

The user authorized **USD 15 per approved source**, replacing the earlier USD 10 allowance and the deployed zero-provider configuration. The target is the existing sources QA Worker on `backend-full-stack-october-11`.

## Spending behavior

- `SOURCE_PER_SOURCE_BUDGET_USD=15` is a durable, cumulative cap for each `(feedId, feedSourceId)`. It is not a daily refill. The same approved source shares this cap across all paid primary and fallback providers; another approved source gets its own allowance.
- Existing conservative reservations are retained, including attributable historical operations. Legacy uncertain operations with no scope identity are conservatively held against each newly initialized source allowance. New uncertain operations retain their source identity from insertion onward.
- Reservations bound possible charges; they are not provider invoice totals. Cached replay does not create another provider request or reservation. Concurrent requests cannot exceed the source cap.
- Provider-wide rows remain aggregate admission/accounting guards. Positive `SOURCE_PROVIDER_BUDGETS_JSON` entries enable the paid path; their aggregate limits retain historical reservations and add headroom for the approved active sources. The separate `source:` rows enforce the USD 15 source cap. Do not reset `reserved_usd` to enable paid access.
- Per-operation ceilings: TwitterAPI.io USD 0.10; Apify USD 0.25; Zyte USD 0.03. Apify's submitted maximum charge is bounded by its operation ceiling.
- Free collection remains free when successful. Paid fallbacks run when the provider order requires them; paid usage is not forced merely to consume the allowance.

No schema migration or credential rotation is required. The source ledger uses namespaced rows in the existing `connector_provider_budgets` table, and source identity metadata in existing operation headers.

This change concerns collection spend. Automatic Cron polling and real-model synthesis retain their existing settings; it does not resolve the frontend's new-pipeline Brief now action or prove a published edition.

## Validation

Real D1 tests cover shared fallback limits, independent sources, replay, concurrent admission, uncertain outcomes, legacy usage import, and non-resetting budget configuration. Connector regressions and Worker/connector typechecks are also run. Deployment and the bounded live X check are recorded below when completed.
