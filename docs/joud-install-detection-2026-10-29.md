# Automatic installation detection repair — 2026-10-29

Removed the manual 'Already installed on this device' control and the function that let a user assertion mark installation as successful. The UI relies on standalone/iOS app mode, the actual appinstalled event and navigator.getInstalledRelatedApps where available. Accepted installation prompts still remain pending until completion is observed; stale local-storage hints do not prove installation after uninstall.

The production Worker generated a manifest without related_applications, although the static public manifest already had it. Added a self relationship with the actual absolute app identity to root and feed manifests, preserving existing id, start URL and icon selection. Browser detection matches related manifests on the current origin and supports feed manifest queries. Unsupported/unavailable detection produces an honest localized message without asking the person to declare whether installation happened.

Validated 107 frontend tests and 63 app/manifest tests, including browser-API simulations, stale hints, standalone mode, the no-confirmation dialog, Arabic fallback and the served manifest identity. Frontend and Worker typechecks and frontend build passed. Device installation itself was not performed on Joud's computer by these tests.

Reference: https://developer.chrome.com/docs/capabilities/get-installed-related-apps — same-origin PWA detection requires a declared self relationship and depends on browser/platform support.
