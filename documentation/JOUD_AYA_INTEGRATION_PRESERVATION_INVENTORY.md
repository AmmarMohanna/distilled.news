# Joud preservation inventory — 29 October 2026

Read [the normative handoff](JOUD_AYA_INTEGRATION_PRESERVATION_HANDOFF.md) first.

Protected implementation: `ae0e2d95532c15e8c4ee0c7a0cb52c6d8bb49d8b`.

Focused reporting landmark: `bbc631a` (Aya/Joud integration merge). This range is
a reporting aid, not permission to discard older protected frontend/artwork/
recommendations/configuration work. Every listed path must be reviewed after
integration, including clean automatic merges. Git blob IDs below allow exact
comparison; a differing shared file requires feature-level review, not automatic
rejection or a whole-file replacement.

## Commits after the landmark

```text
3443bbc Fix CBS discovery and add bounded public-only source recovery
97e9f51 Recover verified public canonical aliases and diagnose expired briefing permission
c6a86ba Record owner-approved one-dollar 24-hour briefing permission
b03f54a Fix partial liveblog and National News ingestion with precise source diagnostics
dbd355a Separate saved source diagnostics from current collection outages
0f90ba2 Accept short publisher-owned text as partial article evidence
686b780 Verify same-publisher public redirects without replacing article identities
6dc25fa Fix MTV article bodies and filter known publisher sections
f4755db Recover public National liveblogs and add reviewed unpaid browser recovery
a5363bb Bound resource fetching for exact CBS browser articles
2f4ae2e Support reviewed legacy Joud helper in CBS patch installer
5e9f856 Recover reviewed CBS duplicate after prior allowance exhaustion
ebc517a Add redacted read-only Cornell browser diagnostics
1c44241 Refine responsive controls and device-specific app branding
e3f9372 Align reader summary and show complete widget rows
2352750 Restore full-page scrolling and style authentication emails
1949ed8 Fit feed rows to viewport and complete offline and email branding
46aeb31 Remove artificial spacing before partial widget rows
a636012 Redesign password reset and fill interface translation gaps
0089af3 Remove offline illustration backdrop and replace title em dashes
4bb40f0 Add contrast to offline Wi-Fi card
832ee99 Soften offline Wi-Fi card without a border
ad2c00a Shrink widgets from available height to fit complete rows
e60be05 Keep widget artwork large and stable across sidebar states
84a7110 Match reset page to landing header and normal form scale
5a339bd Mirror profile dialog and directional controls in Arabic
a1115dc Localize schedule options and authentication email by request language
fdb53ae Repair served PWA relationship and remove manual installed confirmation
eb102c8 Bound reader search width when no briefings are published
6300d04 Style feed language and interval menus with shared accessible popovers
2b5130b Match dropdown fields to lavender design and menu width
3fbea3f Remove grey preference icon tiles and use accent color
d724968 Unify preferences card and style daily-time field consistently
d877da3 Keep one divider between Schedule and General preferences
cec82ef Place guest feed actions left of fixed landing header controls
02a2544 Match dropdown outer and selection corner rounding
72c1e61 Correct Arabic feed footer order and auth message direction
d110cad Mirror Arabic account management chevrons
3991b8a Round role filter and keep email logo left of brand in Arabic
556f88f Use a white surface for the role filter
7c3427c Use neutral grey role-filter border and chevron
694b4da Center recovery title and subtitle in RTL layouts
6fc9745 Remove mobile launch icon seam with matching white background
07e4f16 Localize offline page using saved website language
faa6a2d Support Unicode usernames and mirror Arabic mobile navigation
202d54d Keep Arabic avatar initials visually separate
ae0e2d9 Align Settings heading with Home and Explore
```

## Changed paths and protected snapshot tree entries

The first column is the path; the rest is the exact `git ls-tree` entry at the
protected implementation SHA. File lists include tests, recovery scripts and
dated evidence, not only UI code.

