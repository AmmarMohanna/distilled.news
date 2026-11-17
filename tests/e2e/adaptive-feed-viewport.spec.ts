import { expect, test, type Page } from '@playwright/test';

async function openFeeds(page: Page, count: number) {
  const feeds = Array.from({ length: count }, (_, index) => ({ id: `adaptive-${index}`, ownerAccountId: 'owner', ownerUsername: 'owner', slug: `feed-${index}`, title: `Science ${index + 1}`, stars: 0, paused: false, publicFeedEnabled: true }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sketch')) return route.fulfill({ status: 404 });
    return route.fulfill({ json: path === '/api/auth/session' ? { authenticated: true, account: { id: 'owner', username: 'owner', role: 'user' } }
      : path === '/api/me/briefings' ? { briefings: feeds } : path === '/api/explore/feeds' ? { feeds: feeds.map(feed => ({...feed,id:`community-${feed.id}`,ownerAccountId:'community',ownerUsername:'community'})) }
      : path.startsWith('/api/feed/') ? { briefing: feeds[0], editions: [] } : { sources: [] } });
  });
  await page.goto('/');
  await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(count);
}

for (const view of ['Home', 'Explore'] as const) {
  const gridSelector = view === 'Home' ? '.personal-feed-grid' : '.curated-feed-grid';
  test(`${view} keeps list cards usable on short and tall laptops, then a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 593 });
    await openFeeds(page, 1);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    const card = page.locator(`${gridSelector} .topic-card`).first();
    await expect(card).toBeVisible();
    const short = (await card.boundingBox())!;
    expect(short.width).toBeLessThanOrEqual(1280);
    expect(short.width).toBeGreaterThan(200);
    expect(short.height).toBeGreaterThanOrEqual(64);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThanOrEqual(short.height);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThanOrEqual(176);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${view} fits four cards in two columns and keeps menus inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFeeds(page, 4);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    // Leave the hover-expanding sidebar before measuring or opening a card menu.
    await page.mouse.move(1270, 70);
    const grid = page.locator(gridSelector);
    await expect(grid.locator('.topic-card')).toHaveCount(4);
    const tops = await grid.locator('.topic-card').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const first = grid.locator('.topic-card').first(), summary = first.locator('.feed-options > summary');
    await summary.click();
    const popover = first.locator('.feed-options-popover');
    await expect(first.locator('.feed-options')).toHaveAttribute('open', '');
    await expect(popover).toBeVisible();
    const menu = (await popover.boundingBox())!;
    expect(menu.y + menu.height).toBeLessThanOrEqual(720);
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(1280);
    expect(menu.y).toBeGreaterThanOrEqual(0);
  });
}
