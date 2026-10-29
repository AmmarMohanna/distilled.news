# Distilled.news Project Notes

The current implementation is the product direction unless the user gives newer instructions. Historical V1/V2 architecture proposals and completed integration plans are not instructions to rebuild or replace the current pipeline.

## Current product

- Distilled.news is a Cloudflare-first, self-hostable briefing product.
- Feeds support Public and Private visibility. Public is the default for new feeds. Public feeds use username-scoped URLs. Private feeds are owner-only and must not appear in public reads, Explore, search or share routes. Enforce visibility in the backend, including artwork and edition reads.
- The app supports public accounts, multiple feeds, stars/Explore, unread catch-up summaries, PWA notifications and Telegram, RSS, Google News, X, LinkedIn and Apify-backed sources. Availability depends on each deployment's configured providers and credentials.
- Search is basic retained published-feed search. Do not add or assume Vectorize.
- Cloudflare Workers, D1, R2, Queues, configurable email transport, AI Gateway and optional Apify remain the runtime stack. Check the actual target configuration; staging currently uses Outlook Graph mail.
- `distilled.news` is the canonical production domain; `lownoise.news` is a legacy redirect.
- There is intentionally no chatbot or open-ended public Q&A surface.

## V3 intelligence and publication

- V3 is integrated. Its workflow is editor -> verifier -> targeted repair when needed -> durable publication. Deployment selection is explicit through `BRIEFING_ENGINE`; preserve retained legacy work rather than silently rerouting it.
- V3 does not require V2 deterministic claim extraction, Event graphs or reconciliation. Do not reintroduce them as prerequisites.
- Preserve full retained source evidence, source identities, citations, attribution, uncertainty, corrections and published reader memory. Known information and information already communicated to readers are distinct.
- Preserve the existing concise news style. Do not add routine source-publication commentary, descriptions of missing details or speculative connections inferred from a feed's interests.
- Source-relative dates use source publication context; reader-facing relative dates use the briefing cutoff. Publication timestamps do not establish when a reported event occurred.
- Current staging uses GPT-4.1 editing/repair and GPT-4.1 mini verification through OpenRouter. Inspect actual configuration before changes; historical model experiments do not authorize routing changes.
- Preserve reservations, settlements, uncertain outcomes, immutable operation identities, leases, fencing, retries and recovery. Do not duplicate paid operations or rewrite historical financial records.
- Retain factual regression evidence. Valid JSON, passing tests and persisted output do not independently establish factual accuracy.

## Scheduling and database behavior

- Preserve persisted scheduling policies. Existing clock-anchor and creation-relative feeds, pending jobs, window identities and financial operations must not be reinterpreted when introducing a newer policy.
- Newly opted-in feeds use `clock-aligned-delivery-v1`. Subdaily schedules align to configured local clock boundaries, with a ten-minute creation admission rule. Daily feeds retain the selected local delivery time and timezone/DST handling. See `apps/worker/src/v1-intelligence/schedule.ts` and its tests for exact boundaries.
- Under the clock policy, the evidence cutoff is five minutes before intended delivery. Keep reporting-window boundaries, `scheduledFor` and actual `publishedAt` distinct. Reader labels use intended delivery time; they are not promises of instantaneous publication.
- Preserve consecutive, non-overlapping evidence windows, creation-time precision, freshness/backlog handling, chronological recovery and successful verified-result reuse.
- Routine database work should depend on new or unresolved work rather than repeatedly loading all retained history. Preserve selective reads, supporting indexes and bounded maintenance. Older corrections and recoverable operations still need explicit lookup paths.

## Frontend and integration preservation

- Preserve the integrated frontend as implemented: responsive Home/Explore grids, feed reader layout and controls, custom menus, artwork, branding, translations, Arabic/RTL behavior, accessibility, Public/Private controls and archived/paused-feed behavior.
- Preserve Unicode username normalization and aliases, localized authentication mail, PWA installation assets, inline offline SVG, saved offline language, foreground feed refresh and catch-up summary behavior.
- Do not restore obsolete UI or change product behavior merely to satisfy outdated test expectations. Check the current implementation and applicable preservation evidence first.
- Review the integration reports in `docs/` and preservation handoff/inventory documents in `documentation/` for additional context; older intermediate baselines do not override later integrated behavior or newer user instructions.
- Resolve shared changes by feature and inspect automatic merges. Preserve source recovery, partial/listing evidence distinctions and uncertain-operation fences alongside frontend work.
- Preserve unrelated uncommitted work. Do not overwrite another worktree or branch as part of an integration.

## Deployment and review

- Prioritize operational safety, deployability, source ingestion correctness, retention and honest health reporting.
- Inspect the exact deployment target, resources, bindings, secrets, variables and migrations before running Wrangler. Default configuration is not automatically the intended target. Keep staging, QA and production resources separate.
- A merge or passing test does not authorize deployment, paid inference or reader notifications. Follow the user's applicable authorization and budget; never infer fresh spending permission from historical trials.
- Staging Google collection uses `SOURCE_GOOGLE_RESOLUTION_ENABLED=true` to enable the existing private Google route. Source assessment has a separate transport path; do not assume enabling collection also fixes assessment or proves helper availability.
- Keep self-hosting practical: generated secrets, clear Cloudflare checks, remote migration instructions and current API routes.
- Report local tests, live checks, paid evaluations and actual publication separately. Fix confirmed defects without restoring retired features or weakening factual, privacy or recovery safeguards.
