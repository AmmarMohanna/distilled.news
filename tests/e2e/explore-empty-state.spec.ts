import {expect,test} from '@playwright/test';

for(const [language,message] of [
 ['en','No community feeds are available yet.'],
 ['fr','Aucun fil communautaire n’est disponible pour le moment.'],
 ['ar','لا توجد خلاصات مجتمعية متاحة بعد.']
] as const)test(`successful empty Explore is explained in ${language}`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/auth/session'?{authenticated:false,setupRequired:false}:{feeds:[],nextOffset:null}}));
 await page.goto('/explore');
 await expect(page.locator('.explore-view .empty-copy')).toHaveText(message);
 await expect(page.locator('.explore-view [role="alert"]')).toHaveCount(0);
});

test('an Explore failure is not presented as an empty community and retries to the empty state',async({page})=>{
 let attempts=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(path==='/api/explore/feeds'&&++attempts===1)return route.fulfill({status:503,json:{error:'unavailable'}});
  return route.fulfill({json:{feeds:[],nextOffset:null}});
 });
 await page.goto('/explore');const explore=page.locator('.explore-view');
 await expect(explore.getByRole('alert')).toBeVisible();await expect(explore.locator('.empty-copy')).toHaveCount(0);
 await explore.getByRole('button',{name:'Try Again',exact:true}).click();
 await expect(explore.locator('.empty-copy')).toHaveText('No community feeds are available yet.');
});
