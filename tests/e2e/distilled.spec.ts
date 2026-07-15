import { expect, test } from "@playwright/test";

const briefing = {
  id: "briefing_default",
  ownerAccountId: "account_1",
  ownerUsername: "ammar-mohanna",
  slug: "personal",
  title: "Personal Briefing",
  stars: 0,
  interestProfile: "Track Lebanese infrastructure and public safety.",
  styleInstruction: "Use calm wording.",
  publicFeedEnabled: true,
  paused: false,
  language: "en",
  intensity: "low",
  briefingCadence: "hourly",
  briefingTimeOfDay: "09:00",
  briefingTimezone: "Asia/Beirut",
  nextBriefingAt: "2026-06-16T09:00:00.000Z",
  retentionDays: 15
};

const item = {
  id: "item_1",
  clusterId: "cluster_1",
  summary: "Electricite du Liban confirmed two extra hours of power supply tonight.",
  itemAt: "2026-06-16T08:00:00.000Z",
  updatedAt: "2026-06-16T08:02:00.000Z",
  expiresAt: "2026-07-01T08:00:00.000Z",
  mergedUpdateCount: 1,
  evidence: [
    {
      messageId: "telegram_1",
      sourceId: "telegram_-100123",
      sourceTitle: "Beirut Local",
      sourceType: "channel",
      sourceUrl: "https://t.me/beirutlocal/2",
      postedAt: "2026-06-16T08:00:00.000Z",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight.",
      links: ["https://example.test/power"],
      media: [{ type: "photo", url: "https://example.test/power.jpg", label: "source photo" }]
    }
  ]
};

const edition = {
  id: "edition_1",
  briefingId: "briefing_default",
  cadence: "hourly",
  windowStart: "2026-06-16T07:00:00.000Z",
  windowEnd: "2026-06-16T08:00:00.000Z",
  title: "Verified updates",
  summary: item.summary,
  sections: [
    {
      title: "Infrastructure",
      summary: item.summary,
      evidence: item.evidence
    }
  ],
  status: "published",
  publishedAt: "2026-06-16T08:00:00.000Z",
  createdAt: "2026-06-16T08:02:00.000Z",
  updatedAt: "2026-06-16T08:02:00.000Z"
};

const publicSurfaceEdition = {
  ...edition,
  summary:
    "Electricite du Liban confirmed two extra hours of power supply tonight [1]. Municipal crews said the change applies before midnight [1]. A third operational note stays in the full brief [1].",
  sections: [
    {
      title: "Infrastructure",
      summary:
        "Electricite du Liban confirmed two extra hours of power supply tonight. Municipal crews said the change applies before midnight. A third operational note stays in the full brief.",
      evidence: item.evidence
    }
  ]
};

const arabicBriefing = {
  ...briefing,
  title: "أخبار لبنان",
  language: "ar"
};

const arabicEdition = {
  ...edition,
  title: "تحديثات موثوقة",
  summary: "تحديثات موثوقة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة [1].",
  sections: [
    {
      title: "بنية تحتية",
      summary: "أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة.",
      evidence: item.evidence
    }
  ]
};

const editorialEdition = {
  ...edition,
  id: "edition_editorial",
  summary:
    "The coastal road and airport runway reopened after separate inspections and maintenance [1] [2]. The central bank kept its policy rate unchanged this month [3].",
  sections: Array.from({ length: 10 }, (_, index) => ({
    title: index === 0 ? "Coastal road reopens" : index === 1 ? "Airport runway reopens" : index === 2 ? "Policy rate unchanged" : `Additional update ${index - 2}`,
    summary: index === 0
      ? "The army reopened the coastal road after completing a security inspection. Traffic resumed in both directions."
      : index === 1
        ? "The airport reopened its eastern runway after scheduled maintenance."
        : index === 2
          ? "The central bank announced that its policy rate will remain unchanged this month."
          : `The public authority confirmed operational update number ${index + 1} after completing its review.`,
    evidence: [{ ...item.evidence[0], messageId: `evidence_${index + 1}`, sourceTitle: `Source ${index + 1}` }],
    tier: index < 3 ? "top" : "additional"
  }))
};

