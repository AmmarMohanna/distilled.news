import { expect, test } from "@playwright/test";

const feed = (index: number) => ({
  id: `feed-${index}`, ownerUsername: "editor", slug: `feed-${index}`,
  title: `Lebanese politics ${index}`, stars: 0, publicFeedEnabled: true
});

async function openLanding(page: import("@playwright/test").Page, count: number) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: false } });
    if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: Array.from({ length: count }, (_, index) => feed(index)) } });
    if (path.endsWith("/sketch")) return route.fulfill({ status: 404 });
    if (path.startsWith("/api/feed/")) return route.fulfill({ json: { briefing: feed(0), editions: [], viewerHasStarred: false } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.locator(".guest-landing .curated-feed-grid .topic-card")).toHaveCount(count);
}

for (const size of [
  { width: 1280, height: 900 },
  { width: 1280, height: 720 },
  { width: 1280, height: 593 },
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 320, height: 568 },
  { width: 667, height: 375 }
]) {
  test(`one landing feed fits ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openLanding(page, 1);
    const viewport = page.locator(".app-pages > .screen-page-viewport");
    const card = page.locator(".guest-landing .curated-feed-grid .topic-card");
    const bounds = await card.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  });
}

test("landing feeds scroll when there is a second row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLanding(page, 8);
  const viewport = page.locator(".app-pages > .screen-page-viewport");
  expect(await viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
});
