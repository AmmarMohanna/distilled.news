# Home, Explore and paused feeds

Home lists active owned feeds. The archive button beside Create feed opens the
owner's paused feeds, including private feeds. Each row links to the existing
feed and offers Resume. A failed save leaves the feed in the archive and shows
an error; a successful save returns it to Home. The archive uses the existing
`paused` flag and owner-only save endpoint; it introduces no new feed status.

Explore lists active public feeds. Guests see all eligible owners; signed-in
viewers see other owners only. Both repository implementations filter before
pagination. The API response is private and not cached because its membership
depends on the session. Direct reads of previously published public briefings
remain available while paused. Private-feed access controls remain unchanged.

The archive reuses the existing native dialog, including keyboard focus return,
Escape dismissal and scrolling. Controls have at least 44px targets; strings
are translated into French and Arabic. The narrow layout places the archive
icon beside the existing Create feed button.

Validation:

- 62 web unit tests passed, including failed and successful archive resumption.
- New API/in-memory filtering and real D1 migration tests passed.
- Two existing Explore API regression tests passed.
- 144 Home/Explore/layout browser checks passed in desktop and mobile projects;
  29 existing application browser checks passed, with one desktop-only skip.
- The archive browser scenario passed again after visual layout corrections,
  including 320px, Arabic, dark mode, doubled text, focus return and save retry.
- All workspace TypeScript checks, E2E TypeScript checks and the web build passed.

Screenshots and local browser logs are retained under
`.local-reports/feed-archive/` (not committed). No deployment or paid inference
was performed for this change.
