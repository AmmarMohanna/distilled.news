import { expect, test } from '@playwright/test';

for (const size of [{width:320,height:568},{width:390,height:664},{width:1280,height:593},{width:1280,height:768},{width:1825,height:900},{width:667,height:375}]) {
  test(`balanced pages and accessible header at ${size.width}x${size.height}`, async ({page}, testInfo) => {
    await page.setViewportSize(size);
    const feeds=Array.from({length:12},(_,i)=>({id:`feed-${i}`,ownerUsername:'reader',ownerAccountId:'owner',slug:`feed-${i}`,title:`Science ${i}`,stars:0,publicFeedEnabled:true}));
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/sketch'))return route.fulfill({status:404});
      return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'reader',role:'user'}}:path==='/api/me/briefings'?{briefings:feeds}:path==='/api/explore/feeds'?{feeds}:path.startsWith('/api/feed/')?{briefing:feeds[0],editions:[],viewerHasStarred:false}:{sources:[]}});
    });
    await page.goto('/');
    await expect(page.locator('.home-view .topic-card').first()).toBeVisible();
    const avatar=page.getByRole('button',{name:'Account profile'});
    const circle=(await avatar.boundingBox())!,letter=(await avatar.locator('span').boundingBox())!;
    expect(Math.abs(circle.x+circle.width/2-letter.x-letter.width/2)).toBeLessThan(1);
    expect(Math.abs(circle.y+circle.height/2-letter.y-letter.height/2)).toBeLessThan(1);
    if(size.width<=600){
      await expect(page.locator('.home-add-feed .create-feed-label')).toBeHidden();
      await page.getByRole('button',{name:'Preferences',exact:true}).click();
      await expect(page.getByRole('button',{name:'Switch to dark mode'})).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const homeSearch=(await page.locator('.home-controls').boundingBox())!;
    const homeButton=await page.locator('.home-add-feed').evaluate(el=>{const s=getComputedStyle(el),box=el.getBoundingClientRect();return {width:box.width,height:box.height,font:s.fontSize,padding:s.padding,icon:el.querySelector('svg')!.getBoundingClientRect().width};});
    if(size.width>=900){
      const field=(await page.locator('.home-controls .explore-search').boundingBox())!;
      const create=(await page.locator('.home-add-feed').boundingBox())!;
      expect(create.x-field.x-field.width).toBeCloseTo(24,0);
      const content=(await page.locator('.home-view').boundingBox())!;
      expect(homeSearch.width).toBeLessThan(content.width);
      expect(homeSearch.x+homeSearch.width/2).toBeCloseTo(content.x+content.width/2,0);
    }
    const heading=(await page.locator('.your-feeds .experience-section-heading').boundingBox())!;
    const card=(await page.locator('.home-view .topic-card').first().boundingBox())!;
    expect(card.y-heading.y-heading.height).toBeGreaterThanOrEqual(11);
    const viewport=page.locator('.app-pages > .screen-page-viewport');
    expect(await viewport.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    await expect(page.locator('.feed-grid-pagination')).toContainText('2 /');
    if(size.width===390||size.width===1825)await page.screenshot({path:testInfo.outputPath('home.png')});
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Explore',exact:true}).click();
    await expect(page.locator('.explore-view .topic-card').first()).toBeVisible();
    const exploreSearch=(await page.locator('.explore-controls').boundingBox())!;
    await expect(page.locator('.explore-view .explore-search input')).toHaveAttribute('placeholder','Search feeds');
    const exploreButton=await page.locator('.explore-view .landing-create').evaluate(el=>{const s=getComputedStyle(el),box=el.getBoundingClientRect();return {width:box.width,height:box.height,font:s.fontSize,padding:s.padding,icon:el.querySelector('svg')!.getBoundingClientRect().width};});
    expect(exploreButton).toEqual(homeButton);
    expect(exploreSearch.y).toBeCloseTo(homeSearch.y,0);
    expect(await viewport.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    if(size.width===390)await page.screenshot({path:testInfo.outputPath('explore.png')});
  });
}
