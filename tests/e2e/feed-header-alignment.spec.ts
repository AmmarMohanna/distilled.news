import { expect, test } from '@playwright/test';

for (const owner of [true,false]) for (const width of [320,390,1280]) {
  test(`feed actions preserve contextual and guest control slots: ${owner?'owner':'guest'}, ${width}px`, async ({page},info)=>{
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
    const check=async(enlarged=false)=>{
      const overflow=await page.locator(".experience-header").evaluate(node=>node.scrollWidth-node.clientWidth);
      if(!enlarged) expect(overflow).toBeLessThanOrEqual(1);
      const header=await page.locator('.experience-header').boundingBox();
      const buttons=await page.locator('.feed-header-actions > button').all();
      expect(buttons.length).toBe(owner?3:2);
      // The approved wrapper is display:contents: measure its actual controls.
      const boxes=await Promise.all(buttons.map(button=>button.boundingBox()));
      const group={x:Math.min(...boxes.map(box=>box!.x)),y:Math.min(...boxes.map(box=>box!.y)),right:Math.max(...boxes.map(box=>box!.x+box!.width))};
      if(owner)expect(Math.abs(header!.x+header!.width+overflow-group.right)).toBeLessThan(2);
      else {
        const login=await page.locator('.experience-header-actions a[href="/login"]').boundingBox();
        expect(group.right).toBeLessThanOrEqual(login!.x);
        expect(Math.abs(header!.x+header!.width+overflow-login!.x-login!.width)).toBeLessThan(2);
      }
      let end=group.x;
      for(const button of buttons){
        const box=await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x).toBeGreaterThanOrEqual(end-1);
        expect(Math.abs(box!.y-group.y)).toBeLessThan(2);
        end=box!.x+box!.width;
      }
      const back=await page.locator('.feed-nav-back').boundingBox();
      expect(back!.x+back!.width).toBeLessThanOrEqual(group.x+1);
      expect(Math.abs(back!.y+back!.height/2-boxes[0]!.y-boxes[0]!.height/2)).toBeLessThan(2);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      // DOM order also keeps keyboard navigation consistent with the toolbar.
      expect(await page.locator('.experience-header-actions').evaluate((node,owner)=>(owner?node.lastElementChild:node.firstElementChild)?.classList.contains('feed-header-actions'),owner)).toBe(true);
    };
    await check();
    await page.screenshot({path:`.local-reports/feed-header/${info.project.name}-${owner?'owner':'guest'}-${width}.png`});
    for (const language of ['fr', 'ar']) {
      await page.evaluate(language=>{
        localStorage.setItem('dn_language',language);
        window.dispatchEvent(new Event('dn-language'));
      },language);
      await expect(page.locator('.feed-nav-back')).toHaveText(language==='fr'?'Retour':'رجوع');
      await check();
    }
    await page.evaluate(()=>{
      document.documentElement.style.fontSize='200%';
      localStorage.setItem('dn_language','ar');
      window.dispatchEvent(new Event('dn-language'));
    });
    await check(true);
  });
}
