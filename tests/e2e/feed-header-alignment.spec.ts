import { expect, test } from '@playwright/test';

for (const owner of [true,false]) for (const width of [320,390,1280]) {
  test(`feed actions stay grouped at the right edge: ${owner?'owner':'guest'}, ${width}px`, async ({page},info)=>{
    await page.setViewportSize({width,height:900});
    const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:12,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/sketch'))return route.fulfill({status:404});
      return route.fulfill({json:path==='/api/auth/session'?{authenticated:owner,account:owner?{id:'owner',username:'owner',role:'user'}:undefined}
        :path==='/api/me/briefings'?{briefings:[feed]}
        :path==='/api/me/sources'?{sources:[]}
        :path.startsWith('/api/feed/')?{briefing:feed,editions:[],viewerHasStarred:false}:{}});
    });
    await page.goto('/owner/news/');
    await expect(page.getByRole('heading',{name:'News',exact:true})).toBeVisible();
    const check=async()=>{
      const header=await page.locator('.experience-header').boundingBox();
      const group=await page.locator('.feed-header-actions').boundingBox();
      expect(Math.abs(header!.x+header!.width-group!.x-group!.width)).toBeLessThan(2);
      const buttons=await page.locator('.feed-header-actions > button').all();
      expect(buttons.length).toBe(owner?3:2);
      let end=group!.x;
      for(const button of buttons){
        const box=await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x).toBeGreaterThanOrEqual(end-1);
        expect(Math.abs(box!.y-group!.y)).toBeLessThan(2);
        end=box!.x+box!.width;
      }
      const back=await page.locator('.feed-nav-back').boundingBox();
      expect(back!.x+back!.width<=group!.x+1 || back!.y+back!.height<=group!.y+1).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      // DOM order also keeps keyboard navigation consistent with the toolbar.
      expect(await page.locator('.experience-header-actions').evaluate(node=>node.lastElementChild?.classList.contains('feed-header-actions'))).toBe(true);
    };
    await check();
    await page.screenshot({path:`.local-reports/feed-header/${info.project.name}-${owner?'owner':'guest'}-${width}.png`});
    await page.evaluate(()=>{
      document.documentElement.style.fontSize='200%';
      localStorage.setItem('dn_language','ar');
      window.dispatchEvent(new Event('dn-language'));
    });
    await check();
  });
}