const feedEditions = Array.from({ length: 25 }, (_, index) => ({
  ...edition,
  id: `edition_${index + 1}`,
  summary: `Published briefing item ${index + 1}.`,
  windowStart: new Date(Date.UTC(2026, 5, 16, 7, 0 - index, 0)).toISOString(),
  windowEnd: new Date(Date.UTC(2026, 5, 16, 8, 0 - index, 0)).toISOString(),
  publishedAt: new Date(Date.UTC(2026, 5, 16, 8, 0 - index, 0)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 5, 16, 8, 2 - index, 0)).toISOString(),
  sections: []
}));

const exploreFeeds = [
  {
    ...briefing,
    id: "briefing_city_watch",
    ownerAccountId: "account_city",
    ownerUsername: "city-user",
    slug: "city-watch",
    title: "City Watch",
    stars: 12
  },
  {
    ...briefing,
    id: "briefing_regional",
    ownerAccountId: "account_regional",
    ownerUsername: "regional-user",
    slug: "regional-briefing",
    title: "Regional Briefing",
    stars: 7
  }
];

const firstRunBriefing = {
  ...briefing,
  publicFeedEnabled: false,
  interestProfile:
    "Track Lebanese security, economy, infrastructure, public safety, and major regional events. Ignore routine political statements unless they change concrete facts.",
  styleInstruction: "Use calm, balanced wording."
};

test("homepage starts with an interest and carries it into signup", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, setupRequired: false })
    });
  });
  await page.route("**/api/auth/register", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: exploreFeeds }) });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await expect(page.getByRole("link", { name: "briefings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Know what matters. Skip everything else." })).toBeVisible();
  await expect(page.getByLabel("What do you want to follow?")).toBeVisible();
  await expect(page.getByRole("link", { name: /City Watch/ })).toHaveAttribute("href", "/city-user/city-watch/");
  await page.getByLabel("What do you want to follow?").fill("AI research and regulation");
  await page.getByRole("button", { name: "Create my briefing" }).click();
  await expect(page.getByRole("button", { name: /^create account$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^register$/ })).toHaveCount(0);
  await page.getByLabel("email").fill("ammar@example.com");
  await page.getByLabel("username").fill("Ammar Mohanna");
  await page.getByLabel("password").fill("password123");
  await page.getByRole("button", { name: /^create account$/ }).click();
  await expect(page.getByText(/verification email sent/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("dn_pending_interest"))).toBe("AI research and regulation");
});

test("email verification waits for an explicit user action", async ({ page }) => {
  let verifyCalls = 0;
  await page.route("**/api/auth/verify-email", async (route) => {
    verifyCalls += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        account: {
          id: "account_1",
          email: "ammar@example.com",
          username: "ammar-mohanna",
          role: "user",
          emailVerifiedAt: "2026-06-16T08:00:00.000Z"
        }
      })
    });
  });

  await page.goto("/verify-email?token=test-token");

  await expect(page.getByRole("button", { name: "verify email" })).toBeVisible();
  expect(verifyCalls).toBe(0);

  await page.getByRole("button", { name: "verify email" }).click();
  await expect(page.getByText("email verified")).toBeVisible();
  expect(verifyCalls).toBe(1);
});

