import { expect, test } from '@playwright/test';

for (const owner of [true,false]) for (const width of [320,390,1280]) {
  test(`feed and account controls remain accessible: ${owner?'owner':'guest'}, ${width}px`, async ({page},info)=>{
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
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading',{name:'News',exact:true})).toBeVisible();
    const header=page.locator('.experience-header');
    const heading=page.locator('.page-heading');
    const actions=heading.locator('.feed-header-actions');
    const accountControl=owner?header.locator('.avatar-button'):header.getByRole('link',{name:'Log in'});
    await expect(accountControl).toBeVisible();
    await expect(header.locator('.feed-header-actions')).toHaveCount(0);
    await expect(actions.getByRole('button',{name:/Star/})).toBeVisible();
    await expect(actions.getByRole('button',{name:'Share'})).toBeVisible();
    if(owner) await expect(actions.getByRole('button',{name:'Edit feed settings'})).toBeVisible();
    else await expect(actions.getByRole('button')).toHaveCount(2);

    const preferences=header.locator('.appearance-menu > summary');
    if(!owner&&width<900) await expect(preferences).toBeVisible();
    else await expect(preferences).toBeHidden();
    for(const control of [header.locator('.language-cycle'),header.locator('.theme-toggle')]) {
      if(width>=900) await expect(control).toBeVisible();
      else await expect(control).toBeHidden();
    }

    const check=async(enlarged=false)=>{
      if(!enlarged) expect(await header.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
      const author=(await heading.locator('p').boundingBox())!;
      const toolbar=(await page.locator('.feed-tools').boundingBox())!;
      const boxes=await actions.locator('button').evaluateAll(buttons=>buttons.map(button=>{
        const {left,right,top,bottom,width,height}=button.getBoundingClientRect();
        return {left,right,top,bottom,width,height};
      }).sort((a,b)=>a.left-b.left));
      let end=0;
      for(const box of boxes){
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThanOrEqual(end-1);
        expect(box.right).toBeLessThanOrEqual(width+1);
        expect(Math.abs(box.top-boxes[0].top)).toBeLessThan(2);
        expect(box.top).toBeGreaterThanOrEqual(author.y+author.height-1);
        expect(box.bottom).toBeLessThanOrEqual(toolbar.y+1);
        end=box.right;
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    };
    await check();
    await page.screenshot({path:`.local-reports/feed-header/${info.project.name}-${owner?'owner':'guest'}-${width}.png`});
    for (const language of ['fr', 'ar']) {
      await page.evaluate(language=>{
        localStorage.setItem('dn_language',language);
        window.dispatchEvent(new Event('dn-language'));
      },language);
      await expect(page.locator('.feed-nav-back')).toHaveText(language==='fr'?'Retour':'رجوع');
      await expect(page.locator('html')).toHaveAttribute('lang',language);
      await check();
    }
    if (!owner && width === 320) {
      // Linux and Windows resolve the system font stack differently.
      await page.addStyleTag({content: ':root.apple-ui { --app-font: Arial, sans-serif; }'});
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
