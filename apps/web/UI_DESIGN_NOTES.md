# September 2026 UI pass

The uploaded four-screen image guides this visual update. The v1.2 architecture,
service-boundary, and implementation documents provide future product context;
this change does not implement their backend, push, or offline requirements.

The authenticated app now uses Home, Explore, and Settings with bottom navigation
on desktop and mobile. Existing account, feed, source, and admin controls remain
available through Profile and Manage / Topics & sources. Public URLs and API
contracts are unchanged. Topic cards are discovery categories, while community
feed results come from the existing public explore endpoint. They do not claim
that topic templates or automatic topic subscriptions have been implemented.

The add-feed sheet retains the existing create-then-configure flow. Notifications
and install guidance explicitly distinguish current behavior from planned PWA
capabilities. No notification permission is requested.

## Artwork

Login and sign-up now reuse `public/home-globe.png`, anchored to the outer
page's bottom-right edge so the image's cropped sides meet the page boundary.
The separate full globe is no longer displayed.

Login and sign-up use `public/auth-globe.png`, generated with the built-in
imagegen tool. Prompt: a complete round pale lavender halftone Earth with
recognizable Europe, Africa and Asia, generous margins on every side, thin gold
orbital ellipses fully contained within the canvas, tiny purple nodes, one gold
sparkle, and a uniform near-white background; no cropping, text or wireframe.
It is displayed in normal document flow to keep the entire globe visible.

Local asset: `public/topic-atlas.png`.
Generated with the built-in imagegen tool. The Home orbital globe is generated
raster artwork at `public/home-globe.png`, replacing the original SVG approximation.
Its final edit prompt requested a pale lavender dotted Earth with recognizable
continents at the lower right, delicate gold orbit lines and stars, empty upper
left space, and a uniform `#fbf9fc` background with no checkerboard or wireframe.
Both images were created with the built-in imagegen tool.

The latest Home globe was regenerated from the desktop reference: fine pale
lavender halftone continents, an oversized globe cropped at the lower right,
thin diagonal gold orbital arcs, tiny purple nodes, one gold star, and a clean
off-white background. It uses `public/home-globe.png` and the built-in imagegen
tool. Desktop navigation is now a left sidebar; mobile retains bottom navigation.
Existing accounts use the person icon because the account API does not currently
provide profile photos or photo uploads.
The original `public/logo.svg` is tinted gold using a CSS mask; its shape is
unchanged. No new remote image or font dependencies are used.

Final generation prompt:

> Create a single rectangular texture atlas for a news app's six topic thumbnails.
> Perfectly equal 3 columns and 2 rows, NO gaps, NO borders, NO text, NO labels,
> NO UI. Overall aspect ratio 3:2. Each tile exactly one square. Top left:
> photorealistic Lebanese Mediterranean rocky coast and turquoise bay, distant
> mountains in warm morning light. Top middle: cinematic planet Earth from space
> with glowing blue atmosphere, Africa Europe visible. Top right: luminous
> intertwined violet and electric blue flowing abstract loops on deep indigo.
> Bottom left: elegant modern financial city skyline with sea and hazy peach blue
> morning light. Bottom middle: glossy translucent cyan molecular ball-and-stick
> model on soft blue background. Bottom right: warm ivory and blush architectural
> arches with soft lavender shadows. Refined soft editorial photography and high
> quality 3D rendering, calm premium news app palette. Each image fills its exact
> tile edge to edge.
