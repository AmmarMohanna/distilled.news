# Joud deployment

This separate deployment uses `apps/worker/wrangler.joud.jsonc` in account
`e32b564514d4f9b9e383b7dd30dbb026`. It does not change the legacy, staging, or
sources QA Workers. Its database, processing queues, and R2 buckets are dedicated
to `distilled-news-joud`.

URL: https://distilled-news-joud.distillednews-platform.workers.dev

From the repository root:

```powershell
corepack pnpm --filter @distilled/web build
corepack pnpm --filter @distilled/worker exec wrangler deploy --config wrangler.joud.jsonc
```

For future database migrations:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler d1 migrations apply DB --remote --config wrangler.joud.jsonc
```

Independent session, setup, and maintenance secrets are saved in the ignored
`apps/worker/.dev.vars.joud` file. They were uploaded during initial deployment.
Keep that file private. Use its `ADMIN_SETUP_TOKEN` for first administrator setup.

AI source recommendations are enabled using the server-side `OPENROUTER_API_KEY`
secret. The key is also stored in the ignored `.dev.vars.joud` file. Recommendations
make one capped model call per click, with up to five public source suggestions;
if fewer than two distinct publishers pass verification, one fallback call
looks for additional exact-topic sources and verifies them independently. No more than two recommendation calls run per click.
Candidate discovery and assessment check up to five sources concurrently.
Each candidate starts assessment as soon as it resolves; a slow publisher does
not hold up checks of ready feeds or Google News. Google connection failures and
timeouts exclude Google from the replacement round, just like provider outages.
Verification reuses bounded publisher responses within the request instead of
fetching every feed twice. Recommendations have a 20-second total network budget
and an 8-second per-call limit, including response bodies; timed-out or
inconclusive candidates are never returned as verified. These are limits, not
measured production latency guarantees.
Joud sets `SOURCE_RECOMMENDATIONS_GOOGLE_NEWS=false` because Google News
blocks this deployment's automated requests. This excludes Google from discovery;
it does not silently migrate or remove existing approved Google News sources.
Other deployments retain the default Google suggestion behavior unless disabled.

Discovery starts from a small publisher/feed capability catalog; every candidate
still requires a real HTTP response and independent exact-topic verification.
For narrow topics, publisher-provided WordPress search RSS feeds are used when
supported. Their articles, not a query echoed in a feed title, must establish the
actual requested topic and geography. Broader industry coverage is rejected.
`SOURCE_RECOMMENDATIONS_WEB_SEARCH=true` permits one fallback OpenRouter web
search, capped to one Exa fast search and five results per request. This uses the
existing OpenRouter credits; it does not authorize paid Apify/Zyte collection.
Model proposals and catalog entries are never source approval.
Recommendations prioritize topic-specific feeds; every replacement still requires
readable, relevant evidence before it can be selected.
Discovery accepts publisher-advertised same-origin HTTPS RSS anchors as well as
RSS/Atom alternate links. When an RSS URL is dead or blocked by redirect policy,
recommendations may inspect up to two publisher homepages for a working advertised
feed, which must then pass assessment. Redirect and cross-origin fetch restrictions
remain unchanged; this does not bypass publisher access blocks or relevance checks.
Model-proposed direct RSS paths now undergo bounded fetch/parse preflight before
recommendation results are assessed; invalid paths are omitted or resolved from
publisher-advertised feeds. Confirmed Google automated-traffic blocks are reported
explicitly without an immediate retry. The unpaid Cloudflare diagnostic and a
proposed one-run Apify alternative are documented in
`GOOGLE_NEWS_ALTERNATIVE_REVIEW.md`; that proposal does not enable paid collection.
each user can request AI source recommendations three times per rolling five-hour window. Each click makes one
OpenRouter request with at most 400 output tokens per recommendation call. These direct recommendation
calls are separate from the one-time briefing model allowance described below. Website source rows use
publisher favicons, with a globe fallback when an image cannot load.

The mixed-source backend branch is integrated without frontend-specific backend logic changes.
Product feeds, downstream processing, stored-evidence synthesis through OpenRouter,
and minute-based maintenance are enabled on Joud with explicit owner approval.
Source-provider budgets remain zero. Paid X/LinkedIn collection therefore remains
unavailable until separately authorized and configured. There is no private source
execution service binding or browser container on Joud; sources requiring those
services fail explicitly rather than appearing to collect successfully.
RSS-backed websites can be approved through the backend discovery path.
Selected enabled sources are read back from the backend and displayed with logos
on the owner feed page; public source availability and blocker messages remain
provided by the imported backend. Generated artwork uses the existing image setup.
Existing account data and feeds are not copied from other deployments.

Source recommendations use the deployment's available collectors. On Joud these
are RSS/Atom. The Google News collector remains configured for existing sources,
but its public endpoint is blocking this deployment and is excluded from new
recommendations. Suggested websites are retained only when
they resolve to an advertised RSS feed; Telegram, X, LinkedIn, and websites without
RSS remain unavailable until their collection services are configured. With `SOURCE_ASSESSMENT_ENABLED=true`,
suggestions and manually entered sources must pass assessment before selection,
and the server repeats assessment before saving or enabling a source. Technical
checks use the existing public HTTPS fetch policy (no credentials, IP literals,
custom ports, redirects, or oversized responses) and the deployment's
`global_fetch_strictly_public` runtime protection. Website discovery may resolve
an advertised same-origin feed. Joud configures `SOURCE_ASSESSMENT_MODEL` as
`openai/gpt-4.1-mini` to assess fetched public text using OpenRouter's standard
chat completions API and the existing key. Recommendation and save-time checks
use the same assessment implementation. Deployments without that setting retain
the native OpenRouter Decisions API using `DISTILLED_JEV_MODEL`.
The standard-model path uses strict structured outputs for real-world interest,
exact-topic relevance and suspicious content. It can cite only IDs of actual
fetched article passages. The server supplies the displayed excerpt from that
article; the model cannot manufacture the quote. Up to 20 title-ranked feed items
and targeted excerpts fit within the existing evidence size cap. Feed/channel
metadata and reflected search queries cannot serve as article citations.
Feeds with dated articles exclusively older than one year are not recommended
as active news sources; missing publication dates are not invented.
Malformed, inconclusive and unavailable-provider results
cannot approve a source. Thresholds are conservative policy settings, not a
measured accuracy or publisher-trust guarantee. Sources needing unavailable
collection services display a setup blocker; no paid source collection is started.
Existing feeds continue collecting without automatic source removal. Assessment
model calls, like recommendation calls, are separate from the one-time briefing
allowance; manually checking or saving a source can incur a small OpenRouter cost.

Source connector admission requires `SOURCE_CONNECTORS_ENABLED=true` in addition
to the downstream switch and Cron. Google News publisher resolution is enabled.
Bare publisher names are stored as Google News topic searches, not publisher-only
subscriptions; the Google logo represents that configured search source.

On 2026-10-16 the owner approved one nonrenewing model allowance: $1 total
exposure, one concurrent operation, and only `openai/gpt-4.1-mini`. It expires
on 2026-10-17 at 06:56:23.954 UTC (09:56 Beirut). The authorization was applied
using the existing guarded `authorizeModelSpending` operation; backend logic and
paid source-provider budgets are unchanged. Deployment does not recreate or
renew the allowance. An API key alone does not supply model spending authority.

The briefing reader uses viewport-sized story pages and compact overview pages
on smaller screens. Full stories and source diagnostics open in dialogs.

Feed illustrations use Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`
through the existing `CLOUDFLARE_IMAGE_ACCOUNT_ID` and
`CLOUDFLARE_IMAGE_API_TOKEN` secrets. The request is multipart form data with a
1024-by-1024 canvas and seed 42, matching the tested settings. Klein has a fixed
four-step inference process; no `steps` parameter is sent. Generation has a
90-second timeout within the illustration job's two-minute lease.

