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

test("public signup asks for email, username, and password", async ({ page }) => {
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
  await expect(page.getByRole("link", { name: "create" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "A calmer perspective on a complex world." })).toBeVisible();
  await page.getByRole("button", { name: "switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "switch to light mode" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "switch to light mode" }).click();
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("admin setup token")).toHaveCount(0);
  await page.getByLabel("password", { exact: true }).fill("preview-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.locator(".auth-tabs").getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("button", { name: /^create account$/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^register$/ })).toHaveCount(0);
  await page.getByLabel("email").fill("ammar@example.com");
  await page.getByLabel("username").fill("Ammar Mohanna");
  await page.getByLabel("password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(/verification email sent/i)).toBeVisible();
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

test("feed uses username-scoped URL while exposing evidence, refresh, and search", async ({ page }) => {
  let sessionRequests = 0;
  let feedPaused = false;
  let summaryRequests = 0;
  await page.route("**/api/auth/session", async (route) => {
    sessionRequests += 1;
    await route.abort();
  });
  await page.route("**/api/feed/ammar-mohanna/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefing: { ...briefing, paused: feedPaused },
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
  await page.route("**/api/feed/ammar-mohanna/personal/request-summary", async (route) => {
    summaryRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        edition: { ...publicSurfaceEdition, id: "edition_manual", sections: [] },
        message: "new brief published"
      })
    });
  });
  await page.route("**/api/explore/feeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ feeds: exploreFeeds }) });
  });

  await page.goto("/ammar-mohanna/personal/");

  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal Briefing" })).toBeVisible();
  await expect(page.getByText("waiting for the next accepted update.")).toBeVisible();
  await expect(page.getByRole("button", { name: /brief now/i })).toHaveAttribute("title", "create a brief since the last one");
  await page.getByRole("button", { name: /brief now/i }).click();
  await expect(page.getByText("new brief published.")).toBeVisible();
  expect(summaryRequests).toBe(1);
  feedPaused = true;
  await page.reload();
  await expect(page.getByText("feed paused; no new briefings will publish until it resumes.")).toBeVisible();
  await expect(page.getByText(/is due/i)).toHaveCount(0);
  await expect(page.getByText("by ammar-mohanna")).toBeVisible();
  await expect(page.getByRole("button", { name: /explore/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /explore/i })).toHaveAttribute("title", "explore feeds");
  expect(sessionRequests).toBeGreaterThan(0);
  await expect(page.getByPlaceholder("search published briefing")).toBeVisible();
  await expect(page.locator(".news-item").filter({ hasText: "Electricite du Liban confirmed two extra hours" }).first()).toBeVisible();
  await expect(page.getByText("A third operational note stays in the full brief")).toHaveCount(0);
  await expect(page.getByText(/confidence|source count|breaking/i)).toHaveCount(0);

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

  await page.getByPlaceholder("search published briefing").fill("power supply");
  await page.keyboard.press("Enter");
  await expect(page.locator(".news-item").filter({ hasText: "Electricite du Liban confirmed two extra hours" }).first()).toBeVisible();

  await page.getByRole("button", { name: /explore/i }).click();
  await expect(page.getByRole("dialog", { name: "explore" })).toBeVisible();
  await expect(page.getByRole("link", { name: /City Watch/ })).toHaveAttribute("href", "/city-user/city-watch/");
  expect(sessionRequests).toBeGreaterThan(0);
});

test("arabic feed keeps public chrome localized and summary stable on expand", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dn_language", "ar"));
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: false, setupRequired: false } }));
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

  await expect(page.getByRole("button", { name: /موجز الآن/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /استكشاف/ })).toBeVisible();
  await expect(page.getByPlaceholder("ابحث في الموجز المنشور")).toBeVisible();
  await expect(page.getByText("بواسطة ammar-mohanna")).toBeVisible();
  await expect(page.getByText("تحديثات موثوقة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة").first()).toBeVisible();

  await page.getByRole("button", { name: /عرض تحديثات موثوقة/i }).click();
  await expect(page.getByText("تحديثات موثوقة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة").first()).toBeVisible();
  await expect(page.locator(".news-summary").filter({ hasText: "تحديثات موثوقة" })).toHaveCount(1);
  await expect(page.getByText("المراجع")).toBeVisible();
  await expect(page.getByText("refresh")).toHaveCount(0);
  await expect(page.getByText("Explore")).toHaveCount(0);
  await expect(page.getByText("search published briefing")).toHaveCount(0);
});

