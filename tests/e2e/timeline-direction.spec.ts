import {expect,test} from '@playwright/test';
for(const language of ['en','ar'])for(const contentLanguage of ['en','ar'])for(const width of [320,390,1440])test('timeline '+language+' interface, '+contentLanguage+' article at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:0,interestProfile:'News',publicFeedEnabled:true,paused:false,language:contentLanguage,briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
 const edition={id:'one',briefingId:'news',title:'Update',summary:contentLanguage==='ar'?'تحديث إخباري.':'A news update.',publishedAt:new Date().toISOString(),sections:[]};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:false}:path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false}:{}});});
 await page.goto('/owner/news/');const time=page.locator('.news-head time');await expect(time).toBeVisible();const box=await time.boundingBox(),card=await page.locator('.news-item').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
 if(language==='ar')expect(box!.x).toBeGreaterThanOrEqual(card!.x+card!.width);else expect(box!.x+box!.width).toBeLessThanOrEqual(card!.x);
 if(width<700)expect(parseFloat(await time.evaluate(n=>getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(12);
 expect(await page.locator('.news-item').getAttribute('dir')).toBe(contentLanguage==='ar'?'rtl':'ltr');
});
