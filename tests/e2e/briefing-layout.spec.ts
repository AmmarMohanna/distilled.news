import { expect, test } from "@playwright/test";
import { refreshFeed } from "./helpers";

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

test("restored briefing layout preserves controls and theme", async ({ page }) => {
  await openBriefing(page);
  await expect(page.locator(".page-heading")).toContainText("by admin");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", {name:"Home"})).toBeVisible();
  await expect(page.locator(".feed-check-status")).toContainText("feed paused");
  const artwork=page.locator('.feed-hero-art .topic-art');
  const displayed=await artwork.boundingBox();
  const reserved=await page.locator('.feed-hero-art').boundingBox();
  const header=await page.locator('.experience-header').boundingBox();
  expect(displayed!.height).toBeGreaterThanOrEqual(80);
  expect(displayed!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(displayed!.y).toBeGreaterThanOrEqual(reserved!.y);
  expect(displayed!.y+displayed!.height).toBeLessThanOrEqual(reserved!.y+reserved!.height+1);
  const titleBounds=await page.locator('.page-heading h1').boundingBox();
  const authorBounds=await page.locator('.page-heading > p').boundingBox();
  const toolsBounds=await page.locator('.feed-empty-state').boundingBox();
  const actions = page.locator(".page-heading .feed-header-actions");
  const actionBounds=await actions.boundingBox();
  expect(authorBounds!.y-titleBounds!.y-titleBounds!.height).toBeLessThanOrEqual(8);
  expect(actionBounds!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  expect(actionBounds!.y).toBeGreaterThanOrEqual(authorBounds!.y+authorBounds!.height-1);
  expect(toolsBounds!.y-actionBounds!.y-actionBounds!.height).toBeGreaterThanOrEqual(0);
  await actions.getByLabel("Feed options").click();
  await expect(actions.getByRole("button", { name: "Share" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actions.getByRole("button", { name: /Star/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Brief now/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Explore/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Edit feed settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const toolbar = page.locator(".feed-tools");
  await expect(toolbar.getByPlaceholder("Search briefings")).toHaveCount(0);
  const empty = page.locator(".feed-empty-state");
  await expect(empty).toContainText("no published briefings");
  await expect(empty.locator(".feed-empty-icon")).toBeVisible();
  const emptyBounds = await empty.boundingBox();
  expect(emptyBounds).not.toBeNull();
  expect(emptyBounds!.y + emptyBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const control of await page.locator(".feed-tools input:visible, .feed-header-actions button:visible").all()) {
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

test("published headlines open retained briefing evidence and preserve read-only refresh", async ({ page }) => {
  const sourceUrl = "https://example.test/supported-development";
  const summary = "Acme released an updated research model [1].";
  const edition = { id: "published-one", title: "October 11 updates", summary, publishedAt: "2026-10-11T08:00:00Z", sections: [{ title: "Research model", summary, evidence: [{ messageId: "evidence-one", sourceTitle: "Research source", sourceUrl, text: summary, postedAt: "2026-10-11T07:00:00Z", links: [], media: [] }] }] };
  let manualRequests = 0, feedReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("request-summary")) manualRequests++;
    if (path === "/api/feed/admin/personal-briefing") feedReads++;
    const data = path === "/api/auth/session" ? { authenticated: false }
      : path === "/api/feed/admin/personal-briefing" ? { briefing, editions: [edition] }
      : path.endsWith("/editions/published-one") ? { edition } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/admin/personal-briefing/");
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  await expect(page.locator(".news-summary:visible")).toHaveCount(0);
  await expect(page.locator(".news-sources")).toHaveCount(0);
  await expect(page.locator(".news-headline .briefing-reference > bdi")).toHaveText("[1]");
  await expect(page.getByRole("button", { name: /brief now/i })).toHaveCount(0);
  await expect(page.locator(".news-headline .briefing-reference")).toHaveAttribute("href", sourceUrl);
  await page.locator('.briefing-read-more > summary').click();
  await expect(page.locator('.briefing-expanded-text .news-summary > bdi').first()).toHaveText("Acme released an updated research model");
  await expect(page.locator('.briefing-expanded-text .briefing-reference')).toHaveAttribute('href',sourceUrl);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.briefing-read-more > summary').click();
  const readsBefore = feedReads;
  await refreshFeed(page);
  await expect.poll(() => feedReads).toBeGreaterThan(readsBefore);
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  expect(manualRequests).toBe(0);
  await page.reload();
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  await expect(page.locator(".news-summary:visible")).toHaveCount(0);
});
