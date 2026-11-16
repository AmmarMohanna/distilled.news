# Beta review fixes

Branch: `fix/beta-session-explore-summary`, based on deployed integration `1370f381`.

- Logout always attempts the server logout even when push revocation fails. Local unsubscription runs despite deletion failure, deletion has a five-second network timeout, and unsuccessful push cleanup is reported after logout. A failed server logout keeps the profile dialog open, clears its busy state, and allows retry.
- Explore receives voter-specific star state and publication timestamps in each listing page. Timestamp lookups use partial indexes instead of loading complete editions. No per-community-feed detail requests run on Home or Explore. Both Explore surfaces load additional pages explicitly, retain prior cards on failure, show a partial-load warning, and retry the failed cursor. Duplicate IDs from a changing listing are coalesced.
- Unread summaries admit at most six new provider attempts per verified account per rolling hour across feeds, using an atomic indexed insertion. Cache/receipt reuse does not spend quota. Quota denials return 429 with Retry-After. Pre-provider capacity/budget refusal can conservatively consume an attempt.
- Summaries follow the existing deployment accounting mode, with no additional mandatory finite budget. TRACK_ONLY remains supported. Existing reservations, settlements, receipts, cached results, provider-capacity admission and uncertain-operation fences remain intact.

## Release requirements

Apply migration `0098_explore_publication_metadata.sql` before deploying these fixes. No additional dollar-budget configuration is required for summaries on TRACK_ONLY accounts.

This branch does not deploy itself, change production settings, run paid inference, or modify published news. Offset pagination retains its existing ordering behavior: concurrent star/ranking changes can shift page boundaries; ID coalescing prevents duplicate cards but does not create a snapshot of the community directory.

## Local verification

- Workspace typechecks, E2E TypeScript check, frontend production build and Worker dry-run bundle.
- Frontend regressions include logout despite revocation failure, local unsubscription after network failure, one-page Explore reads, zero community feed fan-out, and same-cursor partial-page retry.
- Local real-schema D1 regressions verify voter isolation, private/paused exclusion, withdrawn publication exclusion, timestamp index selection, concurrent account quotas, TRACK_ONLY operation without an additional budget, and unchanged UNKNOWN holds.
- Existing summary recovery, accounting and provider-admission tests run with fake providers. Successful test responses are not real provider calls or paid evaluations.
- Desktop/mobile browser coverage includes a server logout failure followed by successful retry.
