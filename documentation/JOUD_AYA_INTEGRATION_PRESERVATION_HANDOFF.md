# Joud / Aya integration: final preservation and merge handoff

Prepared 29 October 2026 at Joud's explicit request. Source branch:
`joud/aya-integration-fixes`. Protected implementation snapshot:
`ae0e2d95532c15e8c4ee0c7a0cb52c6d8bb49d8b`.

This document records the FINAL behavior Joud approved. A companion
[inventory](JOUD_AYA_INTEGRATION_PRESERVATION_INVENTORY.md) lists the exact commits
and changed paths. Documentation commits after the snapshot do not supersede
the implementation unless explicitly stated.

## Instructions for the integrating Codex

Joud requests that every detail of her work survive the merge. Preserve actual
behavior, appearance, interactions, assets, language handling and deployment
isolation, not merely the presence of commits in history. These requirements
apply to clean automatic merges as well as conflicts.

1. Fetch this source branch and create a separate integration branch. Keep both
   input histories reachable. Do not reset, force-push, rebase or overwrite Joud's
   branch. Record both input SHAs and the merge base in the integration report.
2. Read this document, the companion inventory, and the existing
   [frontend handoff](FRONTEND_FIXED_MERGE_HANDOFF.md) and
   [frontend inventory](FRONTEND_FIXED_MERGE_INVENTORY.md). This new handoff adds
   the final follow-up requirements; it does not cancel the older protected
   artwork, recommendations, collector, storage and dedicated-resource work.
3. Merge shared files by FEATURE. Never resolve `app.ts`, `main.tsx`, `apple.css`,
   the acquisition/runtime files or repository code with a blind whole-file
   ours/theirs choice. Preserve both compatible features.
4. Treat the final source snapshot as authoritative for Joud's protected UX. If
   incoming functionality needs a contract change, adapt it compatibly instead
   of replacing the UI. If a requirement cannot coexist, document the exact
   conflict and obtain Joud's direction before removing it.
5. Review the resulting diff for every protected path, including files Git merged
   without conflicts. Build success does not establish visual preservation.
6. Do not run a global CSS cleanup, logo replacement, translation rewrite,
   responsive redesign, package upgrade or generated-bundle restoration during
   integration. Those can undo carefully scoped fixes without Git conflicts.
7. Produce a written acceptance report: preserved features, intentional changes,
   test results, screenshots/measurements and any remaining limitations. Do not
   claim everything works because a deployment or database write succeeded.

Merge review is not fresh authorization for deployment, real email delivery,
paid acquisition, model calls, database replacement or credential changes. The
earlier Joud deployment permissions in her working session must not be interpreted
as blanket permission for another deployment or spending grant.

## Scope and reporting boundary

`bbc631a` is the merged Aya/Joud integration landmark used for the focused
inventory. It is a reporting boundary, not a claim that every earlier commit was
personally authored by Joud or that earlier work is disposable. See
[integration evidence](../docs/aya-joud-frontend-integration-2026-10-28.md).

The snapshot includes inherited briefing/backend work. Its implementation can
evolve where the older ownership policy permits, but must preserve frontend
contracts and all protected features below. In particular retain V3 factual,
source-identity, scheduling and accounting safeguards from the project notes.

## 1. Shared layout, navigation and responsive widgets

- Home and Explore use the same `AdaptiveFeedGrid` and card sizing rules. Neither
  route gets a special larger/smaller card system. Calculate layout from actual
  available width, initial viewport space and natural content height.
- Preserve up to three width-based columns, bounded card width (440px), normal
  16px desktop / 10px mobile gaps, and content-aware row sizing. The fitting
  routine attempts an additional complete row by reducing height within measured
  readable bounds rather than arbitrarily clipping cards.
- Preserve natural minimum height for wrapped titles, owner/timestamp rows,
  artwork, padding and action controls. Controls retain 44px touch targets.
  Measure actual identity/timestamp content rather than flex-stretched height.
- Artwork is 72px on desktop and 56px on mobile in the final compact presentation.
  Opening/collapsing the desktop sidebar must NOT change its size. Earlier 44px
  artwork experiments were superseded; do not restore them.
- Do not grow header branding or text in proportion to viewport size. Preserve
  existing readable type scales and the established site proportions.
- Scrolling belongs to the full page. No fixed-height feed-only scroller,
  viewport-height grid cap, list slicing, pagination, snap paging or hidden
  inaccessible cards. All cards remain in document flow.
