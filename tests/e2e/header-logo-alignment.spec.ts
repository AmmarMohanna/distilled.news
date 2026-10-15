import { expect, test } from '@playwright/test';

for (const width of [320, 390, 1280, 1600]) test(`landing and Home logos align at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let authenticated = false;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/session'
      ? { authenticated, account: authenticated ? { id: 'owner', username: 'owner', role: 'user' } : undefined }
      : { feeds: [], briefings: [], sources: [] } });
  });
  await page.goto('/');
  const landing = page.locator('.guest-landing .experience-header .distilled-logo');
  await expect(landing).toBeVisible();
  const before = (await landing.boundingBox())!;
  const controls = (await page.locator('.experience-header-actions').boundingBox())!;
  expect(before.x + before.width).toBeLessThanOrEqual(controls.x);
  authenticated = true;
  await page.reload();
  await expect(page.locator('.home-view')).toBeVisible();
  const home = page.locator(width >= 900 ? '.bottom-navigation .distilled-logo' : '.experience-header .distilled-logo');
  await expect(home).toBeVisible();
  const after = (await home.boundingBox())!;
  for (const dimension of ['x', 'y', 'width', 'height'] as const) expect(after[dimension]).toBeCloseTo(before[dimension], 0);
});
