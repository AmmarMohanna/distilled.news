# Distilled.news magnifier trial

This unpacked Manifest V3 extension works only on:
https://distilled-news-joud.distillednews-platform.workers.dev

It uses the browser's `tabs.setZoomSettings` manual mode to turn browser-menu zoom into the site's visual magnification, from 100% to 400%. It does not change media rules or force wider pages. Wheel and Space+drag pan the enlarged view. The extension icon resets magnification to 100%. Other websites retain normal browser zoom. No browsing data is collected, stored or sent anywhere.

## Try it in Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (the folder containing `manifest.json`).
4. Refresh the Joud website. The extension resets previous native zoom to 100% when it takes control.
5. Open Edge's three-dot menu and try **Zoom +** at 125%, 175% and 200%. The percentage should change while the layout stays in place.
6. Try Ctrl +/−, Ctrl+0 and finger pinch as well.

Chrome uses the same steps at `chrome://extensions`.

To undo the trial, disable or remove the extension and refresh the website. Native browser zoom settings reset on navigation. Installation remains a manual browser-approved action. This is not a published store extension and is not installed for other visitors.

The site must include the `distilled:browser-zoom` bridge. Until that is ready, the extension leaves native zoom alone. Native touchpad pinch remains browser-controlled. The native menu itself is browser UI: automated validation uses the browser's actual zoom API rather than clicking that menu.

API reference: https://developer.chrome.com/docs/extensions/reference/api/tabs/#type-ZoomSettingsMode
