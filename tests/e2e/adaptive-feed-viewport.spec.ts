import { expect, test, type Page } from '@playwright/test';

async function openFeeds(page: Page, count: number) {
  const feeds = Array.from({ length: count }, (_, index) => ({ id: `adaptive-${index}`, ownerAccountId: 'owner', ownerUsername: 'owner', slug: `feed-${index}`, title: `Science ${index + 1}`, stars: 0, paused: false, publicFeedEnabled: true }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/star')) return route.fulfill({ json: {viewerHasStarred: true, stars: 1} });
    if (path.endsWith('/sketch')) return route.fulfill({ status: 404 });
    return route.fulfill({ json: path === '/api/auth/session' ? { authenticated: true, account: { id: 'owner', username: 'owner', role: 'user' } }
      : path === '/api/me/briefings' ? { briefings: feeds } : path === '/api/explore/feeds' ? { feeds: feeds.map(feed => ({...feed,id:`community-${feed.id}`,ownerAccountId:'community',ownerUsername:'community',viewerHasStarred:false})) }
      : path.startsWith('/api/feed/') ? { briefing: feeds[0], editions: [] } : { sources: [] } });
  });
  await page.goto('/');
  await expect(page.locator('.feed-tile-grid[data-feed-view=home] .feed-tile')).toHaveCount(count);
}

for (const view of ['Home', 'Explore'] as const) {
  const gridSelector = view === 'Home' ? '.feed-tile-grid[data-feed-view=home]' : '.feed-tile-grid[data-feed-view=explore]';
  test(`${view} keeps square tiles usable on short and tall laptops, then a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 593 });
    await openFeeds(page, 1);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    const card = page.locator(`${gridSelector} .feed-tile`).first();
    await expect(card).toBeVisible();
    const short = (await card.boundingBox())!;
    expect(short.width).toBeLessThanOrEqual(1280);
    expect(short.width).toBeGreaterThan(130);
    expect(short.height).toBeGreaterThanOrEqual(64);
    for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeInViewport({ ratio: 0.95 });
      const cover = (await card.locator('.feed-tile-cover').boundingBox())!;
      expect(Math.abs(cover.height - cover.width)).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });

  test(`${view} fits four tiles and keeps menus inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (url: string) => sessionStorage.setItem('copied-feed-url', url) },
      });
    });
    await openFeeds(page, 4);
    await page.locator('.bottom-navigation').getByRole('button', { name: view, exact: true }).click();
    // Leave the hover-expanding sidebar before measuring or opening a card menu.
    await page.mouse.move(1270, 70);
    const grid = page.locator(gridSelector);
    await expect(grid.locator('.feed-tile')).toHaveCount(4);
    const tops = await grid.locator('.feed-tile').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeLessThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const first = grid.locator('.feed-tile').first(), summary = first.locator('.feed-options > summary');
    await first.locator('.feed-tile-cover').hover();
    await summary.click();
    const popover = first.locator('.feed-options-popover');
    await expect(first.locator('.feed-options')).toHaveAttribute('open', '');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('link', {name: 'Open feed'})).toBeVisible();
    await expect(popover.getByRole('button', {name: 'Share', exact: true})).toBeVisible();
    await expect(popover.getByRole('button', {name: 'Copy link'})).toBeVisible();
    const menu = (await popover.boundingBox())!;
    expect(menu.y + menu.height).toBeLessThanOrEqual(720);
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(1280);
    expect(menu.y).toBeGreaterThanOrEqual(0);
    await popover.getByRole('button', { name: 'Copy link' }).click();
    await expect(popover.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('copied-feed-url'))).toBe(new URL(view === 'Home' ? '/owner/feed-0/' : '/community/feed-0/', page.url()).href);
    if (view === 'Explore') {
      await popover.getByRole('button', {name: 'Follow feed', exact: true}).click();
      await expect(first.getByRole('button', {name: 'Unstar Science 1'})).toHaveAttribute('aria-pressed', 'true');
      await expect(popover).toBeHidden();
      await summary.click();
      await expect(popover.getByRole('button', {name: 'Unfollow feed'})).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(summary).toBeFocused();
    await expect(popover).toBeHidden();
  });
}
