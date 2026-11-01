import {expect, test} from '@playwright/test';

for (const width of [390, 1280]) {
  test(`pinch zoom magnifies the existing layout at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    const feed = {id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:0,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/sketch')) return route.fulfill({status:404});
      return route.fulfill({json:path === '/api/auth/session' ? {authenticated:true,account:{id:'owner',username:'owner',role:'user'}}
        : path === '/api/me/briefings' ? {briefings:[feed]}
        : path === '/api/me/sources' ? {sources:[]}
        : path === '/api/me/health' ? {health:{processing:{queued:0,completed:0,failed:0}}} : {feeds:[]}});
    });
    await page.goto('/');
    const card = page.locator('.personal-feed-grid .topic-card');
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const navigation = page.locator('.bottom-navigation');
    const original = await navigation.boundingBox();
    const cardHeight = await card.evaluate(node => node.getBoundingClientRect().height);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setPageScaleFactor', {pageScaleFactor:3});
    await expect(page.locator('html')).toHaveAttribute('data-pinch-zoom', '');
    await expect(navigation).toHaveCSS('position', 'absolute');
    const zoomed = (await navigation.boundingBox())!;
    for (const key of ['x','y','width','height'] as const) expect(Math.abs(zoomed[key] - original![key])).toBeLessThan(1);
    expect(await card.evaluate(node => node.getBoundingClientRect().height)).toBe(cardHeight);
    await client.send('Emulation.setPageScaleFactor', {pageScaleFactor:1});
    await expect(page.locator('html')).not.toHaveAttribute('data-pinch-zoom', '');
    await expect(navigation).toHaveCSS('position', 'fixed');
    expect(await navigation.boundingBox()).toEqual(original);
  });
}
