import { expect, test } from '@playwright/test';

for (const width of [320, 390, 1280]) test(`Home and Explore share widget sizes at ${width}px`, async ({ page }) => {
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
  const homeBounds = (await home.boundingBox())!;
  const create = page.locator('.home-add-feed');
  expect(await create.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const explore = page.locator('.explore-view .topic-card');
  await expect(explore).toHaveCount(1);
  const exploreBounds = (await explore.boundingBox())!;
  expect(exploreBounds.width).toBeCloseTo(homeBounds.width, 0);
  expect(exploreBounds.height).toBeCloseTo(homeBounds.height, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
