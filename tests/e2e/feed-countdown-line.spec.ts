import {expect,test} from '@playwright/test';

for(const width of [320,390,1280]) for(const language of ['en','fr','ar']) {
  test(`feed countdown and summary stay on one line: ${language} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.clock.install({time:new Date('2026-11-02T08:00:00Z')});
    await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
    const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:1,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',nextBriefingAt:'2026-11-02T14:58:00Z',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/sketch'))return route.fulfill({status:404});
      return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path.startsWith('/api/feed/')?{briefing:feed,editions:[{id:'one',briefingId:'news',title:'News',summary:'One update.',publishedAt:'2026-11-02T07:00:00Z',sections:[{title:'News',summary:'One update.',evidence:[]}]}],unreadSummaryAvailable:true}:{}});
    });
    await page.goto('/owner/news/');
    const status=page.locator('.feed-check-status'),summary=page.locator('.unread-summary-button');
    await expect(status).toBeVisible();await expect(summary).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    const label=page.locator(width<=700?'.feed-check-status-compact':'.feed-check-status-full');
    await expect(label).toBeVisible();
    expect(await label.evaluate(node=>{
      const range=document.createRange();range.selectNodeContents(node);
      // Arabic/numeral runs create separate bidi fragments on the same line.
      const tops=Array.from(range.getClientRects(),rect=>rect.top);
      return Math.max(...tops)-Math.min(...tops)<parseFloat(getComputedStyle(node).lineHeight)/2;
    })).toBe(true);
    for(const control of [status,summary])expect(await control.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    const a=(await status.boundingBox())!,b=(await summary.boundingBox())!;
    expect(Math.abs(a.y-b.y)).toBeLessThan(1);expect(Math.abs(a.height-b.height)).toBeLessThan(1);
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(language==='en')await expect(status).toHaveAttribute('aria-label','Next daily brief in 6h 58m');
  });
}
