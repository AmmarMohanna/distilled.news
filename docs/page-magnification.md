# Keyboard magnification

With focus inside the page, Ctrl/Cmd plus and minus adjust visual magnification from 1x to 4x. Ctrl/Cmd zero resets it; at 1x that shortcut passes through so a previous browser zoom can also be reset. Browser toolbar zoom remains browser-controlled. Start with browser zoom at 100%.

Only the root transform changes. No stylesheet media rules, minimum page widths or browser viewport dimensions are altered. The existing viewport clips the enlarged view without introducing horizontal scrollbars. Zoom anchors at the last pointer position (initially the center). Wheel/Shift+wheel pans vertically/horizontally; Space+drag or middle-button drag also pans. Translation is clamped to avoid exposing blank space. At a panning edge, wheel scrolling can continue into the page's normal scroll container. Native touchpad pinch events pass through. Native dialogs and top-layer popovers retain viewport positioning; feed menus reposition after magnification changes.

Validation includes keyboard/reset/native-pinch unit tests and a Chromium keyboard check at 1.75x: viewport width, device pixel ratio, root layout width, desktop controls and hidden outer overflow remain unchanged; panning changes translation; reset restores the original transform and controls remain clickable. Edge's toolbar zoom is not intercepted.
