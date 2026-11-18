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
 await expect(view.locator('.experience-header')).toBeVisible();
 await expect(view.locator('.experience-brand')).toBeVisible();
 const logo=await view.locator('.distilled-logo').boundingBox(),actions=await view.locator('.experience-header-actions').boundingBox();
 expect(logo&&actions&&(logo.x+logo.width<=actions.x+1||actions.x+actions.width<=logo.x+1)).toBe(true);
 await expect(view.locator('.private-feed-lock')).toBeVisible();
 expect(await view.locator('.private-feed-lock').evaluate(icon=>getComputedStyle(icon).color)).toBe('rgb(94, 92, 230)');
 await expect(view.locator('.private-feed-lock circle')).toHaveCount(0);
 await expect(page.locator('.feed-header-actions,.feed-search,.news-item')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 expect(await page.locator('.app-pages > .screen-page-viewport').evaluate(view=>view.scrollHeight>view.clientHeight+1)).toBe(false);
 const explore=view.locator('.private-feed-explore');await expect(explore).toBeVisible();await expect(explore).toHaveAttribute('href','/');
 if(language==='en')await expect(explore).toHaveText('Explore public feeds');
 const selectors=['.experience-header','.experience-header .distilled-logo','.experience-header-actions'];
 const before=await Promise.all(selectors.map(selector=>view.locator(selector).boundingBox()));
 await explore.click();await expect(page).toHaveURL(/\/$/);await expect(page.locator('.private-feed-page')).toHaveCount(0);
 await expect(page.locator('.guest-landing > .experience-header')).toBeVisible();
 const after=await Promise.all(selectors.map(selector=>page.locator(selector).boundingBox()));
 for(let n=0;n<selectors.length;n++)for(const key of ['x','y','width','height'] as const){
  expect(before[n]).not.toBeNull();expect(after[n]).not.toBeNull();expect(Math.abs(before[n]![key]-after[n]![key]),selectors[n]+' '+key).toBeLessThan(1.5);
 }
});

test('the private page header retains the signed-in account profile control',async({page})=>{
 await page.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/auth/session'?route.fulfill({json:{authenticated:true,setupRequired:false,account:{id:'visitor',username:'visitor',email:'visitor@example.invalid',role:'user'}}}):route.fulfill({status:404,json:{error:'feed not found'}}));
 await page.goto('/owner/private-feed/');
 await page.getByRole('button',{name:'Account profile',exact:true}).click();
 await expect(page.locator('.profile-dialog')).toBeVisible();
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