test("feed uses one hourly view with evidence and a single options menu", async ({ page }) => {
  let sessionRequests = 0;
  await page.route("**/api/auth/session", async (route) => {
    sessionRequests += 1;
    await route.abort();
  });
  await page.route("**/api/feed/ammar-mohanna/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefing,
        editions: [{ ...publicSurfaceEdition, sections: [] }],
        viewerHasStarred: false
      })
    });
  });
  await page.route("**/api/feed/ammar-mohanna/personal/editions/edition_1", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ edition: publicSurfaceEdition }) });
  });
  await page.route("**/api/feed/ammar-mohanna/personal/search?q=power%20supply", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ editions: [publicSurfaceEdition] }) });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: exploreFeeds }) });
  });

  await page.goto("/ammar-mohanna/personal/");

  await expect(page.getByRole("link", { name: "Distilled.news" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal Briefing" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Digest|Timeline/ })).toHaveCount(0);
  await expect(page.locator(".page-heading .status-dot.live")).toBeVisible();
  await expect(page.getByText(/Hourly · next brief/)).toBeVisible();
  await expect(page.getByRole("button", { name: /brief now|refresh/i })).toHaveCount(0);
  await expect(page.getByText("by ammar-mohanna")).toBeVisible();
  expect(sessionRequests).toBe(0);
  await page.getByRole("button", { name: "options" }).click();
  await expect(page.getByPlaceholder("search published briefing")).toBeVisible();
  await expect(page.getByRole("button", { name: /explore/i })).toHaveAttribute("title", "explore feeds");
  await expect(page.locator(".news-item").filter({ hasText: "Electricite du Liban confirmed two extra hours" }).first()).toBeVisible();
  await expect(page.getByText("A third operational note stays in the full brief").first()).toBeVisible();
  await expect(page.getByText(/confidence|source count|breaking/i)).toHaveCount(0);
  await page.getByRole("button", { name: "options" }).click();

  await expect(page.locator(".news-meta").first()).not.toContainText("updates");

  await page.getByRole("button", { name: /show .*updates/i }).first().click();
  await expect(page.getByText("A third operational note stays in the full brief").first()).toBeVisible();
  await expect(page.locator(".reference-digest-row").first()).toBeVisible();
  await expect(page.locator(".brief-synthesis-text")).toHaveCount(0);
  await page.getByRole("button", { name: /open reference 1/i }).first().click();
  const reportDialog = page.getByRole("dialog", { name: "report" });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog.getByText("Beirut Local")).toBeVisible();
  await expect(reportDialog.getByRole("link", { name: /original/i })).toHaveAttribute("href", item.evidence[0].sourceUrl);
  await page.getByRole("button", { name: "close report" }).click();

  await page.getByRole("button", { name: "options" }).click();
  await page.getByPlaceholder("search published briefing").fill("power supply");
  await page.keyboard.press("Enter");
  await expect(page.locator(".news-item").filter({ hasText: "Electricite du Liban confirmed two extra hours" }).first()).toBeVisible();

  await page.getByRole("button", { name: /explore/i }).click();
  await expect(page.getByRole("dialog", { name: "explore" })).toBeVisible();
  await expect(page.getByRole("link", { name: /City Watch/ })).toHaveAttribute("href", "/city-user/city-watch/");
  expect(sessionRequests).toBe(0);
});

test("editorial edition shows three top stories, a compact remainder, and clickable citations", async ({ page }) => {
  await page.route("**/api/feed/ammar-mohanna/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ briefing, editions: [{ ...editorialEdition, sections: [] }], viewerHasStarred: false })
    });
  });
  await page.route("**/api/feed/ammar-mohanna/personal/editions/edition_editorial", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ edition: editorialEdition }) });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: [] }) });
  });

  await page.goto("/ammar-mohanna/personal/");
  await expect(page.locator(".news-summary").getByRole("button", { name: "open reference 1" })).toBeVisible();
  await expect(page.locator(".news-summary").getByRole("button", { name: "open reference 3" })).toBeVisible();
  await page.getByRole("button", { name: /show verified updates/i }).click();

  await expect(page.getByText("top stories")).toBeVisible();
  await expect(page.locator(".brief-synthesis > .reference-digest-list .reference-digest-row")).toHaveCount(3);
  await expect(page.getByText("7 additional updates")).toBeVisible();
  await expect(page.getByText("Additional update 1").first()).toBeHidden();
  await page.getByText("7 additional updates").click();
  await expect(page.locator(".additional-updates .reference-digest-row")).toHaveCount(7);
  await expect(page.locator(".reference-digest-summary").filter({ hasText: "Traffic resumed in both directions." })).toBeVisible();

  await page.locator(".news-summary").getByRole("button", { name: "open reference 2" }).click();
  const reportDialog = page.getByRole("dialog", { name: "report" });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog.getByText("Source 2")).toBeVisible();
});