- No artificial fold-dependent row margins: those created large blank gaps.
  Fit complete rows where practical, but a card can naturally intersect the
  viewport edge while scrolling. That is different from clipping its contents.
- Preserve menu top-layer placement, viewport bounds and fixed action slots.
  Menus must not disappear behind neighboring cards.
- Preserve desktop sidebar pin/unpin/hover behavior from the existing baseline.
  Mobile uses bottom navigation. In Arabic it reads RIGHT to LEFT: Home on the
  right, Explore in the center, Settings on the left. English/French retain Home
  left and Settings right. This override is mobile-only (below 900px).
- Settings, Welcome and Explore headings start at the same vertical position.
  The final fix removes Settings' extra 20px top margin; it does not center or
  redesign Settings' content. Keep the appropriate language text alignment.

Primary files: `AdaptiveFeedGrid.tsx`, `AppExperience.tsx`, `main.tsx`, `apple.css`.
See [reader/layout follow-up](../docs/joud-reader-layout-followup-2026-10-29.md),
whose later corrections supersede its earlier internal-scroller description.

## 2. Reader toolbar, summary and source-health presentation

- The search/countdown/Summarize unread controls form a centered, bounded toolbar,
  not a full-screen stretched search field. Search remains bounded even with no
  published briefings or no Summarize unread button (440px search maximum in the
  final empty-reader correction). Phone controls wrap appropriately.
- Keep consistent pill styling for countdown and controls, subtle accent treatment
  and the very light blue-magenta background of the generated summary card.
- The AI Summary heading/card align with Today and the reader content column.
  They are NOT centered within the narrow toolbar. Keep summary cache, account/feed
  scope, asynchronous state, error handling and close button.
- Joud explicitly removed the expandable **Source details** section, including
  its separator line. Do not restore it from older health-display commits/docs.
- Continue showing genuine current source-collection blockers honestly. Saved
  rejected indexes, old item failures and temporary automatic waits must not be
  presented as proof the whole source is currently down. Removing the disclosure
  did not delete backend diagnostics or authorize marking failures successful.
- Preserve accurate counts, singular/plural copy and translated error/status text.
  Do not solve acquisition issues by suppressing current real failures.
- Preserve existing V3/legacy headline-body rendering, citations, retained search,
  unread filters and content-language direction independently of website language.

Primary files: `main.tsx`, `UnreadSummary.tsx`, `SourceHealth.tsx`,
`source-acquisition-messages.ts`, `apple.css`.

## 3. Branding: context-specific rules, not one icon everywhere

| Context | Final requirement |
| --- | --- |
| Website/header/dialog branding | Transparent logo; preserve original proportions and full intended mark. |
| Display name and page/tab metadata | `Distilled.News`, capital N. Use a normal `-` where the title uses a dash; do not reintroduce the old em dash in offline or calmer-perspective titles. |
| Desktop installed app icons | Dedicated transparent desktop PNGs. |
| Mobile installed home-screen icons / Apple touch icon | Preserve the existing white-backed blue-magenta mobile icons. They were explicitly requested and must not be replaced by desktop transparent assets. |
| Notifications | Separate transparent color icon and monochrome transparent badge, not the opaque mobile installation icon. |
| Authentication email | Transparent full logo mark from `email-logo.png`, alongside `Distilled.News`. Do not substitute the cropped favicon. |
| Android native launch screen | Final implemented workaround is WHITE manifest `background_color`, matching the white-backed mobile icon and removing the contrasting cream seam. This is a background match, NOT a transparent native splash icon. |

Both the static manifest and dynamically served Worker manifest use the final
white launch background. Preserve app IDs, username/feed-scoped start URLs,
device-specific icon selection and noncached dynamic manifest behavior. Existing
OS/WebAPK metadata can remain cached after a web deployment. Do not promise a
physical-device splash refresh or transparency that was not tested/implemented.

Primary files: `apps/web/index.html`, `apps/web/public/manifest.webmanifest`,
desktop/notification/email PNGs, `apps/worker/src/app.ts` manifest builder,
`manifest-icons.test.ts`. See [branding](../docs/joud-responsive-branding-2026-10-29.md)
and [Android launch limitation](../docs/joud-android-launch-background-2026-10-29.md).

## 4. Offline fallback

