# Distilled.news — target plan v1.3

**Reviewed:** 2026-09-20  
**Purpose:** Plan the product we are building toward; this is not a completion report or a snapshot of the current backend.

## Read the documents

1. [Architecture baseline](ARCHITECTURE_BASELINE_v1.3.md)
2. [Technical contracts and service boundaries](TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.3.md)
3. [Implementation plan](IMPLEMENTATION_PLAN_v1.3.md)
4. [Acquisition benchmark runbook](ACQUISITION_BENCHMARK_RUNBOOK_v1.3.md)
5. [Review and change log](REVIEW_AND_CHANGELOG_v1.3.md)

The four original v1.2 files in Downloads are untouched. This set supersedes them as the reconciled planning draft. Detailed intelligence contracts and evaluation milestones are retained; absence from today's code is not a reason to remove a target requirement.

## Decision provenance

| Status | Meaning |
|---|---|
| Confirmed direction | Explicit user requests in this conversation and the supplied project direction: Cloudflare-first/self-hostable; public accounts and multiple public feeds; username-scoped URLs; stars/explore; Telegram, RSS, Google News, X, LinkedIn and optional Apify; basic retained published-feed search; no chatbot; preserve the existing visual identity; centered landing; feed-inspired pencil sketches. The VPS is for testing APIs and scrapers. |
| Retained target | Requirements carried forward from the supplied v1.2 plan: incremental events/storylines, evidence roles, three reuse layers, bounded discovery/synthesis, resource controls, evaluation, installable PWA and opt-in Web Push. They remain planned even if not implemented. |
| Proposed implementation | Specific schemas, routes for new services, thresholds, quota values, model/provider choices and migration sequencing. These are engineering proposals, not claims of a separate user agreement. |
| Open decision | A choice requiring product input or measured evidence. It is explicitly marked rather than silently inferred from the code. |

This review can reconcile the supplied documents and the conversation available here. It cannot certify agreements from other conversations that were not provided. No infrastructure was provisioned, no providers were purchased, and no implementation milestone is marked complete by this review.

## Conflict rules

- Explicit user decisions take priority over documents. A document's “frozen” wording does not prevent a requested revision.
- Confirmed product direction takes priority over conflicting v1.2 deployment or private-product assumptions.
- Preserve non-conflicting v1.2 ambitions; do not replace them with current implementation limitations.
- Architecture owns product scope; contracts own object/API semantics; the implementation plan owns dependency order; the runbook owns experiments. Change all affected documents together.
- Public publication does not make passwords, emails, raw payloads, feed prompts, provider credentials, notification subscriptions or internal decision traces public.

## Open decisions retained honestly

- Release sequencing of the retained 30-minute cadence alongside hourly/daily/weekly. It remains in the target plan, including temporal reasoning tests; current code is not a reason to delete it.
- Exact active-news, raw-evidence, historical-storyline, edition-provenance and benchmark retention periods. The current 15-day setting is a migration input, not a universal target retention contract.
- Image provider, automatic-first-cover versus explicit generation, refresh policy, and image budget. The previous implementation's Workers AI/FLUX choice and five-attempt limit are starting proposals, not frozen product decisions.
- Which website fallback/discovery providers win, whether Telethon materially improves Telegram coverage, and whether any external acquisition runtime is justified.
- Quantitative quality/latency/cost gates, final reference workload, and supported-browser delivery results. The inherited $400–500/month at 1,000 users remains a hypothesis.
- Saved-story/Library UI beyond the established Home, Explore and Settings navigation. Keep the capability as a retained target without forcing an additional top-level tab.

## Wrangler authorization in the supplied screenshot

The green shield identifies an application owned and managed by Cloudflare. Select the account intended to own this deployment; **Edit** changes the account selection. **Edit Permissions** controls optional scopes. Required scopes remain selected. The screenshot's collapsed groups do not identify every requested permission, so this review does not certify all 28 as necessary.

For the planned deployment, review permissions covering Workers, D1, R2, Queues, and the AI services actually enabled; include route/domain access when attaching the production domain. Email onboarding may require separate account configuration. Unused products do not need access merely because Wrangler requests them. An OAuth login can authenticate local Wrangler without a separate `CLOUDFLARE_API_TOKEN`; automation or provider-specific calls may still need scoped tokens. Successful login does not create resources or validate OpenAI/Apify/email setup.

Sources checked on 2026-09-20: [Cloudflare OAuth authorization](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/), [optional Wrangler scopes](https://developers.cloudflare.com/changelog/post/2026-08-22-wrangler-mcp-optional-oauth-scopes/), [Wrangler login](https://developers.cloudflare.com/workers/wrangler/commands/general/). Installed Wrangler was 4.100.0 at review time; newer documented CLI options must be checked against installed help before use.
