import {expect,test} from '@playwright/test';

for(const width of [320,390,600]) {
  test(`guest feed opened from landing keeps header controls fixed across languages at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.addInitScript(()=>localStorage.setItem('dn_language','en'));
    const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:12,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/sketch'))return route.fulfill({status:404});
      return route.fulfill({json:path==='/api/auth/session'?{authenticated:false}
        :path==='/api/explore/feeds'?{feeds:[feed]}
        :path.startsWith('/api/feed/')?{briefing:feed,editions:[],viewerHasStarred:false}:{}});
    });
    await page.goto('/');
    await page.locator('.curated-feed-grid .topic-card > a').first().click();
    await expect(page.locator('.feed-nav-back')).toBeVisible();
    await expect(page.locator('.experience-header')).toHaveClass(/is-guest/);
    const appearance=page.locator('.experience-header .appearance-menu > summary');
    const panel=page.locator('.experience-header .appearance-menu-panel');
    await expect(appearance).toBeVisible();
    await expect(page.locator('.experience-header .language-cycle')).toBeHidden();
    await expect(page.locator('.experience-header .theme-toggle')).toBeHidden();
    await page.evaluate(()=>document.fonts.ready);
    const selectors=['.experience-header','.feed-nav-back','.experience-header-actions',
      '.experience-header .appearance-menu > summary',
      '.experience-header a[href="/login"]'];
    const bounds=()=>Promise.all(selectors.map(selector=>page.locator(selector).boundingBox()));
    const settled=()=>page.locator('.experience-header').evaluate(async node=>{
      await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));
    });
    await settled();
    const initial=await bounds();
    await appearance.click();
    await expect(panel).toBeVisible();
    for(const language of ['fr','ar','en']){
      await panel.getByRole('button').first().click();
      await expect(page.locator('html')).toHaveAttribute('lang',language);
      await settled();
      expect(await bounds()).toEqual(initial);
      expect(await page.locator('.experience-header').evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const login=page.locator('.experience-header a[href="/login"]');
      expect(await login.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(appearance).toBeFocused();
  });
}
