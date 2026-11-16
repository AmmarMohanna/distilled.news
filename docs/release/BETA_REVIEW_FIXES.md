# Beta review fixes

Branch: `fix/beta-session-explore-summary`, based on deployed integration `1370f381`.

- Logout always attempts the server logout even when push revocation fails. Local unsubscription runs despite deletion failure, deletion has a five-second network timeout, and unsuccessful push cleanup is reported after logout. A failed server logout keeps the profile dialog open, clears its busy state, and allows retry.
- Explore receives voter-specific star state and publication timestamps in each listing page. Timestamp lookups use partial indexes instead of loading complete editions. No per-community-feed detail requests run on Home or Explore. Both Explore surfaces load additional pages explicitly, retain prior cards on failure, show a partial-load warning, and retry the failed cursor. Duplicate IDs from a changing listing are coalesced.
- Unread summaries admit at most six new provider attempts per verified account per rolling hour across feeds, using an atomic indexed insertion. Cache/receipt reuse does not spend quota. Quota denials return 429 with Retry-After. Pre-provider capacity/budget refusal can conservatively consume an attempt.
- Every new summary reservation requires an active finite financial authorization even on TRACK_ONLY accounts, using the existing transactional shared-exposure guard. Previous holds, receipts, cached results and uncertain-operation fences remain intact. This does not change scheduled briefing admission or create spending authority.

## Release requirements

Apply migration `0098_explore_publication_metadata.sql` before deploying these fixes. Before enabling new paid summaries, configure a finite grant through the existing operator-only authorization mechanism. No grant means new summaries fail closed; previously paid cache entries remain readable.

This branch does not deploy itself, change production settings, run paid inference, or modify published news. Offset pagination retains its existing ordering behavior: concurrent star/ranking changes can shift page boundaries; ID coalescing prevents duplicate cards but does not create a snapshot of the community directory.

## Local verification

- Workspace typechecks, E2E TypeScript check, frontend production build and Worker dry-run bundle.
- Frontend regressions include logout despite revocation failure, local unsubscription after network failure, one-page Explore reads, zero community feed fan-out, and same-cursor partial-page retry.
- Local real-schema D1 regressions verify voter isolation, private/paused exclusion, withdrawn publication exclusion, timestamp index selection, concurrent account quotas, finite-cap enforcement despite TRACK_ONLY, and unchanged UNKNOWN holds.
- Existing summary recovery, accounting and provider-admission tests run with fake providers. Successful test responses are not real provider calls or paid evaluations.
- Desktop/mobile browser coverage includes a server logout failure followed by successful retry.
