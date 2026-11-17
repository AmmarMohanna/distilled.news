import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`feed header waits for its final controls without moving: ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    let resolveSession!: () => void, resolveOwnership!: () => void;
    const sessionGate = new Promise<void>(resolve => {resolveSession = resolve;});
    const ownershipGate = new Promise<void>(resolve => {resolveOwnership = resolve;});
    const feed = {id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:12,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') {
        await sessionGate;
        return route.fulfill({json:{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}});
      }
      if (path === '/api/me/briefings') {
        await ownershipGate;
        return route.fulfill({json:{briefings:[feed]}});
      }
      if (path.endsWith('/sketch')) return route.fulfill({status:404});
      return route.fulfill({json:path.startsWith('/api/feed/') ? {briefing:feed,editions:[],viewerHasStarred:false} : {}});
    });
    await page.goto('/owner/news/');
    await page.evaluate(() => document.fonts.ready);
    const header = page.locator('.experience-header');
    const controls = page.locator('.experience-header-actions');
    await expect(header).toHaveAttribute('aria-busy', 'true');
    await expect(controls).toBeHidden();
    await expect(page.locator('.feed-nav-back')).toBeVisible();
    const bounds = await header.boundingBox();
    const back = await page.locator('.feed-nav-back').boundingBox();
    const ownershipRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/me/briefings');
    resolveSession();
    await ownershipRequest;
    await expect(controls).toBeHidden();
    resolveOwnership();
    await expect(page.getByRole('button', {name:'Edit feed settings', exact:true})).toBeVisible();
    await expect(controls).toBeVisible();
    await expect(page.locator('.experience-header a[href="/login"]')).toHaveCount(0);
    expect(await header.boundingBox()).toEqual(bounds);
    expect(await page.locator('.feed-nav-back').boundingBox()).toEqual(back);
    const samples = await controls.evaluate(async node => {
      const positions: string[] = [];
      for (let frame = 0; frame < 10; frame++) {
        await new Promise(requestAnimationFrame);
        positions.push(JSON.stringify([...node.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        })));
      }
      return positions;
    });
    expect(new Set(samples).size).toBe(1);
  });
}
