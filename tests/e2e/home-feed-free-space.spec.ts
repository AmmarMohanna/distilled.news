import { expect, test } from '@playwright/test';

for(const size of [{width:1280,height:548},{width:1606,height:821}]) test(`uses space below one feed at ${size.width}x${size.height}`,async({page},testInfo)=>{
  await page.setViewportSize(size);
  const feed={id:'personal',ownerUsername:'admin',ownerAccountId:'owner',slug:'personal',title:'Personal Briefing',stars:0,publicFeedEnabled:true};
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'admin',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/explore/feeds'?{feeds:[feed]}:path.startsWith('/api/feed/')?{briefing:feed,editions:[],viewerHasStarred:false}:{sources:[]}});
  });
  await page.goto('/');await expect(page.locator('.home-view .topic-card')).toBeVisible();
  await expect.poll(()=>page.locator('.home-view').evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--home-feed-extra-space'))||0)).toBeGreaterThan(8);
  const controls=(await page.locator('.home-controls').boundingBox())!,heading=(await page.locator('.your-feeds .experience-section-heading').boundingBox())!;
  expect(heading.y-controls.y-controls.height).toBeGreaterThan(30);
  expect(await page.locator('.app-pages > .screen-page-viewport').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('spacing.png')});
});