Automatic diagnostic storage maintenance is enabled and runs before source
scheduling on each minute Cron. See [storage operations](STORAGE_OPERATIONS.md)
for retention classes, archive verification, health routes, recovery and the
remaining single-database scaling boundary. Published evidence and paid-call
identities are not expired by diagnostic cleanup.
Illustrations use the dedicated `distilled-news-joud-images` queue, capped at
two concurrent consumers, so source-processing backlogs cannot starve images.
The existing job lease and R2 existence checks fence duplicate deliveries;
deployments without `IMAGE_QUEUE` keep their existing processing queue.

The image prompt uses only the user's full interest profile (the “What would you
like to follow” field), rather than the feed title. It requests a monochromatic
`#5E5CE6` colored-pencil sketch with natural, slightly irregular strokes, fine
pigment grain, subtle pressure variation, and thin-to-medium lines. The model
chooses a recognizable subject from the interest. Existing saved JPEGs remain
unchanged, including illustrations created before this model change; this does
not automatically regenerate earlier blank images.


## Briefing starter configuration ? October 22, 2026

Owner requested configuration consistent with the merged friends? implementation.
Joud now selects V3, GPT-4.1 editing/repair and GPT-4.1 mini verification.
A guarded, nonrenewing model authorization allows $1 total exposure and one
concurrent model operation from 2026-10-22T17:41:25.909Z through
2026-10-23T17:41:25.909Z (20:41 Beirut on both dates). Both model IDs are allowed.
No tracking-only exception was enabled. Existing reservations and grants remain intact.
The separate legacy V3 runtime has a $1 rolling-24-hour ceiling and $0.50 per-run
ceiling; canonical product V3 uses the account authorization ledger. These guards
are independent, not one combined cap across every possible path. Source collection
retains its separate $5/day budget. Started V2 requests retain their frozen engine.
Allowance activation does not guarantee publication: source coverage, due windows,
provider availability and recoverable existing work still apply.

