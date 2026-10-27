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
    const art = await card.locator(".topic-art").boundingBox();
    expect(Math.abs(art!.width - art!.height)).toBeLessThan(1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    if (size.height >= 500) expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    else { await card.scrollIntoViewIfNeeded(); await expect(card).toBeInViewport(); }
  });
}

test("landing feeds scroll only when they no longer fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLanding(page, 40);
  const viewport = page.locator(".app-pages > .screen-page-viewport");
  expect(await viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
});

for (const width of [320, 749, 900, 1280]) {
  test(`feed identities remain readable and rows centered at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openLanding(page, 5);
    const cards = page.locator('.curated-feed-grid .topic-card');
    await expect(cards.first()).toBeVisible();
    const measurements = await cards.evaluateAll(nodes => nodes.map(node => {
      const card = node.getBoundingClientRect();
      const title = node.querySelector('strong')!;
      const identity = title.getBoundingClientRect();
      const art=node.querySelector(".topic-art")!.getBoundingClientRect();
      return { x: card.x, y: card.y, width: card.width, titleWidth: identity.width, artSquare:Math.abs(art.width-art.height)<1, clipped: title.scrollWidth > title.clientWidth + 1 };
    }));
    for (const card of measurements) {
      expect(card.titleWidth).toBeGreaterThan(100);
      expect(card.clipped).toBe(false);
      expect(card.artSquare).toBe(true);
      expect(card.x + card.width).toBeLessThanOrEqual(width);
    }
    await expect(cards.first().locator('.feed-card-status.live')).toHaveCount(0);
    expect(await cards.first().locator('.topic-art').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const grid = await page.locator('.curated-feed-grid').boundingBox();
    await page.screenshot({path:`.local-reports/staging-feed-card-layout/${info.project.name}-${width}-cards.png`,animations:"disabled"});
    const lastY = measurements.at(-1)!.y;
    const lastRow = measurements.filter(card => Math.abs(card.y - lastY) < 1);
    const left = lastRow[0].x;
    const right = lastRow.at(-1)!.x + lastRow.at(-1)!.width;
    expect(Math.abs((left + right) / 2 - (grid!.x + grid!.width / 2))).toBeLessThan(2);
  });
}
