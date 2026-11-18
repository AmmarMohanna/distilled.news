import {expect,test} from '@playwright/test';

for(const [language,message] of [
 ['en','You can’t access this private feed.'],
 ['fr','Vous ne pouvez pas accéder à ce fil privé.'],
 ['ar','لا يمكنك الوصول إلى هذه الخلاصة الخاصة.']
] as const)test(`inaccessible feeds show a branded lock page in ${language}`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  return route.fulfill({status:404,json:{error:'feed not found'}});
 });
 await page.goto('/owner/private-feed/');
 await expect(page.getByRole('heading',{level:1})).toHaveText(message);
 const view=page.locator('.private-feed-page');await expect(view).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
 await expect(view.locator('svg')).toBeVisible();
 expect(await view.locator('svg').evaluate(icon=>getComputedStyle(icon).color)).toBe('rgb(94, 92, 230)');
 await expect(page.locator('.feed-header-actions,.feed-search,.news-item')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
});

test('temporary server errors are not labelled as private access denials',async({page})=>{
 await page.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/auth/session'?route.fulfill({json:{authenticated:false,setupRequired:false}}):route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.goto('/owner/news/');
 await expect(page.locator('.feed-shell')).toBeVisible();
 await expect(page.locator('.private-feed-page')).toHaveCount(0);
});

test('a feed becoming private clears previously loaded reader content',async({page})=>{
 let privateNow=false;
 const briefing={id:'access-test',ownerUsername:'owner',slug:'news',title:'Public news',publicFeedEnabled:true,language:'en',briefingCadence:'daily',briefingTimezone:'UTC'};
 const edition={id:'edition',briefingId:briefing.id,title:'Protected headline',summary:'Protected headline',publishedAt:new Date().toISOString(),sections:[{title:'Protected headline',summary:'Protected headline',evidence:[]}]};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  if(path==='/api/feed/owner/news')return privateNow?route.fulfill({status:404,json:{error:'feed not found'}}):route.fulfill({json:{briefing,editions:[edition],viewerHasStarred:false}});
  return route.fulfill({json:{}});
 });
 await page.goto('/owner/news/');await expect(page.locator('.news-item')).toContainText('Protected headline');
 privateNow=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('.private-feed-page')).toBeVisible();
 await expect(page.getByText('Protected headline',{exact:true})).toHaveCount(0);
});