- Keep the self-contained cloud/Wi-Fi/error-badge SVG in `public/sw.js`; it must
  work without the app bundle or an externally loaded image.
- Outer illustration background is transparent. The INNER Wi-Fi card has a soft
  pale lavender gradient with enough contrast against white, no border, and a
  natural light appearance. Preserve cloud shapes, purple Wi-Fi and error badge.
  Do not return to the crossed-out Wi-Fi icon or outlined card.
- The fallback title, heading, description, retry button and HTML direction follow
  the saved website choice `localStorage.dn_language` (en/fr/ar). Browser language
  is only the fallback when no supported saved preference is available or storage
  cannot be read. An English browser must still show Arabic if the user chose it.
- Preserve safe textContent assignment, supported-language checks and storage
  exception handling. Do not require a translation endpoint while offline.
- Keep normal retry behavior and SW update/activation behavior. Do not cache
  authenticated responses or private feed content as a shortcut to localization.
- Existing clients first need to receive the new service worker while online.

## 5. Website localization and Arabic layout

- User interface labels, options, accessible labels, feedback and statuses follow
  selected English/French/Arabic. User-entered usernames, feed titles and free
  text remain verbatim; do not machine-translate them.
- Preserve `LanguageControl`, `interface-translations.ts`, request-language
  plumbing and placeholder substitution AFTER translation, so usernames/titles
  inserted into translated sentences are not translated.
- Schedule options are translated for all intervals: 30 minutes, hourly, 2/6/12
  hours and daily. Do not leave English options inside an Arabic/French UI.
- Profile dialog mirrors in Arabic: identity/form placement, heading icons,
  security controls and directional arrows. Keep email/avatar rendering stable.
- Closed account-management Settings/View feeds/Suspend chevrons point left in
  Arabic; expanded disclosure arrows still point down. Do not mirror all SVGs
  indiscriminately (logos, globe, moon, clocks and down arrows are not back arrows).
- Arabic Create/Save and Cancel footer positions follow the final correction:
  primary action on the right and Cancel on the left. The selector targets
  `.feed-editor .dialog-inner > .experience-dialog-actions`; the form is inside
  the Dialog, not a direct footer child of `.feed-editor`.
- Arabic sign-in-unavailable copy uses RTL/plaintext direction so terminal
  punctuation appears at the correct end, not stranded on the right.
- Reset-password title AND subtitle remain centered in Arabic as in other
  languages; form labels and input still follow RTL.

## 6. Guest headers, authentication and reset-password page

- Logged-out feed Star/Share actions appear to the LEFT of Language/Theme/Log in.
  Language/Theme/Log in keep the same horizontal slots as the landing header.
  Preserve this grouping in Arabic too; brand mark is not reversed. Mobile Back
  wrapping can change row height, not the shared control-column positions.
- Do not alter logged-in contextual action order accidentally while fixing guests.
- Reset password uses the actual shared landing `AppHeader` and guest landing
  classes, not a copied enlarged header. Preserve normal site scale, centered
  heading, account-recovery subtitle, maximum 640px form, password visibility
  control, Save state, validation and existing reset endpoint.
- Preserve full-page scroll on short/mobile reset screens. No overflow-hidden
  shell that makes the form or Save unreachable.
- Keep redesigned unavailable-sign-in modal: separate close control, central
  error illustration/badge, title, message, rounded surface and theme support.
- Preserve verification success state: replace Verify Email with **Email Verified**
  (capital V), hiding obsolete confirmation text/button/Create content once
  successful. A failed/expired link must still show appropriate feedback.

## 7. Feed Preferences and custom dropdowns

- Preferences is ONE continuous card. Opening it reveals Schedule/General inside
  that card, not a separately bordered card underneath.
- Exactly ONE divider separates Schedule and General. No heading underlines or
  separators between individual rows.
- Calendar/people/globe/clock preference icons are blue-magenta without grey tiles.
- Rhythm and language triggers use pale lavender fill/border, rounded corners,
  violet chevrons and existing typography. Closed language field uses a globe
  badge; open language options show UK, French and Lebanese flag illustrations.
- Shared `FeedSettingsSelect` uses a rounded top-layer popover/listbox, rounded
  option rows and pale lavender selection, never a grey native OS option menu.
  Keep menu outer radius 20px and option radius 14px in the final style.
- Menu width equals the measured trigger width; left and right edges align.
  Place directly above or below with 6px gap according to available space, including
  inside a scrolled dialog. Constrain height and scroll options if needed rather
  than extending outside the viewport or widening past the field.
