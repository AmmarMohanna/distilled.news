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

## Follow-up: full-page scrolling and authentication email styling

The user clarified that scrolling must belong to the whole page. The grid's
viewport-height cap and internal overflow/snap behavior have therefore been
removed. Home/Explore still use the same bounded artwork and card sizing, while
every card stays in ordinary page flow. Summary alignment, the centered toolbar
and Source details removal remain intact. The previous complete-row/internal-list
description above is superseded by this clarification.

Verification and password-reset emails now display Distilled.News, include the
existing transparent brand PNG hosted on the deployment's frontend, and use a
blue-magenta (#5e5ce6) button with white text. The shared HTML uses an email-safe
presentation table and bgcolor fallback. Verification/reset URLs, plain-text
fallback links, expiry text and mail credentials/transport behavior are preserved.
Existing delivered email cannot be restyled; the template applies to new mail.

Validation: four grid tests and all three mailer tests passed; frontend/Worker
typechecks and frontend build passed. Six mocked phone/desktop browser cases
confirmed page scrolling increases while feed-grid scrollTop stays zero, with
overflow visible and no grid max-height. Reader alignment stayed intact. Local
HTML email previews at widths 390 and 760 confirmed the logo loads, the button
uses the exact accent color and no horizontal overflow occurs. No real emails
were sent during validation.

## Available-space fitting and complete email mark

Home and Explore now measure available width, the initial viewport bottom (including mobile navigation), and natural card content height. Row height stays within readable content bounds; artwork remains bounded. Where another full row cannot fit, its start moves below the initial fold. Every card remains in the list and scrolling belongs to the page. Normal partial visibility while actively scrolling is expected.

Replaced the offline crossed-out Wi-Fi with an inline lavender cloud/card illustration, requiring no network image. Authentication emails use a dedicated transparent full-mark PNG derived from the existing vector logo; installed and notification icons are unchanged. Existing delivered email is unchanged.

Validation: 98 frontend tests and three mailer tests passed; frontend and Worker typechecks and frontend build passed. Edge checks covered Home, Explore and reader at 320x740, 390x844, 1280x640 with expanded sidebar, and 1920x1006: no horizontal overflow or initial partial card rows, matching Home/Explore card sizes, and page scrolling where needed. Email previews at 390 and 760 pixels loaded the full mark and violet button without overflow. Offline preview had no external image dependency. Browser content was synthetic; no emails or paid model calls were sent.

### Correction: continuous widget spacing

Removed the fold-dependent margin that created a large blank gap between rows after scrolling. Available-space row sizing remains, but rows always use the normal 10px mobile / 16px desktop grid gap. A row may naturally cross the browser edge during page scrolling; content is not clipped inside cards. Browser checks at four sizes passed with no injected margins, horizontal overflow, or nested grid scrolling; Arabic layout was checked separately.

### Available-height compact widgets — 2026-10-29

The fitting calculation now attempts the next complete row by reducing card height, instead of keeping the preferred large height. A compact content style reduces padding, artwork and identity spacing together before measuring the minimum required for uncut text. Fit height is bounded by measured content; touch controls remain 44px. No fold-dependent margins, slicing or nested scrolling were added. Both routes use the same rule.

Reproduced the screenshot with a collapsed sidebar at 1280x590 CSS pixels and nine representative English/Arabic titles, including Technology Briefing Check. All three rows fit in Home and Explore at 98px per card, versus the former 120px. Browser checks also covered mobile, 1280x640 and 1920x1006 with no horizontal overflow or grid scrolling. Focused layout tests (5), frontend typecheck and production build passed. Extremely long content can still require taller cards; readability takes priority over arbitrary shrinking.

### Restore artwork scale independently of sidebar

Artwork is now fixed at 72px on desktop and 56px on mobile. Sidebar width no longer chooses artwork or typography scale. Compact spacing uses the available height, and intrinsic minimum height comes from the identity, timestamp, artwork and controls instead of flex-stretched card bounds. Content resize observation refits after fonts/artwork settle. Browser checks covered both sidebar states, Home/Explore and four viewport sizes; the collapsed 1280x590 reproduction still fits three complete rows, with the restored larger artwork. No horizontal overflow or nested grid scrolling was observed. Frontend build and typecheck passed.
