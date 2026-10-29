# Android launch-screen background — 2026-10-29

The supplied screenshot is the Android-generated launch screen. The configured mobile icon intentionally has an opaque white backing, per the earlier launcher-icon requirement, while background_color was cream (#faf8f1). Changed the generated and static manifest launch background to white (#ffffff) to remove the visible square boundary without modifying mobile/Apple home-screen icons, desktop transparent icons, app identity, scope or start URL.

This is a visual background-match correction, not a change to icon alpha. Android/Chrome generates and caches its native splash from installed manifest metadata; a web deployment cannot force the installed WebAPK to redraw immediately. Physical-device launch rendering was not tested here. Existing Android installations can pick up manifest changes on a later native update.

Validation: both manifest tests and frontend build passed. Tests assert the white launch background and unchanged device-specific icon paths and app identity.

References: https://developer.chrome.com/docs/lighthouse/pwa/splash-screen and https://web.dev/articles/manifest-updates