test("feed shows twenty unread items and backfills when one is read", async ({ page }) => {
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

  const visibleUnread = page.locator(".news-line:not(.news-line-read) .news-item");
  await expect(visibleUnread).toHaveCount(20);
  await expect(page.getByText("Published briefing item 20.")).toBeVisible();
  await expect(page.getByText("Published briefing item 21.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "load more" })).toBeVisible();

  await visibleUnread.first().getByRole("button", { name: /mark .* read/i }).click();
  await expect(visibleUnread).toHaveCount(20);
  await expect(page.getByText("Published briefing item 21.")).toBeVisible();

  await page.getByRole("button", { name: "load more" }).click();
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

  await page.route("**/api/feed/ammar-mohanna/personal", route => route.fulfill({ json: { briefing, editions: [], viewerHasStarred: false } }));
  await page.route("**/api/me/feeds", async route => {
    const input = route.request().postDataJSON();
    savedBriefings.push(input);
    await route.fulfill({ json: { briefing: { ...briefing, ...input } } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Account profile", exact: true }).click();
  const accountDialog = page.getByRole("dialog", { name: "account", exact: true });
  await expect(accountDialog.getByLabel("username", { exact: true })).toHaveValue("ammar-mohanna");
  await expect(accountDialog.getByLabel("Current Password", { exact: true })).toBeHidden();
  await accountDialog.getByRole("button", { name: "Change Password", exact: true }).click();
  await expect(accountDialog.getByLabel("Current Password", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/ammar-mohanna/personal/?edit=1");
  const editor = page.getByRole("dialog", { name: "Edit feed settings", exact: true });
  await expect(editor.getByLabel("Feed name", { exact: true })).toHaveValue(briefing.title);
  await editor.getByLabel("Sources", { exact: true }).fill("https://t.me/LebUpdate");
  await editor.getByRole("button", { name: "Add source", exact: true }).click();
  await editor.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(editor.getByLabel("Visibility", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(savedBriefings).toHaveLength(1);
  expect(savedBriefings[0]).toMatchObject({ publicFeedEnabled: true, sourceInputs: ["https://t.me/LebUpdate"] });
});

test("first feed creation submits its source and configuration atomically", async ({ page }) => {
  let saved: any;
  const account = { id: "account_1", email: "ammar@example.com", username: "ammar-mohanna", role: "user", emailVerifiedAt: "2026-06-16T08:00:00.000Z" };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me/feeds" && route.request().method() === "POST") saved = { ...briefing, ...route.request().postDataJSON(), ownerUsername: account.username, slug: "city-watch" };
    const body = path === "/api/auth/session" ? { authenticated: true, setupRequired: false, account }
      : path === "/api/me/feeds" ? { briefing: saved }
      : path === "/api/me/briefings" ? { briefings: saved ? [saved] : [] }
      : path === "/api/explore/feeds" ? { feeds: [] }
      : path === "/api/me/sources" ? { sources: [] }
      : path.startsWith("/api/feed/") ? { briefing: saved, editions: [], viewerHasStarred: false }
      : { health: { processing: { queued: 0, completed: 0, failed: 0 } } };
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add feed" });
  await dialog.getByLabel("Feed name", { exact: true }).fill("City Watch");
  await dialog.getByLabel("What would you like to follow?", { exact: true }).fill("Track Beirut infrastructure and public safety.");
  await dialog.getByLabel("Sources", { exact: true }).fill("https://t.me/LebUpdate");
  await dialog.getByRole("button", { name: "Add source", exact: true }).click();
  await dialog.getByRole("button", { name: "Create feed", exact: true }).click();
  await expect(page).toHaveURL(/\/ammar-mohanna\/city-watch\/$/);
  expect(saved).toMatchObject({ title: "City Watch", publicFeedEnabled: true, sourceInputs: ["https://t.me/LebUpdate"] });
  await expect(page.getByRole("heading", { name: "City Watch" })).toBeVisible();
});
