# Distilled.news Project Blueprint

This repository should be guided by the following product and implementation plan. Treat it as project direction, not as already implemented behavior.

## Summary

Build Distilled.news as a Cloudflare-first, self-hostable Telegram newsroom. V1 lets one admin create one or more briefings, add public Telegram channel URLs, filter noisy incoming posts, generate neutral summaries, and publish a calm monospace personal briefing.

Use `distilled.news` as the project and brand domain. Reserve `app.distilled.news` and `api.distilled.news` for the future hosted SaaS. Keep `lownoise.news` only as a legacy redirect to `https://distilled.news`.

## Key Direction

- Keep Cloudflare as the only supported V1 deployment target.
- Use Workers for the API, scheduled source refresh, and public feed.
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

V1 is single-admin and self-hosted, but schema and code should be tenant-ready for later hosted Distilled accounts.

Distilled is primarily a filter. Summarization, clustering, source evidence, and publishing all serve filtering. The user's interest profile is a core input, not an advanced feature. Do not introduce a chatbot or open-ended Q&A surface in V1.

## Product And UI Requirements

Brand/name:

- Product name: Distilled.news.
- UI copy should use Distilled sparingly and avoid marketing language inside the app.

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
- Support multiple briefings from the same admin surface.
- Add public Telegram channel URL.
- Interest profile, written as a simple plain-language instruction.
- Style instruction, if needed, secondary to the interest profile.
- Feed language toggle for English or Arabic.
- Public feed on/off.
- Pause/resume feed.
- Save.
- Setup health showing last Telegram event received and queue/processing status.
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

Processing:

- Extract candidate facts/events from normalized messages.
- Cluster similar items with embeddings.
- Filter clusters by interest-profile relevance, recency, evidence support, duplicate suppression, and default distillation rules.
- Allow trusted single-source items in narrow cases, but do not expose a confidence score.
- Publish only clusters that pass default distillation rules.
- Summaries must be generated only from accepted cluster evidence.
- Repeated updates should merge into an existing briefing item instead of creating unnecessary new feed items.
- Expanded item views should show the evidence history for merged updates.
- Retain active news and media context for 15 days by default, then expire it from the active knowledge base.

No chatbot:

- V1 must not include general news chat, Telegram chat replies, or public Q&A.
- Future clarification features, if ever added, must stay evidence-bound and must not encourage exploratory news consumption.

Public/API routes:

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
- The main public website may point primarily to GitHub unless a hosted SaaS is intentionally introduced later.

## Test Plan

Unit tests:

- Public Telegram channel URL and page normalization.
- Publication rule evaluation.
- Interest-profile relevance filtering.
- Duplicate detection.
- Repeated-update merging.
- Context retention and expiry.

Integration tests:

- Public Telegram channel fetch to queue to published item.
- Public feed exposes only published items.
- Expanded detail view shows linked evidence and media links.
- Feed search returns matching retained published briefing items and evidence without searching raw unpublished messages or expired context.
- Admin health reports processing status per briefing.

UI acceptance:

- Admin setup fits on one page.
- Feed has very few visible controls.
- Expand evidence is accessible by pointer and keyboard.
- Live refresh and direct search are available without making the feed feel like a dashboard.
- Fixed-width font is used across public and admin surfaces.

## Assumptions

- V1 supports Cloudflare only; no VPS or Docker deployment path yet.
- V1 supports Telegram channels/groups only.
- OpenAI through Cloudflare AI Gateway is the default model path.
- `distilled.news` is the project domain; self-hosters can use their own domain or Workers URL.
- `lownoise.news` is a legacy redirect domain and should not be used as the primary app domain.
- Hosted SaaS is planned later under `app.distilled.news`, but signup, billing, and multi-user management are out of scope for V1.
