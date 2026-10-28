# Reader alignment and complete widget rows, 29 October 2026

The reader no longer shows the Source details disclosure or its surrounding
chrome. Stored diagnostics are unchanged; actual current collection blocks still
have a warning, with no link to a removed disclosure.

The generated unread summary renders into a timeline-level target using a React
portal, preserving the summary's account/feed scope, cache, close action and
asynchronous state. Its heading aligns with Today and its card uses the reader's
full content width. Only the search/countdown/summary-button row is centered;
the search is a bounded pill like the reference. The toolbar has no outer frame.

The earlier overflow checks missed rows intersecting the viewport boundary. The
shared Home/Explore grid now measures natural card rows, including wrapped
titles, and limits its visible height to complete rows when at least one fits.
Remaining cards stay in the same scrollable list; none are removed or paginated.
Text/artwork sizes remain stable. If a whole card cannot fit, ordinary page
scrolling remains available. Existing action menus already use the top layer,
so the scroll container does not clip their panels.

Validation: 20 focused frontend tests passed, including portal placement/closing;
frontend typecheck and production build passed. Mocked browser checks passed
27 cases: 12 phone/desktop cases, nine expanded-sidebar desktop cases including
1280x640, and six Arabic dark-mode cases. Checks specifically assert no partially
visible widget rows, no horizontal/content overflow, no Source details element,
and equal Summary/Today heading alignment. No live AI calls were made.

Local screenshots, browser scripts and measurements remain ignored under
.local-reports/live-check.
