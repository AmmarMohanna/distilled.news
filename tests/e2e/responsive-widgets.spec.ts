import {expect, test, type Page} from '@playwright/test';

async function mock(page: Page, authenticated = true, ownCount = 1) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const feed = {id:'feed', ownerAccountId:'owner', ownerUsername:'owner', slug:'news', title:'A long monitoring topic with several important developments', interestProfile:'News', publicFeedEnabled:true, paused:false, stars:23, language:'en'};
    return route.fulfill({json:path === '/api/auth/session'
      ? {authenticated, setupRequired:false, account:authenticated ? {id:'owner',username:'joud-mail-check-long-name',email:'a.long.email.address.for.layout.checks@example.com',role:'user'} : undefined}
      : path === '/api/me/briefings' ? {briefings:Array.from({length:ownCount}, (_, index) => ({...feed,id:index ? `feed-${index}` : feed.id}))}
      : path === '/api/explore/feeds' ? {feeds:Array.from({length:9},(_,i)=>({...feed,id:'community-'+i,ownerAccountId:'community',ownerUsername:'owner'}))}
      : path === '/api/me/sources' ? {sources:[]}
      : path.endsWith('/sketch') ? {} : {}});
  });
}

for (const language of ['en','fr','ar']) for (const size of [
  {width:320,height:568}, {width:667,height:375}, {width:1280,height:800}, {width:1920,height:1080},
]) {
  test(`widgets remain reachable in ${language} at ${size.width}x${size.height}`, async ({page}, testInfo) => {
    await page.setViewportSize(size);
    await page.addInitScript(language => localStorage.setItem('dn_language', language), language);
    await mock(page);
    await page.goto('/');
    const card = page.locator('.feed-tile-grid[data-feed-view=home] .feed-tile');
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const fit = await card.evaluate(node => ({width:node.clientWidth, contentWidth:node.scrollWidth, height:node.clientHeight, contentHeight:node.scrollHeight}));
    expect(fit.contentWidth).toBeLessThanOrEqual(fit.width + 2);
    expect(fit.contentHeight).toBeLessThanOrEqual(fit.height + 2);
    await page.locator('.avatar-button').click();
    const dialog = page.locator('.profile-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.profile-avatar')).toHaveText('JM');
    if ((language === 'en' && size.width === 1280) || (language === 'ar' && size.width === 320)) {
      await page.screenshot({path:testInfo.outputPath('profile.png')});
    }
    await dialog.locator('.password-disclosure').click();
    const logout = dialog.locator('.account-actions button');
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeInViewport();
    const dimensions = await dialog.evaluate(node => {
      const r = node.getBoundingClientRect();
      const viewport = node.querySelector('.screen-page-viewport')!;
      return {left:r.left,right:r.right,width:innerWidth,height:r.height,screenHeight:innerHeight,scrollWidth:viewport.scrollWidth,clientWidth:viewport.clientWidth};
    });
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.screenHeight);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);
  });
}

test('brand size stays stable when the viewport grows and login uses the transparent mark', async ({page}) => {
  await mock(page, false);
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/');
  const mark = page.locator('.experience-header .distilled-logo-symbol');
  const first = await mark.boundingBox();
  await page.setViewportSize({width:1920,height:1080});
  const second = await mark.boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(second!.width-first!.width)).toBeLessThan(1);
  expect(Math.abs(second!.height-first!.height)).toBeLessThan(1);
  await page.goto('/login');
  await expect(page.locator('.auth-brand-mark img')).toHaveAttribute('src','/favicon.svg');
});

for(const width of [390,667,1280,1920])test(`Home and Explore fit square widgets to their available space at ${width}px`,async({page})=>{
 await mock(page, true, 9);await page.setViewportSize({width,height:800});await page.goto('/');
 const home=page.locator('.feed-tile-grid[data-feed-view=home] .feed-tile').first();await expect(home).toBeVisible();
 const size=async(selector:string)=>page.locator(selector).first().evaluate(node=>{
  const r=node.getBoundingClientRect(),art=node.querySelector('.topic-art')!.getBoundingClientRect();
  return {width:r.width,height:r.height,art:art.width,artHeight:art.height,gridWidth:node.parentElement!.clientWidth,font:getComputedStyle(node.querySelector('.feed-tile-caption > a')!).fontSize};
 });
 const initial=await size('.feed-tile-grid[data-feed-view=home] .feed-tile');
 await page.goto('/explore');await expect(page.locator('.feed-tile-grid[data-feed-view=explore] .feed-tile')).toHaveCount(9);
 const explore=await size('.feed-tile-grid[data-feed-view=explore] .feed-tile');
 for (const card of [initial, explore]) {
   expect(card.width).toBeLessThanOrEqual(card.gridWidth + 1);
   expect(Math.abs(card.art - card.artHeight)).toBeLessThan(1);
   expect(card.height).toBeGreaterThan(card.artHeight);
 }
 expect(initial.font).toBe(explore.font);
});
