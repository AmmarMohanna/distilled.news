import { expect, test } from "@playwright/test";

const briefing = { id: "personal", ownerAccountId: "admin-id", ownerUsername: "admin", slug: "personal-briefing", title: "Personal Briefing", stars: 0, interestProfile: "Current events", publicFeedEnabled: true, paused: true, language: "en", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "UTC", retentionDays: 15 };

async function openBriefing(page: import("@playwright/test").Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/session" ? { authenticated: true, account: { id: "admin-id", username: "admin", role: "admin" } }
      : path === "/api/me/briefings" ? { briefings: [briefing] }
      : path === "/api/feed/admin/personal-briefing" ? { briefing, editions: [], viewerHasStarred: false }
      : path === "/api/explore/feeds" ? { feeds: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/admin/personal-briefing/");
  await expect(page.getByRole("heading", { name: "Personal Briefing" })).toBeVisible();
}

test("briefing detail follows the new hierarchy without changing its theme", async ({ page }) => {
  await openBriefing(page);
  await expect(page.locator(".page-heading")).toContainText("by admin");
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  await expect(page.locator(".feed-page-description")).toContainText("Your personalized briefing");
  await expect(page.getByRole("button", { name: "Edit feed settings" })).toBeVisible();
  const toolbar = page.locator(".feed-tools");
  await expect(toolbar.getByRole("button", { name: "Copy URL" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /Brief now/i })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /Explore/i })).toBeVisible();
  await expect(toolbar.getByPlaceholder("search published briefing")).toBeVisible();
  const empty = page.locator(".feed-empty-state");
  await expect(empty).toContainText("no published briefings");
  await expect(empty.locator(".feed-empty-icon")).toBeVisible();
  const emptyBounds = await empty.boundingBox();
  expect(emptyBounds).not.toBeNull();
  expect(emptyBounds!.y + emptyBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const control of await toolbar.locator("button, input").all()) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return { accent: root.getPropertyValue("--accent").trim(), page: root.getPropertyValue("--page").trim(), body: getComputedStyle(document.body).backgroundColor };
  });
  expect(colors.accent).toBe("#5e5ce6");
  expect(colors.page).toBe("#fff");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
