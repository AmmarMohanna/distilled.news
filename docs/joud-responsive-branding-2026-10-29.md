# Responsive branding and reader controls, 29 October 2026

Deployed to Joud, Worker version `7bc7feb0-b703-48e9-83a7-b7c5ee598b67`.

- Desktop installation manifests use new transparent PNGs rendered from the
  existing logo SVG. Mobile installation manifests retain the existing opaque
  white-backed icons, including the unchanged Apple touch icon. App IDs, feed
  start URLs and canonical domains are preserved. Selection uses the mobile
  client hint or mobile user-agent; manifests remain noncached.
- Notifications use a separate transparent color icon and transparent monochrome
  badge. They no longer reuse the white-backed mobile installation icon.
- Application metadata and page titles display Distilled.News. Existing installed
  app names/icons can remain cached by the browser/OS until metadata refresh or
  reinstallation. OS-provided notification decoration is outside the PNG asset.
- Offline navigation embeds an inline Wi-Fi-off SVG rather than the old embedded
  brand picture. It needs no network/cache image and retains translated copy.
- Reader search and both controls share a centered, at-most-1040px toolbar.
  The countdown has a matching subtle outline. The summary panel uses a very
  light accent tint. Phone controls wrap into the existing two-row layout.
- Home and Explore retain the same width-based widget sizing. Cards are capped
  at 440px, artwork is bounded to 44/56/72px, and content can grow vertically
  instead of being cropped. Titles and account names retain a stable type scale;
  header logo dimensions are unchanged.

Validation: 17 frontend tests and the device-specific manifest test passed;
frontend/Worker typechecks and production build passed. Browser checks used
mocked data, without live AI/provider calls: 15 English cases at widths 320,
390, 768, 1280 and 1920; six Arabic dark-mode cases and six French light-mode
cases at phone/desktop widths. All 27 had no horizontal/card overflow or page
errors, and Home/Explore widget dimensions agreed. Screenshots also checked the
offline illustration and summary styling. Pixel checks found transparent corners
on all new icons and white opaque corners on the retained mobile icons.

After deployment, real desktop/mobile manifest responses selected the intended
icons with the same app ID. Homepage/offline-worker branding checks passed, and
all four live PNGs matched the local generated assets by SHA-256. Screenshots,
fixture scripts and live-check metadata remain ignored in .local-reports.

## Offline page follows saved website language

The service-worker fallback now reads the existing dn_language preference inside its self-contained offline HTML and localizes title, heading, message, retry button and document direction. It needs no app bundle, translation request or network connection. The original browser-language fallback remains if storage is unavailable or has no supported choice. No authenticated responses or feed content are cached.

Validation: both offline-branding tests and frontend build passed. A local browser/service-worker integration installed the actual sw.js, set the website preference, disabled networking and navigated to /login. English, French and Arabic passed at 390px and 1280px widths using an English browser locale; all text followed the saved website choice with correct RTL and no overflow. Existing clients need to receive the updated service worker while online before the new fallback is available.
