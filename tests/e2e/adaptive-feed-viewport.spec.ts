import { expect, test, type Page } from '@playwright/test';

async function openFeeds(page: Page, count: number) {
  const feeds = Array.from({ length: count }, (_, index) => ({ id: `adaptive-${index}`, ownerAccountId: 'owner', ownerUsername: 'owner', slug: `feed-${index}`, title: `Science ${index + 1}`, stars: 0, paused: false, publicFeedEnabled: true }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sketch')) return route.fulfill({ status: 404 });
    return route.fulfill({ json: path === '/api/auth/session' ? { authenticated: true, account: { id: 'owner', username: 'owner', role: 'user' } }
      : path === '/api/me/briefings' ? { briefings: feeds } : path === '/api/explore/feeds' ? { feeds }
      : path.startsWith('/api/feed/') ? { briefing: feeds[0], editions: [] } : { sources: [] } });
  });
  await page.goto('/');
  await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(count);
}

for (const view of ['Home', 'Explore'] as const) {
  const gridSelector = view === 'Home' ? '.personal-feed-grid' : '.curated-feed-grid';
  test(`${view} adapts a card to short and tall laptops, then a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 593 });
    await openFeeds(page, 1);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    const card = page.locator(`${gridSelector} .topic-card`).first();
    await expect(card).toBeVisible();
    const short = (await card.boundingBox())!;
    expect(short.width).toBeLessThanOrEqual(301);
    expect(short.height).toBeGreaterThan(200);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(short.height + 60);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(140);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${view} fits four cards across a normal laptop and opens their menus upward`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFeeds(page, 4);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    const grid = page.locator(gridSelector);
    await expect(grid.locator('.topic-card')).toHaveCount(4);
    const tops = await grid.locator('.topic-card').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const first = grid.locator('.topic-card').first(), summary = first.locator('.feed-options > summary');
    await summary.click();
    const menu = (await first.locator('.feed-options-popover').boundingBox())!, trigger = (await summary.boundingBox())!;
    expect(menu.y + menu.height).toBeLessThanOrEqual(trigger.y);
    expect(menu.y).toBeGreaterThanOrEqual(0);
  });
}