## Joud source/briefing queue integration (October 23, 2026)

The Joud manifest now enables full-article acquisition preference and the indexed
source scheduling pipeline, with isolated collection, acquisition and intelligence
queues. Existing Joud resources, native runtime, artwork queue, V3 models and the
$5/day collector cap are preserved. Queue activation does not renew account model
authorizations or guarantee publication.

Before deploying, authenticate Wrangler and provision these dedicated queues
(skip creation for queues already present). Run from `apps/worker`:

```powershell
node node_modules/wrangler/bin/wrangler.js login
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-collection
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-collection-dlq
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-acquisition
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-acquisition-dlq
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-v1
node node_modules/wrangler/bin/wrangler.js queues create distilled-news-joud-v1-dlq
node node_modules/wrangler/bin/wrangler.js d1 migrations list DB --remote --config wrangler.joud.jsonc
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config wrangler.joud.jsonc
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.joud.jsonc
```

Build the frontend with the repository build workflow before deployment if its
source changed. The source scheduling control producer uses the existing Joud
processing queue; expensive collection runs on its dedicated queue. All new queues
have consumers in the same manifest. Do not bind QA queues or databases to Joud.

Local Worker dry-run validates packaging and configuration only. Remote queue
existence, migration state, account model authorization and successful live
publication must be checked separately. On October 23 the local Wrangler login
was expired, preventing remote inspection and rollout.

Rollout completed October 23, 2026: all six dedicated queues were created,
remote D1 reported no pending migrations, and Worker version
`310e86cc-348a-4b74-ba83-94510cf14fee` deployed with its minute Cron and all five
queue consumers. Read-only verification found nine scheduled feeds. The latest
model authorization expires at 2026-10-23T17:41:25.909Z (20:41 Beirut); it was
not renewed. Successful deployment does not establish successful publication.

October 23 live user-flow validation completed: the approved four-publisher test
feed published its first complete 30-minute window at 16:00:52 Beirut. Its public
reader and source dialog were verified in Chromium, and the test feed was paused
at 16:01:40 as authorized. The existing AI Industry Watch feed also published a
12-section V3 briefing. See `docs/joud-briefing-user-flow.md` for fixes, tests,
retained acquisition failures and financial authority details.
The user explicitly approved two model slots and a $5 total exposure ceiling for
the current authorization period. Both amendments preserve the original expiry:
October 23, 20:41 Beirut. These are not recurring daily authorizations. The separate
$5/day collector limit remains unchanged.


October 23 follow-up: the user explicitly approved SOURCE_DAILY_BUDGET_USD=10
for collector operations. Prior reservations and unknown-call fences remain.
This does not renew the separate briefing-model authority. Recommendations enable
SOURCE_RECOMMENDATIONS_FAST_CATALOG=true and stream checked choices. The two
CNET/ZDNET acquisition jobs were repaired from real evidence; the paused test feed
now reports zero failed acquisitions on all four sources. See docs/joud-briefing-user-flow.md.