- Preserve ArrowUp/Down, Home/End, Enter, Escape, outside dismissal, blur handling,
  selected state and focus restoration. Keep aria labels, controls and listbox
  semantics. Do not replace a working keyboard interaction with a visual-only menu.
- Rhythm values remain numeric when persisted. Daily time appears only for daily
  cadence and retains its existing value/save behavior.
- Daily time field matches rhythm width/height/fill/border/radius; native time input
  remains, with an accessible blue-magenta clock picker button instead of the
  mismatching black clock. Total control height is 44px.
- Account **role filter** reuses the rounded aligned dropdown behavior BUT its
  final closed field is WHITE with GREY border and GREY chevron. Do not apply the
  lavender feed-preference trigger style to it. Role labels/filtering are localized.

Primary files: `FeedLanguageSelect.tsx`, `FeedEditor.tsx`, `main.tsx`, `apple.css`.
See [dropdown details](../docs/joud-feed-dropdowns-2026-10-29.md).

## 8. Usernames and avatar initials

- Arabic, French accents and English are supported when creating AND renaming
  accounts, and when resolving public feed URLs and historical username aliases.
- Shared `packages/core/src/username.ts` performs NFC normalization, lowercase,
  trim and separator-to-hyphen conversion while retaining Unicode letters,
  combining marks and numbers. `Élodie` and decomposed `E + acute + lodie` normalize
  consistently. Do not restore ASCII-only `[a-z0-9]` filtering that erased Arabic
  and French accents or silently produced the fallback `user`.
- Signup URL preview and onboarding comparison use the same username normalizer
  as the Worker. Do not confuse the older feed-title `slugify` helper with username
  normalization. Preserve existing English account identifiers.
- Preserve username availability checks and old-name reservations. Do not migrate
  or rename existing accounts or historical aliases merely to normalize new input.
- Public URL generation encodes username/slug segments. HTML alias resolution
  decodes pathname segments safely; malformed encodings must not throw. API alias
  redirect replaces the encoded username segment instead of attempting raw Unicode
  string replacement in a percent-encoded pathname.
- Avatar initials: first letter of first word + first letter of second word,
  maximum TWO letters. Spaces, dots, underscores and hyphens delimit words. One
  word yields one initial; French capitals retain their accents.
- Arabic initials include a zero-width non-joiner (`U+200C`) BETWEEN them so they
  remain visually separate, e.g. `ج‌س`, not connected `جس`. This changes display
  initials only; it does not insert characters into the saved username.

Latest regressions: `packages/core/test/username.test.ts`, Unicode account/alias
cases in `apps/worker/src/app.test.ts`, `apps/web/src/account-initials.test.ts`.

## 9. Authentication email and Outlook configuration

- Both verification and password-reset emails use `Distilled.News` in subject and
  content, the transparent FULL mark, and blue-magenta `#5e5ce6` action buttons
  with white text and email-safe HTML/table/bgcolor fallbacks.
- Language is chosen from the website at signup or reset-link REQUEST time,
  passed through the API and validated by the Worker. Do not infer it from mail
  browser locale or a stale account-only setting. Default remains English.
- Preserve en/fr/ar subject, explanation, action, expiry and footer variants.
  Arabic body is RTL. The brand table is explicitly LTR so the logo ALWAYS stays
  LEFT of `Distilled.News`, including Arabic emails. Raw link is isolated LTR.
- Links include the validated `lang` parameter; auth pages restore that choice
  even when opened on another browser/device with a different saved language.
- Preserve token validation, single use, expiry, rate limits and plain-text links.
  Existing delivered emails cannot be retroactively restyled.
- Reuse the included Outlook Graph implementation. The deployment uses
  `MAIL_TRANSPORT=OUTLOOK_GRAPH`, deployment-specific `PUBLIC_WEB_BASE_URL` and
  configured sender. Preserve migration `0047_mail_oauth_tokens.sql` and durable
  token encryption/rotation behavior. Do not overwrite another deployment's token
  row or encryption key when resources are shared; check bindings first.
- Secrets remain external to Git. A merge does not transfer refresh tokens,
  encryption keys, mailbox authorization, database contents or user sessions.

Primary files: `api.ts`, `app.ts`, `mailer.ts`, `main.tsx`, `public/email-logo.png`.
See [reset/language details](../docs/joud-reset-language-2026-10-29.md).

