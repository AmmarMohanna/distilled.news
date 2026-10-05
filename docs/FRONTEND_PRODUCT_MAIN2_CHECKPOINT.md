# Frontend product integration checkpoint

Status: **incomplete; staging account access blocked**. This is a resumable checkpoint, not a release or a completed product milestone.

## Verified Git state

- Fetched origin before comparing branches.
- Backend baseline: `efb6e91b94cf8336065ab407cf2040b4ab7f4236`.
- Frontend incorporated: `340a4a83da480437e6f41300af7199837a0b0494`.
- Existing remote main2 baseline: `37eb30e1642651b0f6c8b2476d4b7879026640c3`.
- Common ancestor: `673f0fc538063629ea03319f394cff32db8c82b4`; backend/frontend unique commits: 303/9.
- The backend includes the latest model verifier/publication changes, including reader witness checks at publication.
- Target branch: **main2**, per the user's override; no new integration branch.
- Isolated worktree: `.integration/frontend-product-main2`. The original main checkout contained unrelated changes and was preserved.
- Real merge: `b98d25ba146c893c08cce5cb318298f602308122`, with the backend and frontend heads as its two parents.

## Merge resolution

Seven conflicts: root package.json and pnpm-lock.yaml; Worker package.json, app.ts, index.ts, types.ts and wrangler.toml. All used the staging baseline. Auto-merged repository.ts, app.test.ts, README.md and setup.mjs were also restored to the staging baseline before product changes.

The frontend's dialogs, Apple-inspired styles, source picker, recommendation interaction, microphone input, theme/account/settings interaction and FeedArt UI were retained. Modern Candidate Intake, connectors, evidence, semantic/Event/Storyline intelligence, EditorialPlan, synthesis/verification, immutable publication, durable recovery, source fencing and staging entrypoint/configuration remained intact.

The frontend-era push/sketch backend files and duplicate 0011 web-push migration were removed in the reconciliation checkpoint. Frozen backend migrations were not rewritten. Optional frontend controls still need capability reconciliation before release.

## Implemented locally

Create/Edit FeedEditor inputs: title, interestProfile, explicit sourceInputs, publicFeedEnabled, updateIntervalMinutes (30/60/120/360/720/1440), optional briefingTimeOfDay for Daily, language (en/ar/fr), and hidden briefingTimezone. Internal names follow existing repository conventions. The API client still uses the compatibility saveBriefing contract; a dedicated clean server save-feed contract is unfinished.

- Public/Private is editable and persisted.
- Normal rhythm controls use the six live intervals. Historical cadence remains internal.
- Daily shows Deliver at; non-Daily hides it and uses the existing midnight anchor.
- Daily delivery changes are accepted by the normal save endpoint. The frontend no longer overwrites the selected time during save preparation.
- IANA timezone is inferred with Intl.DateTimeFormat and hidden; an existing feed's zone is preserved.
- Slug remains derived; no manual slug input was added.
- nextBriefingAt is calculated by the server. The next boundary helper follows the existing local-calendar interval policy, including DST.
- Writing style, depth, weekly/monthly and manual timezone controls are absent from ordinary Create/Edit, including the old settings sheet.
- Empty Create source selection produces a clear validation message. Interest text is never used as a substitute source.
- Voice input remains in title and interest fields.

Privacy now gates username/slug feed reads, edition detail, search, developments, evidence, stars and summary requests through a shared resolver. Anonymous private requests return 404; an authenticated owner can read/manage the private feed. Explore filters private feeds in both D1 and in-memory repositories. Feed-specific manifest metadata excludes private feeds. Direct immutable edition/evidence APIs also check current product-feed visibility and owner session.

The recommendation button now receives an authenticated, bounded-input, explicit 503 JSON error when recommendation capability is unavailable. **AI source recommendations are not implemented**; no automatic subscription occurs.

## Required work still outstanding

1. Connect explicit source choices to modern source configuration/approval and runtime admission. Current normal addSource still uses the legacy helper; staging disables legacy polling. The existing runtime allowlist cannot admit a newly created feed's sources yet.
2. Load existing source selections into Edit, reconcile removals and retries, and prove duplicate prevention and configuration fences.
3. Implement bounded source recommendation using the modern provider/security contracts.
4. Bridge username/slug feed reads to published immutable v1 BriefingEdition records. The current frontend continues reading legacy editions. Modern published stories and provenance must be projected by the server without client reconstruction.
5. Prove original source links, edition history, quiet/error states and reload idempotency in the updated UI.
6. Disable or reconcile optional sketch generation, push notifications and Explore publishing controls; their frontend-era backend implementations were not ported.
7. Complete API-client, source-picker/recommendation, timezone inference, published-edition rendering and real browser product tests.
8. Inspect deployed staging settings/secrets and model budgets, deploy only staging, and perform the persisted end-to-end product proof.

## Verification

- Frontend unit/component suite: 12 passed.
- Focused backend app/privacy/scheduling/migration suite: 70 passed before the additional D1 persistence and next-boundary assertions were added; subsequent verification is recorded in the completion message.
- Web build: passed.
- Staging Worker dry-run build: passed, using the preserved staging configuration.
- git diff --check: passed.
- Workspace typecheck and complete Worker suite were run; final results are recorded in the completion message.
- No actual staging browser product proof or new staging deployment occurred.

## Owner-controlled blocker

The staging config requires Cloudflare account `e32b564514d4f9b9e383b7dd30dbb026`, Worker `distilled-news-staging`, D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`, R2 `distilled-news-staging-raw`, the staging processing/DLQ queues and VPC service `01a1099d-e88a-7c23-a1c5-eeb51471e780`.

The available OAuth login only accesses account `37a6bb83b085bd6739426e7c2d4aeda8`. A read-only query of the exact configured staging D1 database failed with Cloudflare authentication error **10000**, and Wrangler confirmed the account mismatch. Credentials for the configured staging account are required. Secret values were not printed.

Staging resource configuration, provider operation ceilings (zero paid provider operations), semantic/salience policy and synthesis toggle were left unchanged. Installed remote secret names and actual deployed model settings could not be verified with this login.

**Main, its unrelated local work, and production deployment were untouched.** Do not deploy this checkpoint as a completed product milestone.
