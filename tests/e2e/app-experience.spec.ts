import { expect, test } from "@playwright/test";

const briefing = {
  id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon",
  stars: 3, interestProfile: "Lebanon", styleInstruction: "Calm", publicFeedEnabled: true, paused: false,
  language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00",
  briefingTimezone: "Asia/Beirut", retentionDays: 15
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const payload = path === "/api/auth/session" ? { authenticated: true, setupRequired: false, account: { id: "joud", username: "Joud", email: "joud@example.test", role: "user" } }
      : path === "/api/me/briefings" ? { briefings: [briefing] }
      : path === "/api/explore/feeds" ? { feeds: [briefing] }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 1, failed: 0 }, latestPublishedAt: "2026-09-10T10:00:00Z" } } : {};
    await route.fulfill({ json: payload });
  });
});

test("home, explore and settings retain navigation and fit the viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back, Joud" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Your latest update is ready/ })).toHaveAttribute("href", "/joud/lebanon/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await page.getByRole("button", { name: "switch to dark mode" }).click();
  await navigation.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("heading", { name: "Popular topics" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("textbox", { name: "Search topics, sources, or keywords" }).fill("Lebanon");
  await expect(page.locator(".topic-grid .topic-card")).toHaveCount(1);
  await expect(page.locator(".community-feeds a")).toHaveCount(1);
  await page.getByRole("button", { name: "Add feed", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add feed" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add feed", exact: true })).toBeFocused();
  await navigation.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Notifications", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toContainText("planned for a future update");
  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Topics & sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manage feeds & sources" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("add feed cancellation performs no writes", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") writes.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toEqual([]);
});
