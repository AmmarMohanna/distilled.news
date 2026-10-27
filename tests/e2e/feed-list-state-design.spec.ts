import {expect,test,type Page} from '@playwright/test';

async function setup(page:Page,width:number,dark:boolean,arabic=false){
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(({dark,arabic})=>{localStorage.setItem('dn_theme',dark?'dark':'light');localStorage.setItem('dn_language',arabic?'ar':'en');},{dark,arabic});
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});let reads=0;
 const feed={id:'existing',ownerAccountId:'owner',ownerUsername:'reader',slug:'news',title:'Lebanon news',stars:0,interestProfile:'Lebanon',publicFeedEnabled:true,paused:false,language:'en',intensity:'medium',briefingCadence:'hourly',briefingTimeOfDay:'00:00',briefingTimezone:'Asia/Beirut',updateIntervalMinutes:30,retentionDays:15};
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'owner',username:'reader',role:'user'}}});if(path==='/api/me/briefings'){reads++;if(reads===1){await pending;return route.fulfill({status:503,json:{error:'temporarily unavailable'}}).catch(()=>{});}return route.fulfill({json:{briefings:[feed]}});}if(path.endsWith('/sketch'))return route.fulfill({status:404});return route.fulfill({json:path==='/api/explore/feeds'?{feeds:[]}:path==='/api/me/sources'?{sources:[]}:path==='/api/me/health'?{health:{}}:{}});});
 await page.goto('/');return {release,reads:()=>reads};
}
for(const width of [320,390,1280])for(const dark of [false,true])test(`branded loading and retry at ${width}px ${dark?'dark':'light'}`,async({page},info)=>{
 const state=await setup(page,width,dark);
 try{
  const surface=page.locator('.home-view .feed-list-state');await expect(surface).toBeVisible();await expect(surface).toHaveAttribute('role','status');await expect(surface.locator('button')).toHaveCount(0);await expect(page.getByText(/created any feeds yet/)).toHaveCount(0);
  await page.screenshot({path:`.local-reports/feed-loading-design/${info.project.name}-${width}-${dark?'dark':'light'}-loading.png`,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await surface.locator('.feed-state-logo.is-loading').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  state.release();await expect(surface).toHaveAttribute('role','alert');const retry=surface.getByRole('button',{name:'Try Again',exact:true});await expect(retry).toBeVisible();
  await page.screenshot({path:`.local-reports/feed-loading-design/${info.project.name}-${width}-${dark?'dark':'light'}-error.png`,animations:'disabled'});
  const bounds=await retry.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  await retry.focus();await expect(retry).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('.personal-feed-grid')).toContainText('Lebanon news');await expect(surface).toHaveCount(0);expect(state.reads()).toBe(2);
 }finally{state.release();}
});
test('Arabic enlarged loading and retry fit a narrow screen',async({page},info)=>{
 const state=await setup(page,320,true,true);try{await page.addStyleTag({content:'html {font-size:200% !important;}'});const surface=page.locator('.home-view .feed-list-state');await expect(surface).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir','rtl');state.release();await expect(surface.getByRole('button')).toBeVisible();await page.screenshot({path:`.local-reports/feed-loading-design/${info.project.name}-arabic-large.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const button=surface.getByRole('button');expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);await button.click();await expect(page.locator('.personal-feed-grid')).toContainText('Lebanon news');}finally{state.release();}
});