test("arabic feed keeps public chrome localized and summary stable on expand", async ({ page }, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 1336, height: 768 });
  }

  await page.route("**/api/feed/ammar-mohanna/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefing: arabicBriefing,
        editions: [{ ...arabicEdition, sections: [] }],
        viewerHasStarred: false
      })
    });
  });
  await page.route("**/api/feed/ammar-mohanna/personal/editions/edition_1", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ edition: arabicEdition }) });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: [] }) });
  });

  await page.goto("/ammar-mohanna/personal/");

  await expect(page.getByRole("button", { name: /^تحديث$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "خيارات" }).click();
  await expect(page.getByRole("button", { name: /استكشاف/ })).toBeVisible();
  await expect(page.getByPlaceholder("ابحث في الموجز المنشور")).toBeVisible();
  await expect(page.getByText("بواسطة ammar-mohanna")).toBeVisible();
  await expect(page.getByText("تحديثات موثوقة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة").first()).toBeVisible();

  const menuBox = await page.locator(".feed-menu-popover").boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1336);
  await page.getByRole("button", { name: "خيارات" }).click();

  await page.getByRole("button", { name: /عرض تحديثات موثوقة/i }).click();
  await expect(page.getByText("تحديثات موثوقة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة").first()).toBeVisible();
  await expect(page.locator(".news-summary").filter({ hasText: "تحديثات موثوقة" })).toHaveCount(1);
  await expect(page.getByText("المراجع")).toBeVisible();
  await expect(page.getByText("refresh")).toHaveCount(0);
  await expect(page.getByText("Explore")).toHaveCount(0);
  await expect(page.getByText("search published briefing")).toHaveCount(0);
});

test("feed shows twenty hourly briefs and loads older briefs on demand", async ({ page }) => {
  await page.route("**/api/feed/ammar-mohanna/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefing,
        editions: feedEditions,
        viewerHasStarred: false
      })
    });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: exploreFeeds }) });
  });

  await page.goto("/ammar-mohanna/personal/");

  const visibleBriefs = page.locator(".hourly-briefs .news-item");
  await expect(visibleBriefs).toHaveCount(20);
  await expect(page.getByText("Published briefing item 20.")).toBeVisible();
  await expect(page.getByText("Published briefing item 21.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "load more" })).toBeVisible();

  await page.getByRole("button", { name: "load more" }).click();
  await expect(visibleBriefs).toHaveCount(25);
  await expect(page.getByText("Published briefing item 25.")).toBeVisible();
});

