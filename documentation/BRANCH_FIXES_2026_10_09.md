# Branch fixes and rollout steps — October 9, 2026

The working branch is `codex/source-execution-backend`. It was fast-forwarded to
the newer local `backend-sources-fixes` implementation at `4eb8846` before these
fixes. This brings in the existing multi-source runtime, real intake integration,
source ownership gates, migrations and isolated QA evidence. It does not deploy
those changes or activate continuous collection.

## Changes in this follow-up

- Legacy raw-message retention journals R2 deletion keys in D1 before expiring
  their identifying SQL rows. Failed deletes and uncertain acknowledgements are
  retried across repository restarts. Live raw-message references protect objects,
  and each cleanup processes at most 100 queued object deletions. No migration or
  shared contract change is required.
- Grounded publication keeps exact title support separate from body sentence
  checks. A title repeated at the start of the body no longer breaks the RSS
  connector-to-publication pipeline; incomplete body quotes still fail validation.
- The trusted-browser guard checks TypeScript syntax, including computed calls
  and template interpolations. Static hardening-script text no longer causes a
  false violation.
- Project CI covers workspace types/tests, Node/Python helper tests, builds and
  desktop/mobile browser tests. Windows Worker tests run serially to avoid the
  loopback port collisions seen with concurrent short-lived Miniflare instances.
- The feed editor always submits public feeds and offers no private visibility
  control. Empty feed searches have localized status feedback.
- Browser tests follow the current atomic `/api/me/feeds` source submission,
  account editor, language control and deployment notification availability.
  They retain citation, search, source-selection and responsive-layout checks.
- Summary formatting has been extracted from the main frontend module without
  changing its behavior. The larger frontend/repository split remains incremental.
- Source setup documentation distinguishes the connected current runtime from
  historical implementation slices and isolated QA from production rollout.

## Local verification

- Workspace unit tests: 1,436 passed, 12 existing skips. The Worker portion
  passed all 803 tests in its serial rerun after Windows loopback port collisions
  disrupted the initial concurrent run. Frontend tests were rerun after the
  public-only editor change.
- Browser tests: 113 passed, one existing skip, including a fresh-server run
  with CI's two-worker settings.
- Execution helpers: 10 Node tests and four synthetic Python tests passed.
- All workspace typechecks, frontend production build and Worker dry-run bundle
  check passed. The Worker bundle check used `--containers-rollout=none`; the
  container image build was not verified locally because Docker is unavailable.
- The added GitHub workflow has not been run remotely. Existing live canaries
  and provider checks were not activated by this verification.

## Deployment boundaries

Wrangler account identity and the running private VPS runtime, tunnel and egress
service were checked read-only. Credential-file presence and private permissions
were checked without displaying their contents. These are setup checks, not new
live provider tests. No push, deployment, migration, paid call or source activation
was performed in this follow-up.

Prior isolated live results and their limitations are in
`SOURCES_QA_LIVE_2026_10_09.md`. QA sources remain disabled and paid-provider limits
remain zero. Successful local tests do not establish live recall or uptime.

## Next steps

1. Configure production resources in the new Cloudflare account. Review all
   bindings and resource IDs; the production Wrangler file still names legacy
   resources. Coordinate shared migration numbering and the rollout with the
   downstream owner.
2. Update the VPS server and both source-execution helpers together. Verify the
   authenticated Worker-to-runtime transport, including Telegram resolution.
3. Apply approved connector/intake migrations to the selected environment, then
   enroll approved sources with their downstream FeedSource mappings. Switch
   collection ownership per source so only one poller owns it.
4. Run a bounded source matrix: RSS, Google News, Telegram, X profile/search,
   LinkedIn and websites. Set explicit request/item/page/time and paid ceilings
   before calls. Custom Apify actors require explicit supported enrollment;
   factory support alone does not prove scheduled product integration.
5. For each source, verify durable receipts, evidence provenance, downstream
   Events and grounded editions; repeat an unchanged poll to check replay and
   deduplication. Give the downstream tester that evidence for all source types.
6. Exercise session expiry/restart, edits, authoritative deletions, provider
   outages, bounded fallback and uncertain paid outcomes. Missing items do not
   establish deletion. See `CONNECTOR_FOLLOWUPS_2026_10_09.md` for remaining cases.
7. Measure sustained multi-source storage, latency and cost before continuous
   operation. Broader file refactoring and retained cost trends remain follow-ups.
