import {expect,test,type Page} from '@playwright/test';

const existing={id:'existing',ownerAccountId:'owner',ownerUsername:'product-proof',slug:'lebanon-news',title:'Lebanon news',stars:0,interestProfile:'Lebanon news',publicFeedEnabled:true,paused:false,language:'en',intensity:'medium',briefingCadence:'hourly',briefingTimeOfDay:'00:00',briefingTimezone:'Asia/Beirut',updateIntervalMinutes:30,retentionDays:15};
const added={...existing,id:'added',slug:'lebanon-news-clean-test',title:'Lebanon news clean test',publicFeedEnabled:false};

async function mock(page:Page,initial=[existing]){
 const state={feeds:initial,reads:0,writes:0,sources:[] as string[],hold:undefined as Promise<void>|undefined,failNext:false};
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(route.request().method()!=='GET')state.writes++;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'owner',username:'product-proof',role:'user'}}});
  if(path==='/api/me/briefings'){
   state.reads++;if(state.hold)await state.hold;
   if(state.failNext){state.failNext=false;return route.fulfill({status:503,json:{error:'temporarily unavailable'}});}
   return route.fulfill({json:{briefings:state.feeds}});
  }
  if(path==='/api/me/sources'){state.sources.push(url.searchParams.get('briefingId')!);return route.fulfill({json:{sources:[]}});}
  if(path==='/api/me/health')return route.fulfill({json:{health:{processing:{queued:0,completed:0,failed:0}}}});
  if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[existing]}});
  if(path.endsWith('/sketch'))return route.fulfill({status:404,body:''});
  if(path.startsWith('/api/feed/'))return route.fulfill({json:{briefing:existing,editions:[],viewerHasStarred:false}});
  return route.fulfill({json:{}});
 });
 return state;
}
const cards=(page:Page)=>page.locator('.home-view .personal-feed-grid');

test('new private feed appears on resume without reload or duplicate reads',async({page})=>{
 const state=await mock(page);await page.goto('/');
 await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 await expect.poll(()=>state.sources).toEqual(['existing']);
 state.feeds=[added,existing];let release!:()=>void;state.hold=new Promise<void>(resolve=>{release=resolve;});
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>state.reads,{timeout:3000}).toBe(2);
 state.hold=undefined;release();
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.reads).toBe(2);expect(state.sources).toEqual(['existing']);expect(state.writes).toBe(0);
});

test('an empty owned list can discover the first externally created feed',async({page})=>{
 const state=await mock(page,[]);await page.goto('/');
 await expect(page.getByText('You haven’t created any feeds yet.')).toBeVisible();
 state.feeds=[added];await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});

test('a failed background refresh preserves visible feeds and can retry on the next resume',async({page})=>{
 const state=await mock(page);await page.goto('/');await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 state.failNext=true;
 const failed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/me/briefings'&&r.status()===503);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await failed;
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Home',exact:true}).click();
 await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 state.feeds=[existing,added];await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.reads).toBe(3);expect(state.writes).toBe(0);
});

test('resume does not overwrite an unsaved feed draft',async({page})=>{
 const state=await mock(page);await page.goto('/');await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Add feed'});
 await dialog.getByLabel('Feed name').fill('My unsaved feed');
 await dialog.getByLabel('What would you like to follow?').fill('Keep my unsaved interests');
 state.feeds=[existing,added];await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));});
 await expect(dialog.getByLabel('Feed name')).toHaveValue('My unsaved feed');
 await expect(dialog.getByLabel('What would you like to follow?')).toHaveValue('Keep my unsaved interests');
 expect(state.reads).toBe(1);expect(state.writes).toBe(0);
 await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.writes).toBe(0);
});

test('hidden apps defer the read until they become visible',async({page})=>{
 const state=await mock(page);await page.goto('/');await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 state.feeds=[existing,added];
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
  document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));
 });
 expect(state.reads).toBe(1);
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});

test('an in-flight resume response is ignored if editing starts before it arrives',async({page})=>{
 const state=await mock(page);await page.goto('/');await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();
 let release!:()=>void;state.hold=new Promise<void>(resolve=>{release=resolve;});state.feeds=[existing,added];
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>state.reads).toBe(2);
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Add feed'});
 await dialog.getByLabel('Feed name').fill('Keep this draft');
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/me/briefings');
 state.hold=undefined;release();await (await response).finished();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
 await expect(dialog.getByLabel('Feed name')).toHaveValue('Keep this draft');
 await expect(cards(page).getByText(added.title,{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(cards(page).getByText(added.title,{exact:true})).toBeVisible();
 expect(state.reads).toBe(3);expect(state.writes).toBe(0);
});

test('initial owned-feed loading never flashes an empty list, including the archive',async({page})=>{
 const state=await mock(page);let release!:()=>void;state.hold=new Promise<void>(resolve=>{release=resolve;});await page.goto('/');
 await expect(page.locator('.home-view').getByText(/^Loading feeds/)).toBeVisible();await expect(page.getByText(/created any feeds yet/)).toHaveCount(0);await expect(cards(page).locator('.topic-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Archived feeds',exact:true}).click();await expect(page.getByRole('dialog').getByText(/^Loading feeds/)).toBeVisible();await expect(page.getByText('No archived feeds',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Close dialog'}).click();
 release();await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();await expect(page.locator('.home-view').getByText(/^Loading feeds/)).toHaveCount(0);
});
test('a genuinely empty owned list appears only after a successful response',async({page})=>{
 const state=await mock(page,[]);let release!:()=>void;state.hold=new Promise<void>(resolve=>{release=resolve;});await page.goto('/');
 await expect(page.locator('.home-view').getByText(/^Loading feeds/)).toBeVisible();await expect(page.getByText(/created any feeds yet/)).toHaveCount(0);release();await expect(page.getByText(/created any feeds yet/)).toBeVisible();
});
test('an initial owned-feed API failure is not presented as having no feeds',async({page})=>{
 const state=await mock(page);state.failNext=true;await page.goto('/');await expect(page.locator('.feed-list-state[role=alert]')).toContainText("Couldn't load your feeds");await expect(page.getByText(/created any feeds yet/)).toHaveCount(0);await expect(page.locator('.home-view').getByText(/^Loading feeds/)).toHaveCount(0);
 await page.getByRole('button',{name:'Try Again',exact:true}).click();await expect(cards(page).getByText(existing.title,{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});