test("admin setup keeps account settings tucked behind subtle controls", async ({ page }) => {
  const savedBriefings: Array<typeof briefing> = [];
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        setupRequired: false,
        account: {
          id: "account_1",
          email: "ammar@example.com",
          username: "ammar-mohanna",
          role: "admin",
          emailVerifiedAt: "2026-06-16T08:00:00.000Z"
        }
      })
    });
  });
  await page.route("**/api/me/briefings", async (route) => {
    if (route.request().method() === "POST") {
      savedBriefings.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ briefing: JSON.parse(route.request().postData() ?? "{}") })
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ briefings: [briefing] }) });
  });
  await page.route("**/api/me/sources?briefingId=briefing_default", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sources: [
          {
            id: "telegram_-100123",
            briefingId: "briefing_default",
            title: "Beirut Local",
            type: "channel",
            provider: "telegram",
            kind: "telegram_channel",
            enabled: false,
            lastSeenAt: "2026-06-16T08:00:00.000Z"
          }
        ]
      })
    });
  });
  await page.route("**/api/me/health?briefingId=briefing_default", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        health: {
          lastSourceEventAt: "2026-06-16T08:00:00.000Z",
          latestPublishedAt: "2026-06-16T08:05:00.000Z",
          processing: { queued: 0, completed: 1, failed: 1 }
        }
      })
    });
  });
  await page.route("**/api/admin/accounts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accounts: [
          {
            id: "account_1",
            email: "ammar@example.com",
            username: "ammar-mohanna",
            role: "admin",
            emailVerifiedAt: "2026-06-16T08:00:00.000Z",
            briefingCount: 1
          }
        ]
      })
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "briefings" })).toBeVisible();
  await expect(page.getByText("Manage your feeds and sources.")).toBeVisible();
  await expect(page.getByLabel("interest profile")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "account settings" })).toHaveAttribute("title", "account settings");
  await expect(page.getByRole("button", { name: "feed settings for Personal Briefing" })).toHaveAttribute("title", "feed settings");
  await expect(page.getByRole("button", { name: "fetch latest" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "fetch latest" })).toHaveAttribute("title", "refresh");
  const commandOpenFeed = page.locator(".command-panel .primary-button");
  await expect(commandOpenFeed.locator("svg")).toBeVisible();
  await expect(page.locator(".brand-logo")).toBeVisible();
  expect(await commandOpenFeed.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(29, 29, 31)");
  expect(await commandOpenFeed.locator("svg").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(255, 255, 255)");
  expect(await commandOpenFeed.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await commandOpenFeed.locator("svg").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(18);
  expect(await page.locator(".feed-row.active").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(245, 245, 247)");
  await page.getByRole("button", { name: "switch to dark mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.locator(".brand-logo").evaluate((element) => getComputedStyle(element).filter)).not.toBe("none");
  await page.getByRole("button", { name: "switch to light mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await expect(page.getByPlaceholder("https://t.me/LebUpdate, https://x.com/NASA, or Lebanon electricity")).toBeVisible();
  await expect(page.getByRole("button", { name: "Telegram URL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "X URL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search topic" })).toBeVisible();
  await expect(page.locator(".health-summary .status-dot.live")).toBeVisible();
  await expect(page.getByRole("button", { name: "retry processing" })).toHaveCount(0);
  await page.locator(".health-summary > summary").click();
  await expect(page.getByRole("button", { name: "retry processing" })).toBeVisible();
  await page.getByRole("button", { name: "feed settings for Personal Briefing" }).click();
  await expect(page.getByRole("dialog", { name: "feed settings" })).toBeVisible();
  await expect(page.getByLabel("interest profile")).toBeVisible();
  const feedSettingsDialog = page.getByRole("dialog", { name: "feed settings" });
  await expect(feedSettingsDialog.getByText("intensity")).toHaveCount(0);
  await expect(feedSettingsDialog.getByLabel("feed intensity")).toHaveCount(0);
  await expect(feedSettingsDialog.getByText("briefing time")).toHaveCount(0);
  await expect(feedSettingsDialog.getByText("monthly")).toHaveCount(0);
  await expect(feedSettingsDialog.getByRole("button", { name: "weekly" })).toBeVisible();
  await expect(page.getByLabel("public feed")).toHaveCount(0);
  await expect(page.getByText("retention days")).toHaveCount(0);
  await page.getByLabel("title").fill("Local Briefing");
  await expect.poll(() => savedBriefings.some((saved) => saved.title === "Local Briefing")).toBe(true);
  await page.getByRole("button", { name: "close feed settings" }).click();
  await expect(page.getByLabel("username")).toHaveCount(0);
  await page.getByRole("button", { name: "account settings" }).click();
  await expect(page.getByRole("dialog", { name: "account" })).toBeVisible();
  await expect(page.getByLabel("username")).toHaveValue("ammar-mohanna");
  await expect(page.getByLabel("current password")).toBeVisible();
  await expect(page.getByLabel("new password")).toBeVisible();
  await page.getByRole("button", { name: "close account settings" }).click();
  await expect(page.getByRole("link", { name: "open Local Briefing", exact: true })).toHaveAttribute(
    "href",
    "/ammar-mohanna/local-briefing/"
  );
  await expect(page.getByText("private", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "feed help" }).click();
  await expect(page.getByRole("dialog", { name: "feed help" })).toBeVisible();
  await expect(page.getByText("Paste a Telegram or X URL, or type a search topic.")).toBeVisible();
  await expect(page.getByText("Copy the feed URL when you want someone to read it.")).toBeVisible();
  await page.getByRole("button", { name: "close feed help" }).click();
  await expect(page.getByText("Beirut Local")).toBeVisible();
  await expect(page.getByRole("heading", { name: "accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "manage ammar-mohanna" })).toHaveCount(0);
  await page.locator(".accounts-summary").click();
  await page.getByRole("button", { name: "manage ammar-mohanna" }).click();
  await expect(page.getByRole("dialog", { name: "manage account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "disable account" })).toBeVisible();
});

test("first-run setup sheet creates the first feed and source", async ({ page }) => {
  let savedBriefing: typeof briefing | undefined;
  let sourceBody: { briefingId: string; input: string } | undefined;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        setupRequired: false,
        account: {
          id: "account_1",
          email: "ammar@example.com",
          username: "ammar-mohanna",
          role: "user",
          emailVerifiedAt: "2026-06-16T08:00:00.000Z"
        }
      })
    });
  });
  await page.route("**/api/me/briefings", async (route) => {
    if (route.request().method() === "POST") {
      savedBriefing = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ briefing: savedBriefing }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ briefings: [firstRunBriefing] }) });
  });
  await page.route("**/api/me/account", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        account: {
          id: "account_1",
          email: "ammar@example.com",
          username: "ammar-news",
          role: "user",
          emailVerifiedAt: "2026-06-16T08:00:00.000Z"
        },
        briefings: [{ ...firstRunBriefing, ownerUsername: "ammar-news" }]
      })
    });
  });
  await page.route("**/api/me/source-suggestions", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ degraded: false, suggestions: [{
      id: "beirut-local", title: "Beirut Local", description: "Local infrastructure reporting.", provider: "rss", kind: "rss_feed",
      input: "rss: https://example.com/beirut.xml", homepageUrl: "https://example.com", language: "en", region: "LB",
      reason: "Strong local coverage", origin: "curated", confidence: "high", alreadyAdded: false
    }] }) });
  });
  await page.route("**/api/me/sources**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ sources: [] }) });
      return;
    }
    sourceBody = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sources: [
          {
            id: "telegram_-100123",
            briefingId: "briefing_default",
            title: "Beirut Local",
            type: "channel",
            provider: "telegram",
            kind: "telegram_channel",
            enabled: true,
            lastSeenAt: "2026-06-16T08:00:00.000Z"
          }
        ],
        health: {
          lastSourceEventAt: "2026-06-16T08:00:00.000Z",
          latestPublishedAt: undefined,
          processing: { queued: 1, completed: 0, failed: 0 }
        }
      })
    });
  });
  await page.route("**/api/me/health?briefingId=briefing_default", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        health: {
          lastSourceEventAt: undefined,
          latestPublishedAt: undefined,
          processing: { queued: 0, completed: 0, failed: 0 }
        }
      })
    });
  });
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "create your feed" })).toBeVisible();
  await page.getByLabel("interests").fill("Track Beirut infrastructure and public safety.");
  await page.getByRole("button", { name: "Find sources" }).click();
  await expect(page.getByText("Beirut Local")).toBeVisible();
  await page.getByLabel("add another source").fill("https://t.me/LebUpdate");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("feed name").fill("City Watch");
  await page.getByLabel("username").fill("Ammar News");
  await page.getByRole("button", { name: "Create feed" }).click();

  await expect.poll(() => savedBriefing?.title).toBe("City Watch");
  expect(savedBriefing?.publicFeedEnabled).toBe(true);
  expect(sourceBody).toEqual({ briefingId: "briefing_default", input: "https://t.me/LebUpdate" });
  await expect(page.getByRole("dialog", { name: "create your feed" })).toHaveCount(0);
});
