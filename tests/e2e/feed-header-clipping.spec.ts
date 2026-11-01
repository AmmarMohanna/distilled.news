import {expect, test} from '@playwright/test';

for (const width of [390, 1280]) for (const language of ['en', 'ar']) {
  test(`feed back hover and artwork are unclipped: ${width}px ${language}`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.addInitScript(language => localStorage.setItem('dn_language', language), language);
    const feed = {id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:12,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/sketch')) return route.fulfill({status:404});
      return route.fulfill({json:path === '/api/auth/session' ? {authenticated:true,account:{id:'owner',username:'owner',role:'user'}}
        : path === '/api/me/briefings' ? {briefings:[feed]}
        : {briefing:feed,editions:[],viewerHasStarred:false}});
    });
    await page.goto('/owner/news/');
    await expect(page.getByRole('heading', {name:'News', exact:true})).toBeVisible();
    await expect(page.locator('.experience-header')).not.toHaveAttribute('aria-busy', 'true');
    const back = page.locator('.feed-nav-back');
    await back.hover();
    const button = (await back.boundingBox())!;
    const header = (await page.locator('.experience-header').boundingBox())!;
    expect(button.x).toBeGreaterThanOrEqual(header.x);
    expect(button.x + button.width).toBeLessThanOrEqual(header.x + header.width);
    await expect(back).toHaveCSS('border-top-left-radius', '12px');
    const art = (await page.locator('.feed-hero-art .topic-art').boundingBox())!;
    const container = (await page.locator('.feed-hero-art').boundingBox())!;
    expect(art.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(art.y).toBeGreaterThanOrEqual(container.y);
    expect(art.y + art.height).toBeLessThanOrEqual(container.y + container.height + 1);
    expect(art.height).toBeGreaterThanOrEqual(96);
  });
}
