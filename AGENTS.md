# LowNoise.news Project Blueprint

This repository should be guided by the following product and implementation plan. Treat it as project direction, not as already implemented behavior.

## Summary

Build LowNoise.news as a Cloudflare-first, self-hostable Telegram newsroom. V1 lets one admin add public Telegram channel URLs, filter noisy incoming posts, generate neutral summaries, and publish a calm monospace personal briefing. A Telegram bot webhook remains as an optional fallback for private channels/groups where the admin can add the bot.

Use `lownoise.news` as the project and brand domain. Reserve `app.lownoise.news` and `api.lownoise.news` for the future hosted SaaS.

## Key Direction

- Keep Cloudflare as the only supported V1 deployment target.
- Use Workers for the API, Telegram webhooks, and public feed.
- Use Queues for async ingestion and LLM processing.
- Use D1 for app data.
- Use R2 for raw Telegram payload archives.
- Use Vectorize to index published briefing items when embeddings are configured. Keep V1 clustering rule-first and deterministic.
- Use AI Gateway routing to OpenAI.

Use a monorepo layout:

- `apps/web`: minimal admin UI and public feed.
- `apps/worker`: Cloudflare Worker routes, scheduled public-source refresh, and queue consumers.
- `packages/core`: clustering, relevance filtering, update merging, and prompts.
- `packages/connectors`: Telegram connector.

V1 is single-admin and self-hosted, but schema and code should be tenant-ready for later hosted LowNoise accounts.

LowNoise is primarily a filter. Summarization, clustering, source evidence, and publishing all serve filtering. The user's interest profile is a core input, not an advanced feature. Do not introduce a chatbot or open-ended Q&A surface in V1.

## Product And UI Requirements

Brand/name:

- Product name: LowNoise.news.
- UI copy should use LowNoise sparingly and avoid marketing language inside the app.

Visual style:

- Fixed-width font everywhere.
- Sparse black, white, and gray interface.
- No dashboards full of metrics, charts, badges, or loud alerts.
- No gradients, decorative visuals, engagement counters, or "breaking news" styling.

Public feed:

- A simple vertical news line.
- Each item shows timestamp and a short summary.
- Do not show confidence scores, engagement counts, or source-count badges in the default feed.
- Each item has a quiet expand control that shows where the item was mentioned.
- Expanded evidence must include source/channel names, timestamps, attached media links when present, and direct pressable links to the original messages or source pages when available.
- Provide a top-level live refresh control.
- Provide direct search over retained published briefing items and their evidence, for queries such as `trump statement`.
- Search must not query raw unpublished messages, expired context, or external sources.

Admin setup:

- One page only.
- Add public Telegram channel URL.
- Telegram bot token/webhook status in a collapsed private-source fallback section.
- Interest profile, written as a simple plain-language instruction.
- Style instruction, if needed, secondary to the interest profile.
- Public feed on/off.
- Save.
- Setup health showing bot token validity, webhook registration, last Telegram event received, and queue/processing status.
- Advanced rules are collapsed behind one advanced control.
- Do not require admins to maintain a formal source registry or source-independence metadata in V1.

Mental-distress reduction:

- Suppress weak or uncorroborated claims by default.
- Avoid political framing labels unless the admin explicitly asks for them.
- Prefer fewer published items over noisy completeness.
- Do not miss important, legitimate events that match the configured interest profile and available sources.

## Implementation Details

Public Telegram ingestion:

- Admin enters public channel URLs such as `https://t.me/LebUpdate`.
- Worker fetches the public `https://t.me/s/<channel>` page, archives the fetched HTML to R2, normalizes supported posts, stores them in D1, and enqueues processing.
- Scheduled refresh runs enabled public sources every few minutes.
- V1 supports public Telegram channel post text, links, and media references when available from the public page.

Private Telegram bot fallback:

- Admin creates a Telegram bot and adds it to private channels/groups when public URLs are not enough.
- Dashboard registers webhook to the deployed Worker.
- Worker validates the webhook secret, archives raw payload to R2, normalizes supported messages, stores them in D1, and enqueues processing only for enabled sources.
- Bot fallback supports text, captions, links, and channel/group posts.

Processing:

- Extract candidate facts/events from normalized messages.
- Cluster similar items with embeddings.
- Filter clusters by interest-profile relevance, recency, evidence support, duplicate suppression, and low-noise rules.
- Allow trusted single-source items in narrow cases, but do not expose a confidence score.
- Publish only clusters that pass default low-noise rules.
- Summaries must be generated only from accepted cluster evidence.
- Repeated updates should merge into an existing briefing item instead of creating unnecessary new feed items.
- Expanded item views should show the evidence history for merged updates.
- Retain active news and media context for 15 days by default, then expire it from the active knowledge base.

No chatbot:

- V1 must not include general news chat, Telegram chat replies, or public Q&A.
- Future clarification features, if ever added, must stay evidence-bound and must not encourage exploratory news consumption.

Public/API routes:

- `POST /telegram/webhook/:briefingId/:secret`
- `POST /api/admin/telegram/register-webhook`
- `GET /api/admin/briefings`
- `POST /api/admin/briefings`
- `GET /api/admin/sources`
- `POST /api/admin/sources`
- `POST /api/admin/sources/refresh`
- `DELETE /api/admin/sources/:sourceId`
- `GET /api/admin/health`
- `GET /api/feed/:briefingSlug`
- `GET /api/feed/:briefingSlug/search`

Open-source adoption:

- Prioritize one-command deployment and example configuration.
- Provide a no-login hosted demo or playground where visitors can tune interest/source-like inputs in the browser and immediately see how LowNoise filters a sample news stream.
- The demo should create the quick validation effect: someone can press a link, try the concept instantly, and understand why they would self-host it.
- The main public website may point primarily to GitHub unless a hosted SaaS is intentionally introduced later.

## Test Plan

Unit tests:

- Telegram payload normalization.
- Public Telegram channel URL and page normalization.
- Publication rule evaluation.
- Interest-profile relevance filtering.
- Duplicate detection.
- Repeated-update merging.
- Context retention and expiry.

Integration tests:

- Telegram webhook to queue to published item.
- Public feed exposes only published items.
- Expanded detail view shows linked evidence and media links.
- Feed search returns matching retained published briefing items and evidence without searching raw unpublished messages or expired context.
- Admin health reports webhook and processing status.

UI acceptance:

- Admin setup fits on one page.
- Feed has very few visible controls.
- Expand evidence is accessible by pointer and keyboard.
- Live refresh and direct search are available without making the feed feel like a dashboard.
- No-login demo gives immediate validation from sample/tunable inputs.
- Fixed-width font is used across public and admin surfaces.

## Assumptions

- V1 supports Cloudflare only; no VPS or Docker deployment path yet.
- V1 supports Telegram channels/groups only.
- OpenAI through Cloudflare AI Gateway is the default model path.
- `lownoise.news` is the project domain; self-hosters can use their own domain or Workers URL.
- Hosted SaaS is planned later under `app.lownoise.news`, but signup, billing, and multi-user management are out of scope for V1.