## 10. PWA installation detection

- Do not ask users to confirm "Already installed on this device." That manual
  confirmation button and stale-localStorage inference were removed.
- Detect available browser signals: standalone display mode / iOS standalone,
  `appinstalled`, supported related-app queries and the actual install prompt.
  Do not turn an old localStorage flag into proof an uninstalled app is present.
- Native install cannot always be detected from an ordinary browser tab. Preserve
  honest localized fallback instructions when no native prompt/signal is exposed;
  do not fabricate an installed success state.
- Preserve root and feed manifest self-relationships (`related_applications`,
  correct absolute ID and manifest URL) in the dynamically SERVED manifest as
  well as the static one. Updating an unused static file alone is insufficient.
- Preserve app identity/start URLs and install state across ordinary auth refresh,
  logout and service-worker updates from the inherited baseline.

See [installation detection evidence](../docs/joud-install-detection-2026-10-29.md).

## 11. Source acquisition/recovery changes also on this branch

These are not a license to weaken identity or to buy provider retries. Preserve
the final source-repair logic and regression fixtures while integrating newer
backend work. Detailed reports are linked below; do not replace them with a claim
that every publisher error is solved.

- Publisher-owned readable prose extraction, explicit article schema/body support,
  nested-container handling and conservative partial evidence for short descriptions.
  Keep article body selection independent of sharing/related-card noise.
- Treat known section/author/index/live listing pages as discovery surfaces, not
  fake individual articles. Preserve observed same-origin article discovery.
- Retain exact original candidate/source identities and original publication
  dates. Known tracking-equivalent/canonical or reviewed same-publisher redirects
  can recover content only with the existing identity checks. Different articles,
  foreign bodies and meaningful query changes stay rejected.
- Preserve MTV bodies/section filtering, National public liveblog recovery, CBS
  discovery/browser readiness/resource policy, Aawsat/Arab News/Naharnet extraction
  and the associated tests. Script names alone do not prove a remote helper has
  been updated; the VPS runtime is a separate deployment.
- Keep bounded unpaid recovery, durable approval/replay behavior and precise
  diagnostics. Recovery scripts default to dry-run. Never erase evidence, reset
  paid operation identities or reopen uncertain submissions to clear warnings.
- Earlier paid requests with unknown outcomes remain fenced pending reconciliation.
  Paywalls, access controls, unavailable JS and unproven identity mismatches are
  limitations, not errors to bypass or call successful.
- Preserve accounting reservations, settlement, retry fences, unknown receipts,
  original windows/freshness, full retained evidence, V3 verifier/targeted repair
  and actual published reader memory. Keep GPT-4.1 editing/repair and GPT-4.1 mini
  verification unless separately authorized by Joud.
- A historical one-dollar/24-hour permission was explicitly time-limited. Its
  existence in a commit does not authorize renewing it or spending today. Do not
  infer current live authorization from historical recovery reports or config caps.

Read the source reports in the inventory, particularly `joud-unpaid-source-recovery`,
`joud-public-redirect-recovery`, `joud-liveblog-browser-recovery`,
`joud-short-article-recovery` and `joud-public-source-repair-followup`.
Never commit raw articles, credentials or private replay data from ignored reports.

## 12. Dedicated deployment and data isolation

| Item | Joud target at the protected snapshot |
| --- | --- |
| Worker | `distilled-news-joud` |
| Frontend | `https://distilled-news-joud.distillednews-platform.workers.dev` |
| Wrangler config | `apps/worker/wrangler.joud.jsonc` |
| Cloudflare account | `e32b564514d4f9b9e383b7dd30dbb026` |
| D1 | `distilled-news-joud`, ID `85d1c3a5-1004-4cfc-9da1-dd5a87dab9a2` |
| Implementation deployment | `07319d19-e9a8-49ef-b2c4-91e61452fa54` |

Retain dedicated D1/R2/queues/VPC/helper bindings and the intended functional app
settings. Do not point Joud at another deployment's user database or background
queues during a code merge. Resource references are not portable secrets and must
be reviewed for the deployment actually being integrated. A Git merge neither
copies remote data nor provisions credentials. Do not clear accounts, feeds,
stored artwork, article evidence or sessions as part of integration.

`apps/worker/dist-joud` is historical generated output, not the active source of
truth. Rebuild current source using the intended config. Do not deploy an old
bundle just because it merges cleanly. Frontend build is `apps/web/dist`.

