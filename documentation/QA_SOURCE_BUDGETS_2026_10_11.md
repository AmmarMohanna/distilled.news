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

For the later manual briefing and scheduled collection rollout, see [QA_BRIEF_NOW_2026_10_11.md](QA_BRIEF_NOW_2026_10_11.md). The settings in this paragraph describe the budget-only deployment.

This change concerns collection spend. Automatic Cron polling and real-model synthesis retain their existing settings; it does not resolve the frontend's new-pipeline Brief now action or prove a published edition.

## Validation

- Targeted Worker tests: 54/54 passed across the source budget, connector runtime, source backend and sources QA suites.
- Complete connector suite: 198/198 passed. Worker and connector typechecks passed. Exact QA deployment dry-run passed. The full Worker suite was not rerun for this change.
- Deployed code commit: `ba07a1a5ad9458bf4b233d73ae619607534d83d0` on `backend-full-stack-october-11`.
- Live Worker version: `e884d906-d1ee-4c9b-ba85-cfcc3724db07`, replacing `5b1489dd-212f-4ad1-8b44-a57039131315`. The live version metadata confirms the USD 15 source cap, positive operation ceilings and all three existing provider secret bindings.
- The user's approved `https://x.com/ecb` source on `ECB rates and inflation` completed one TwitterAPI.io request: HTTP 200, `HANDED_OFF`, 20 observations and 20 proposals. This proves paid collection and intake, not publication or topical accuracy.
- The exact same probe replay returned the same 20 observations. Remote D1 comparison confirmed unchanged paid-operation counts and unchanged reservations across all providers and the source counter. TwitterAPI.io remained at 13 historical operations and USD 1.10 reserved; the ECB source row remained at limit USD 15 and reserved USD 0.10. These are ceilings, not invoiced charges.
- QA root still returned HTTP 200. Existing frontend assets and credentials were retained; no migrations were applied. `backend-sources-fixes` remains at its pre-merge commit `b38e2effaee82743624ac27122ee5a58d3622abc`.

Private probe JSON, replay comparisons and live version metadata are retained in ignored `.review-tmp/`. No tokens or source payloads are committed.