```text
.gitattributes	100644 blob dd8c469d62c9e4ca1ca6a2af516abfef6fbdcf3a	.gitattributes
apps/web/index.html	100644 blob c9abd426efa765a2b5ce6c0282f8150b0e4c1ea6	apps/web/index.html
apps/web/public/desktop-icon-192.png	100644 blob cc461c25c19e38deab625a8eed9f936721010107	apps/web/public/desktop-icon-192.png
apps/web/public/desktop-icon-512.png	100644 blob cf1d7503ddbb4a7a346e5eb8bbad8a17e1a58fbd	apps/web/public/desktop-icon-512.png
apps/web/public/email-logo.png	100644 blob 6613360dce695032926204bdd15f43b46b09db47	apps/web/public/email-logo.png
apps/web/public/manifest.webmanifest	100644 blob a3c3399f5e8dbb919e81943d0c36a6f41af51393	apps/web/public/manifest.webmanifest
apps/web/public/notification-badge.png	100644 blob 81f46a43b6ccc923e35b5e8a041565de75cf6797	apps/web/public/notification-badge.png
apps/web/public/notification-icon.png	100644 blob d9d2e81b65221b6d979975130b4aa29765f3f8a8	apps/web/public/notification-icon.png
apps/web/public/sw.js	100644 blob 383747068004c403ca888011fa5699b352306fce	apps/web/public/sw.js
apps/web/src/AdaptiveFeedGrid.test.ts	100644 blob ef47affcbca1c78c8e9c2d601f898a35a8873065	apps/web/src/AdaptiveFeedGrid.test.ts
apps/web/src/AdaptiveFeedGrid.tsx	100644 blob b4ae6a1c4106cb5a0e2d86278585af7053e62b26	apps/web/src/AdaptiveFeedGrid.tsx
apps/web/src/AppExperience.tsx	100644 blob 6ccb5a65a5e41075959b24c414fa081a0d405884	apps/web/src/AppExperience.tsx
apps/web/src/FeedEditor.test.tsx	100644 blob 2fd5c1ce52ada6b3f3fa2e3ee2ba314cef3a2c98	apps/web/src/FeedEditor.test.tsx
apps/web/src/FeedEditor.tsx	100644 blob 1b94624507d65b0dd2b4c4150ed41e50149bada5	apps/web/src/FeedEditor.tsx
apps/web/src/FeedLanguageSelect.tsx	100644 blob b8dda6402333b219b93201593e5cdbddf30c1d74	apps/web/src/FeedLanguageSelect.tsx
apps/web/src/LanguageControl.test.tsx	100644 blob e079d352aa637e7de6b005f9842789ce03a4e670	apps/web/src/LanguageControl.test.tsx
apps/web/src/LanguageControl.tsx	100644 blob feb7c475f4f48fa61d6f5cc001070f4cff7787b7	apps/web/src/LanguageControl.tsx
apps/web/src/SettingsDialogs.test.tsx	100644 blob 035700893fedd54e0bafcbe582d3eec7194f7038	apps/web/src/SettingsDialogs.test.tsx
apps/web/src/SettingsDialogs.tsx	100644 blob 92877da9cdeb383cb9d379afc39870504c622ee6	apps/web/src/SettingsDialogs.tsx
apps/web/src/SourceHealth.test.tsx	100644 blob cc401bd48f4e9e7eaf9138b8f34359dc784c510b	apps/web/src/SourceHealth.test.tsx
apps/web/src/SourceHealth.tsx	100644 blob 86d0ebcfad30765323535d45cf2c9606aa76df5b	apps/web/src/SourceHealth.tsx
apps/web/src/UnreadSummary.test.tsx	100644 blob e7a1696a92791c79522725dfb9eb89929614a9b1	apps/web/src/UnreadSummary.test.tsx
apps/web/src/UnreadSummary.tsx	100644 blob ff0f6d48abf7c0d7faa8aba3082d5a962cb4d6df	apps/web/src/UnreadSummary.tsx
apps/web/src/account-initials.test.ts	100644 blob bcd8480e96fa21d60e1a532d05593450bda12c11	apps/web/src/account-initials.test.ts
apps/web/src/api.test.ts	100644 blob 257d41ddd84fa948c08e21faeaa6603d21610034	apps/web/src/api.test.ts
apps/web/src/api.ts	100644 blob 4c2c5d4ed914305fed760e7ab01d2e950096ee0c	apps/web/src/api.ts
apps/web/src/apple.css	100644 blob 8fdcb6fe225c53505b08c556b984e64a02600961	apps/web/src/apple.css
apps/web/src/interface-translations.ts	100644 blob 5c0d5f9089b26f3c7ef55bdccb43a9b62799fea1	apps/web/src/interface-translations.ts
apps/web/src/main.tsx	100644 blob be4dae94abad489153d6e942d508c3be554998b8	apps/web/src/main.tsx
apps/web/src/offline-branding.test.ts	100644 blob bdd781901dfd18a1840781f4b92991af562152c2	apps/web/src/offline-branding.test.ts
apps/web/src/pwa.test.ts	100644 blob 407e3340590d518edaa0b79470705ee8ff2528f7	apps/web/src/pwa.test.ts
apps/web/src/pwa.ts	100644 blob f6597fd3d2b6c7b6b699e466c55e9703b0b11ee6	apps/web/src/pwa.ts
apps/web/src/source-acquisition-messages.ts	100644 blob 6537fe321a2b70a71632b398db2396df09a118ea	apps/web/src/source-acquisition-messages.ts
apps/web/src/styles.css	100644 blob 3d9a25b726040f2fc3ac6111a898db4afa69a1eb	apps/web/src/styles.css
apps/web/src/types.ts	100644 blob 9c08ac8def8fb6dca6071dc137366cdad497f130	apps/web/src/types.ts
apps/worker/src/app.test.ts	100644 blob 84e0e34732b53d324fe0c2ae88c877c8676d0314	apps/worker/src/app.test.ts
apps/worker/src/app.ts	100644 blob a4083be1cf102567d35efb4fac09d278057b731f	apps/worker/src/app.ts
apps/worker/src/auth.ts	100644 blob d87c15388da6e0770a32703e5c73de0baa4bd8c7	apps/worker/src/auth.ts
apps/worker/src/connector-availability.test.ts	100644 blob f17497cf32cf65adecfa48e54bf03430dbcd1cfd	apps/worker/src/connector-availability.test.ts
apps/worker/src/connector-availability.ts	100644 blob 97c8283426c4763abfbc4df66398aacc106ffc82	apps/worker/src/connector-availability.ts
apps/worker/src/connector-read-recovery.test.ts	100644 blob 0629916093cb820553574de36b32baf36380081a	apps/worker/src/connector-read-recovery.test.ts
apps/worker/src/connector-runtime.ts	100644 blob 1f6fdc992caad68e584e0ea89455035ee531ca2d	apps/worker/src/connector-runtime.ts
apps/worker/src/connector-scheduling.ts	100644 blob 59fbe28198907572bd8fd3f336a7d5d21af2a323	apps/worker/src/connector-scheduling.ts
apps/worker/src/mailer.test.ts	100644 blob 777e76f2f2654a42c6d3a1c6b8835ad765608fb8	apps/worker/src/mailer.test.ts
apps/worker/src/mailer.ts	100644 blob 521087365019210625d5e4738b166df43d236cc3	apps/worker/src/mailer.ts
apps/worker/src/manifest-icons.test.ts	100644 blob b9874087b798ac8d1978ea03d083b7e1994b79a9	apps/worker/src/manifest-icons.test.ts
apps/worker/src/unpaid-source-recovery.test.ts	100644 blob dc23c922c7fffcaeef22e008e884c34f98772749	apps/worker/src/unpaid-source-recovery.test.ts
apps/worker/src/unpaid-source-recovery.ts	100644 blob 23776a30a51232bcb07ca7450ab22c5f3e6c349a	apps/worker/src/unpaid-source-recovery.ts
apps/worker/src/v1-downstream-runtime.test.ts	100644 blob 996abb35291feb9328bd6efb7b138ea61d66575f	apps/worker/src/v1-downstream-runtime.test.ts
apps/worker/src/v1-downstream-runtime.ts	100644 blob cc9b5f5da3709fcd07d9f664189aa64cfb52454a	apps/worker/src/v1-downstream-runtime.ts
apps/worker/src/v1-intake/acquisition-router.ts	100644 blob 6cb60e2df5baf51b8fefdce65693aac1110b45eb	apps/worker/src/v1-intake/acquisition-router.ts
apps/worker/src/v1-intake/acquisition.test.ts	100644 blob f9198981a471e3953e9d30b3ee5a28d6866be896	apps/worker/src/v1-intake/acquisition.test.ts
apps/worker/src/v1-intake/acquisition.ts	100644 blob e1fd7863f542b68b07e7032188eb9d17086b8e67	apps/worker/src/v1-intake/acquisition.ts
apps/worker/src/v1-intake/article-fallback.test.ts	100644 blob 8a1d19506b0a381f27b8c690663b2918f4ea6ce5	apps/worker/src/v1-intake/article-fallback.test.ts
apps/worker/src/v1-intake/article-fallback.ts	100644 blob 79fb8db195a21088ea4d741e15d16137996bd987	apps/worker/src/v1-intake/article-fallback.ts
apps/worker/src/v1-intake/article-url-identity.test.ts	100644 blob db83ec03104113ed657f78c8fef3381ee5e854e6	apps/worker/src/v1-intake/article-url-identity.test.ts
apps/worker/src/v1-intake/article-url-identity.ts	100644 blob 10a4c75a9c272a8808e1b2c63b0284792fb1c79e	apps/worker/src/v1-intake/article-url-identity.ts
apps/worker/src/v1-intake/intake.ts	100644 blob 1ab4edc96ac8e3541d25bd7665393ccd03fd9560	apps/worker/src/v1-intake/intake.ts
apps/worker/src/v1-intake/national-liveblog.test.ts	100644 blob 7bbbf89ca5075b95e66d592a299b434e03b06813	apps/worker/src/v1-intake/national-liveblog.test.ts
apps/worker/src/v1-intake/national-liveblog.ts	100644 blob f4b8bb584a815567b25850a946bcbd1dc02f02c1	apps/worker/src/v1-intake/national-liveblog.ts
apps/worker/src/v1-intake/reviewed-redirect.ts	100644 blob 9238ac2bfe27f08e7a42cdab45e6344233fda91b	apps/worker/src/v1-intake/reviewed-redirect.ts
apps/worker/src/v1-intake/types.ts	100644 blob 706a5a5e6e5e682476b3a53ab30e3b8832751410	apps/worker/src/v1-intake/types.ts
docs/joud-android-launch-background-2026-10-29.md	100644 blob 13c50786396be4e05100bf97b53102b824d4456f	docs/joud-android-launch-background-2026-10-29.md
docs/joud-feed-dropdowns-2026-10-29.md	100644 blob 6524f879f3bdfdaa047185d4b8fb52fedff39d58	docs/joud-feed-dropdowns-2026-10-29.md
docs/joud-install-detection-2026-10-29.md	100644 blob b21303a59584b250c47ea6a0eb8f35c2de021b6b	docs/joud-install-detection-2026-10-29.md
docs/joud-liveblog-browser-recovery.md	100644 blob 4bf4b5ee575d005d1d57fa8dcca553e10ae969e3	docs/joud-liveblog-browser-recovery.md
docs/joud-operational-source-fixes.md	100644 blob 3b4b96c5f0bb507229e7e5965cb5f10010dbac87	docs/joud-operational-source-fixes.md
docs/joud-public-redirect-recovery.md	100644 blob 89ca564ab78f9d972cb1505c59a3116b9d5ba73d	docs/joud-public-redirect-recovery.md
docs/joud-public-source-repair-followup.md	100644 blob bc13d92641d8ef2dd7521c3059d2550af2ff11ba	docs/joud-public-source-repair-followup.md
docs/joud-reader-layout-followup-2026-10-29.md	100644 blob 15fac72f597b1072069d9aaaf1ecfb9824e26a5d	docs/joud-reader-layout-followup-2026-10-29.md
docs/joud-reset-language-2026-10-29.md	100644 blob 533bd3e3b15debb583f934c59c88b984b118cc82	docs/joud-reset-language-2026-10-29.md
docs/joud-responsive-branding-2026-10-29.md	100644 blob 0ae1996f803a10e97bed8edae192c7e33a81092c	docs/joud-responsive-branding-2026-10-29.md
docs/joud-short-article-recovery.md	100644 blob a97e2f1efcfabd2cac51b3b38838c8bd487e082c	docs/joud-short-article-recovery.md
docs/joud-source-followup.md	100644 blob ce839b8ac996a9c4976da497222f912a07a1ba63	docs/joud-source-followup.md
docs/joud-source-health-display.md	100644 blob 29d680a2eb7f0f98f97888e14f93021f5b09e40a	docs/joud-source-health-display.md
docs/joud-unpaid-source-recovery.md	100644 blob 028dd3bcee0d334631d2d819fe272320dccbfa51	docs/joud-unpaid-source-recovery.md
packages/connectors/src/source-runtime/primary-text.ts	100644 blob 2ff0b3b32aa982c02e6113a3c586b94444d87229	packages/connectors/src/source-runtime/primary-text.ts
packages/connectors/src/source-runtime/public-html.ts	100644 blob bd36cfedb4b75d80433b565a464d4947738d6339	packages/connectors/src/source-runtime/public-html.ts
packages/connectors/src/source-runtime/website-discovery.ts	100644 blob e6f9ba64bcf70fe67c77a965c12f58a0da5aa00a	packages/connectors/src/source-runtime/website-discovery.ts
packages/connectors/src/source-runtime/website-providers.ts	100644 blob 752f00e072d766b801eb4e6be40fc6c3e08b8a2f	packages/connectors/src/source-runtime/website-providers.ts
packages/connectors/test/primary-article-selection.test.ts	100644 blob 0fef4b6ca4debac71f7d496acb895ae7e8dce685	packages/connectors/test/primary-article-selection.test.ts
packages/connectors/test/publisher-article.test.ts	100644 blob 0117b0d481f700ee70ce12bb0947529b8e18550e	packages/connectors/test/publisher-article.test.ts
packages/connectors/test/website-discovery.test.ts	100644 blob 790dad4ba83d488cb6b48318abc49f5c613f0acd	packages/connectors/test/website-discovery.test.ts
packages/connectors/test/website-layout-discovery.test.ts	100644 blob d02dcb2708e13fb566a8db90184111b9162375f2	packages/connectors/test/website-layout-discovery.test.ts
packages/core/src/index.ts	100644 blob ce6c235a8e22ad347b0339a007977a098f44bfd4	packages/core/src/index.ts
packages/core/src/username.ts	100644 blob 4d1baa5ba9696b4f7dffed810bbb103e075d57ad	packages/core/src/username.ts
packages/core/test/username.test.ts	100644 blob ceb653b27ad1583a46de0b5206871b0ce62a5696	packages/core/test/username.test.ts
scripts/check-joud-cornell-browser.sh	100644 blob 9b25a36e4cf3d7f2949d9cdd0bb4900e606ec080	scripts/check-joud-cornell-browser.sh
scripts/recover-public-source-jobs.mjs	100644 blob ce4aa2790662ceac45c99498c530a8afd40a059e	scripts/recover-public-source-jobs.mjs
scripts/source-execution.py	100644 blob 2e72b5425b88b4e3a5ca343d1e0eaf66b9a9d933	scripts/source-execution.py
scripts/test_source_execution.py	100644 blob 28c111e1414085316f1ad842094511b400e554ac	scripts/test_source_execution.py
scripts/update-joud-browser-readiness.sh	100644 blob 26307e809c770db6e2e80906c5ed8661fcbce374	scripts/update-joud-browser-readiness.sh
scripts/update-joud-cbs-resource-policy.sh	100644 blob 945497a78853ddd033a0f4edb40f56d38f431ecf	scripts/update-joud-cbs-resource-policy.sh
```

## Recreate this inventory

```powershell
git log --reverse --oneline bbc631a..ae0e2d9
git diff --name-status bbc631a..ae0e2d9
git diff ae0e2d9..YOUR_INTEGRATION_SHA -- apps/web packages/core/src/username.ts apps/worker/src/app.ts apps/worker/src/auth.ts apps/worker/src/mailer.ts
```

Review all listed paths, not just the sample diff command above. Preserve source
history; do not use this inventory as a script to overwrite the merged tree.
