# Distilled.news Project Notes

The old V1 blueprint has been retired. Treat the current implementation as the product direction unless the user gives newer instructions.

For the newly agreed v1 parallel implementation, use `documentation/ARCHITECTURE_v1.md`
(Appendix C is normative), `documentation/PARALLEL_IMPLEMENTATION_AGREEMENT.md`, and
`packages/contracts`. They supersede conflicting historical architecture proposals.
The production paths have not yet been migrated; preserve existing behavior until an
explicit integration change switches a source. Coordinate shared contract changes.

## Current Direction

- Distilled.news is a Cloudflare-first, self-hostable public briefing product.
- Published feeds are public by design and use username-scoped URLs.
- The app supports public accounts, multiple feeds, stars/explore, Telegram, RSS, Google News, X, LinkedIn, and Apify-backed sources.
- Search is basic retained published-feed search. Do not add or assume Vectorize unless explicitly requested later.
- Cloudflare Workers, D1, R2, Queues, Email Service, AI Gateway, and optional Apify remain the deployment/runtime stack.
- `distilled.news` is the canonical production domain. `lownoise.news` remains a legacy redirect.
- There is intentionally no chatbot or open-ended public Q&A surface.

## Review Bias

- Prioritize operational safety, deployability, source ingestion correctness, data retention, and honest admin health reporting.
- Keep onboarding practical for self-hosters: generated secrets, clear Cloudflare resource checks, remote migration instructions, and current API routes.
- Avoid reintroducing private-feed toggles, Vectorize claims, or the discarded V1-only scope constraints.
