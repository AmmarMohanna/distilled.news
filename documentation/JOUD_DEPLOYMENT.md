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
if all fail verification, one replacement call proposes different sources and
verifies them independently. No more than two recommendation calls run per click.
Candidate discovery and assessment check up to five sources concurrently.
Each candidate starts assessment as soon as it resolves; a slow publisher does
not hold up checks of ready feeds or Google News. Google connection failures and
timeouts exclude Google from the replacement round, just like provider outages.
Verification reuses bounded publisher responses within the request instead of
fetching every feed twice. Recommendations have a 20-second total network budget
and an 8-second per-call limit, including response bodies; timed-out or
inconclusive candidates are never returned as verified. These are limits, not
measured production latency guarantees.
Each pass suggests at most one Google News query. If Google News verification returns
a server error, access restriction, or rate limit, the replacement pass excludes that
provider rather than suggesting more queries against the same failing endpoint.
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
are RSS/Atom and Google News searches. Suggested websites are retained only when
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
Separate typed questions assess news content, topical alignment, and suspicious
signals, using up to 20 recent feed items within the existing evidence size cap.
Malformed, inconclusive, low-confidence, and unavailable-provider results
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

The image prompt uses only the user's full interest profile (the “What would you
like to follow” field), rather than the feed title. It requests a monochromatic
`#5E5CE6` colored-pencil sketch with natural, slightly irregular strokes, fine
pigment grain, subtle pressure variation, and thin-to-medium lines. The model
chooses a recognizable subject from the interest. Existing saved JPEGs remain
unchanged, including illustrations created before this model change; this does
not automatically regenerate earlier blank images.
