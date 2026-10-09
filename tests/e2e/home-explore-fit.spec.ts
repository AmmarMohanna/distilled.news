import { expect, test } from "@playwright/test";

const titles = ["Lebanese politics", "Global affairs", "AI and technology", "Business markets"];
const feed = (index: number) => ({ id: `feed-${index}`, ownerUsername: "owner", slug: `feed-${index}`, title: `${titles[index % titles.length]} ${index}`, stars: 0, publicFeedEnabled: true });

async function openApp(page: import("@playwright/test").Page, count: number) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, account: { id: "owner", username: "owner", role: "user" } } });
    if (path === "/api/me/briefings") return route.fulfill({ json: { briefings: Array.from({ length: count }, (_, index) => feed(index)) } });
    if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: Array.from({ length: count }, (_, index) => feed(index)) } });
    if (path === "/api/me/sources") return route.fulfill({ json: { sources: [] } });
    if (path === "/api/me/health") return route.fulfill({ json: { health: { processing: { queued: 0, completed: 0, failed: 0 } } } });
    if (path.endsWith("/sketch")) return route.fulfill({ status: 404 });
    if (path.startsWith("/api/feed/")) return route.fulfill({ json: { briefing: feed(0), editions: [{ updatedAt: "2026-10-01T12:00:00Z" }], viewerHasStarred: false } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.locator(".personal-feed-grid .topic-card")).toHaveCount(count);
}

for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 593 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} first feed fits ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openApp(page, 1);
      if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
      const grid = page.locator(tab === "home" ? ".personal-feed-grid" : ".curated-feed-grid");
      await expect(grid.locator(".topic-card")).toHaveCount(1);
      const result = await page.evaluate(() => {
        const viewport = document.querySelector(".app-pages > .screen-page-viewport")!;
        const navigation = document.querySelector(".bottom-navigation")!.getBoundingClientRect();
        const card = document.querySelector(".home-view .topic-card, .explore-view .topic-card")!.getBoundingClientRect();
        return { scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight, cardBottom: card.bottom, navigationTop: navigation.top };
      });
      expect(result.scrollHeight).toBeLessThanOrEqual(result.clientHeight + 1);
      if (size.width < 900) expect(result.cardBottom).toBeLessThanOrEqual(result.navigationTop);
    });
  }
}

for (const size of [{ width: 1280, height: 593, count: 4 }, { width: 390, height: 664, count: 2 }, { width: 667, height: 375, count: 2 }]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} full first row fits ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openApp(page, size.count);
      if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
      const viewport = page.locator(".app-pages > .screen-page-viewport");
      await expect(page.locator(tab === "home" ? ".personal-feed-grid .topic-card" : ".curated-feed-grid .topic-card")).toHaveCount(size.count);
      expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    });
  }
}

for (const tab of ["home", "explore"] as const) {
  test(`${tab} scrolls when feeds reach a second row`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await openApp(page, 8);
    if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
    const viewport = page.locator(".app-pages > .screen-page-viewport");
    expect(await viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  });
}

for (const language of ["fr", "ar"]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} first feed fits short landscape in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width: 667, height: 375 });
      await page.addInitScript(value => localStorage.setItem("dn_language", value), language);
      await openApp(page, 1);
      if (tab === "explore") await page.locator(".bottom-navigation button").nth(1).click();
      const viewport = page.locator(".app-pages > .screen-page-viewport");
      expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    });
  }
}
