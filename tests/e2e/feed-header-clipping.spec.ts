import {expect, test} from '@playwright/test';

for (const width of [390, 1280]) for (const language of ['en', 'ar']) {
  test(`feed back hover and artwork are unclipped: ${width}px ${language}`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.addInitScript(language => localStorage.setItem('dn_language', language), language);
    const feed = {id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:12,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    const cover = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 80;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#685db4';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    }), 'base64');
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/sketch')) return route.fulfill({body:cover,contentType:'image/jpeg',headers:{'X-Feed-Artwork-Style':'pencil-cover-v1'}});
      return route.fulfill({json:path === '/api/auth/session' ? {authenticated:true,account:{id:'owner',username:'owner',role:'user'}}
        : path === '/api/me/briefings' ? {briefings:[feed]}
        : {briefing:feed,editions:[],viewerHasStarred:false}});
    });
    await page.goto('/owner/news/');
    await expect(page.getByRole('heading', {name:'News', exact:true})).toBeVisible();
    await expect(page.locator('.experience-header')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.feed-nav-back')).toBeVisible();
    await expect(page.locator('.feed-shell > .bottom-navigation')).toBeHidden();
    const header=(await page.locator('.experience-header').boundingBox())!;
    const artwork = page.locator('.feed-hero-art .full-cover-art');
    await expect(artwork.locator('img')).toBeVisible();
    const art = (await artwork.boundingBox())!;
    const container = (await page.locator('.feed-hero-art').boundingBox())!;
    expect(art.y).toBeGreaterThanOrEqual(container.y);
    expect(art.y + art.height).toBeLessThanOrEqual(container.y + container.height + 1);
    expect(art.height).toBeGreaterThanOrEqual(80);
    const banner = (await page.locator('.feed-shell .page-heading').boundingBox())!;
    const title = (await page.getByRole('heading', {name: 'News', exact: true}).boundingBox())!;
    if (width <= 700) expect(art.y + art.height).toBeLessThanOrEqual(title.y + 1);
    else {
      expect(art.y).toBeCloseTo(container.y, 0);
      expect(art.height).toBeCloseTo(container.height, 0);
      const fade = await artwork.evaluate(node => getComputedStyle(node).maskImage);
      expect(fade).toContain('to right');
      expect(art.x).toBeCloseTo(container.x, 0);
    }
    const viewport = page.locator('.app-pages > .screen-page-viewport');
    await expect(viewport).toHaveCSS('scrollbar-gutter','auto');
    expect(banner.width).toBeCloseTo(await viewport.evaluate(node => node.clientWidth), 0);
    expect(banner.x).toBeCloseTo(0, 0);
    expect(banner.y).toBeLessThanOrEqual(header.y + header.height + 1);
    expect(container.y).toBeCloseTo(header.y, 0);
    expect(container.y + container.height).toBeCloseTo(banner.y + banner.height, 0);
    expect(container.width).toBeCloseTo(banner.width, 0);
    expect(container.x).toBeCloseTo(banner.x, 0);
    await page.locator('.feed-banner-menu summary').click();
    await expect(page.locator('.feed-banner-menu .feed-options-popover button')).toHaveCount(2);
    await expect(page.locator('.feed-banner-menu .feed-options-popover button').nth(1)).toBeVisible();
  });
}