## 13. Required acceptance checks before calling the merge preserved

Run affected checks on the MERGED result, not just either input branch. Respect
the project's package manager/lockfile and existing compatibility configuration.
Commands below are local tests/builds, not permission for live paid checks.

```powershell
corepack pnpm --filter @distilled/core exec vitest run test/username.test.ts
corepack pnpm --filter @distilled/web test
corepack pnpm --filter @distilled/worker exec vitest run src/app.test.ts src/mailer.test.ts src/manifest-icons.test.ts
corepack pnpm --filter @distilled/web typecheck
corepack pnpm --filter @distilled/worker typecheck
corepack pnpm --filter @distilled/web build
```

Also run acquisition/connector suites for any shared source-recovery edits; use
their individual report commands. Do not run optional private replay fixtures
without the real retained inputs, or claim skipped tests as passed live checks.

Browser/manual acceptance matrix:

| Area | Minimum cases and assertions |
| --- | --- |
| Screen/layout | 320/390/720 mobile, 1280 short laptop, 1920 desktop; expanded/collapsed sidebar; light/dark; en/fr/ar. No internal card or horizontal clipping; all controls reachable. |
| Home/Explore | Same sizing and artwork; 72px desktop / 56px mobile stays stable across sidebar states; normal row gaps; full-page scrolling; long English/French/Arabic titles. |
| Navigation/headings | Home-right/Settings-left only on Arabic mobile; all three title tops aligned; desktop rail preserved. |
| Reader | Empty and populated; bounded search without summary button; centered toolbar but left/content-aligned Summary/Today; no Source details or orphan divider; actual current blockers still visible. |
| Dropdowns | All three languages; options numeric/localized; menu width matches trigger within 1px, above/below 6px gap, scroll bounds, keyboard/outside/Escape/focus; role trigger white/grey, feed triggers lavender. |
| Preferences | Single continuous card; only Schedule/General divider; icons without tiles; Daily time visual match and working value. |
| Arabic | Profile/order/chevrons, primary-right footer, terminal punctuation, centered reset headings; logo/header exceptions preserved. |
| Auth/users | Arabic/French/English signup and rename, NFC accents, old/new encoded public URLs and duplicate availability; initials max two, Arabic separated. Use isolated test accounts/fixtures. |
| Email | Both message types in en/fr/ar, full transparent mark LEFT of brand even RTL; accent button; links point to intended frontend and carry selected lang. Prefer mocked previews before any authorized delivery. |
| Offline | Install actual SW online, set site language different from browser, disable network and navigate; title/message/button/dir correct, illustration self-contained, inner card borderless/soft. |
| PWA/icons | Actual dynamic mobile/desktop manifests, self-related identity, transparent notification assets, unchanged white mobile icon, white splash background. Clearly distinguish browser fixtures from physical Android testing. |

Evidence already obtained on the source branch:

- Unicode change: 63 Worker app tests passed, one shared-normalization regression
  passed, frontend build passed. Arabic/French creation/rename/encoded aliases
  covered. Mobile nav measured en/fr/ar at 360/390/720px (nine cases).
- Initials change: focused Arabic/French/English regression and frontend build
  passed. Live frontend assets matched the validated build.
- Final Settings correction: actual heading top measured equal on Home, Explore
  and Settings at 390px and 1280px, English and Arabic (four combinations). Live
  JS/CSS matched the validated build after deployment.
- Earlier checks include real service-worker offline navigation at two widths in
  three languages, dropdown/browser keyboard checks, mailer/API tests, mocked email
  previews, profile/RTL/header comparisons and source regression suites. Their
  dated reports identify which checks ran for each change; they are not a claim
  the entire repository or every live publisher was retested at the latest commit.

Ignored local Playwright scripts/screenshots under `.local-reports/live-check`
are useful local evidence but are NOT guaranteed to exist in another checkout.
Tracked tests, source snapshot, inventory and dated reports are the portable
handoff. Recreate visual checks where those artifacts are unavailable.

## Final merge report to give Joud

Report input SHAs, integration SHA, any protected-path differences and their
feature-level reasons, tests actually run, visual matrix results and remaining
unverified behavior. Explicitly state whether anything was deployed, which
deployment/config was used and whether remote data/secrets changed. If a detail
above cannot be preserved, do not silently drop it or describe the merge as fully
preserving Joud's work.
