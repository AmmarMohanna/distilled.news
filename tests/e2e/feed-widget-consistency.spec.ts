import { expect, test } from '@playwright/test';

for (const width of [320, 390, 1280]) test(`Home and Explore keep cards readable within their available space at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const feed = { id: 'science', ownerAccountId: 'owner', ownerUsername: 'owner', slug: 'science', title: 'Science', stars: 0, publicFeedEnabled: true, paused: false, latestUpdatedAt: '2026-10-14T08:00:00Z' };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sketch')) return route.fulfill({ status: 404 });
    if (path === '/api/feed/owner/science') return route.fulfill({ json: { briefing: feed, editions: [{ updatedAt: feed.latestUpdatedAt }], viewerHasStarred: false } });
    return route.fulfill({ json: path === '/api/auth/session' ? { authenticated: true, account: { id: 'owner', username: 'owner', role: 'user' } }
      : path === '/api/me/briefings' ? { briefings: [feed] }
      : path === '/api/explore/feeds' ? { feeds: [feed] } : { sources: [] } });
  });
  await page.goto('/');
  const home = page.locator('.home-view .topic-card');
  await expect(home).toHaveCount(1);
  await expect(home.locator('.feed-updated-at')).toBeVisible();
  const contained = async (card: import('@playwright/test').Locator) => card.evaluate(node => {
    const r = node.getBoundingClientRect(), grid = node.closest('.adaptive-feed-grid')!.getBoundingClientRect();
    return r.width > 100 && r.height >= 64 && r.left >= grid.left - 1 && r.right <= grid.right + 1 && r.top >= 0 && r.bottom <= innerHeight;
  });
  await expect.poll(() => contained(home)).toBe(true);
  await expect(home.locator('.topic-name')).toBeVisible();
  await expect(home.locator('.topic-art')).toBeVisible();
  const create = page.locator('.home-add-feed');
  expect(await create.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const explore = page.locator('.explore-view .topic-card');
  await expect(explore).toHaveCount(1);

  await expect.poll(() => contained(explore)).toBe(true);
  // Each view has its own available height; both cards must remain readable and fully on screen.
  await expect(explore.locator('.topic-name')).toBeVisible();
  await expect(explore.locator('.topic-art')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
