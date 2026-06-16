import { expect, test } from "@playwright/test";

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

test("demo runs without backend API calls", async ({ page }) => {
  let apiCalls = 0;
  await page.route("**/api/**", async (route) => {
    apiCalls += 1;
    await route.abort();
  });

  await page.goto("/demo");

  await expect(page.getByRole("heading", { name: "demo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "source posts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "published briefing" })).toBeVisible();
  await expect(page.getByText(/suppressed/)).toBeVisible();
  expect(apiCalls).toBe(0);
});

test("feed stays quiet while exposing evidence, refresh, and search", async ({ page }) => {
  await page.route("**/api/feed/personal", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefing: {
          id: "briefing_default",
          slug: "personal",
          title: "Personal Briefing",
          publicFeedEnabled: true,
          retentionDays: 15
        },
        items: [item]
      })
    });
  });
  await page.route("**/api/feed/personal/search?q=power%20supply", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [item] }) });
  });

  await page.goto("/feed/personal");

  await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  await expect(page.getByPlaceholder("search published briefing")).toBeVisible();
  await expect(page.locator(".news-item").filter({ hasText: item.summary }).first()).toBeVisible();
  await expect(page.getByText(/confidence|source count|breaking/i)).toHaveCount(0);

  await page.getByLabel(/show evidence/i).click();
  await expect(page.getByText("Beirut Local")).toBeVisible();
  await expect(page.getByRole("link", { name: /original/i })).toHaveAttribute("href", item.evidence[0].sourceUrl);

  await page.getByPlaceholder("search published briefing").fill("power supply");
  await page.keyboard.press("Enter");
  await expect(page.locator(".news-item").filter({ hasText: item.summary }).first()).toBeVisible();
});

test("admin setup shows interest profile, source detection, and health", async ({ page }) => {
  await page.route("**/api/admin/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, setupRequired: false })
    });
  });
  await page.route("**/api/admin/briefings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ contentType: "application/json", body: await route.request().postData()!.replace(/^/, "{\"briefing\":").concat("}") });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        briefings: [
          {
            id: "briefing_default",
            slug: "personal",
            title: "Personal Briefing",
            interestProfile: "Track Lebanese infrastructure and public safety.",
            styleInstruction: "Use calm wording.",
            publicFeedEnabled: false,
            retentionDays: 15
          }
        ]
      })
    });
  });
  await page.route("**/api/admin/sources", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sources: [
          {
            id: "telegram_-100123",
            briefingId: "briefing_default",
            title: "Beirut Local",
            type: "channel",
            enabled: false,
            lastSeenAt: "2026-06-16T08:00:00.000Z"
          }
        ]
      })
    });
  });
  await page.route("**/api/admin/health", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        health: {
          tokenConfigured: true,
          webhookRegistered: true,
          lastTelegramEventAt: "2026-06-16T08:00:00.000Z",
          processing: { queued: 0, completed: 1, failed: 0 }
        }
      })
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "admin" })).toBeVisible();
  await expect(page.getByLabel("interest profile")).toBeVisible();
  await expect(page.getByText("Beirut Local")).toBeVisible();
  await expect(page.getByText("registered")).toBeVisible();
});
