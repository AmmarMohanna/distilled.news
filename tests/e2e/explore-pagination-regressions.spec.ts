import {expect,test} from '@playwright/test';

const feeds=()=>Array.from({length:101},(_,i)=>({id:'feed-'+i,ownerAccountId:'publisher',ownerUsername:'publisher',slug:'feed-'+i,title:i===100?'Hidden astronomy':'Science '+i,stars:200-i,viewerHasStarred:i===99,publicFeedEnabled:true,paused:false,language:'en'}));

for(const initiallyStarred of [false,true])test(`a delayed stale Explore refresh cannot revert a confirmed vote (initially starred=${initiallyStarred})`,async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let reads=0;
 const record={...feeds()[0],viewerHasStarred:initiallyStarred};
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(u.pathname.endsWith('/star')){record.viewerHasStarred=route.request().postDataJSON().starred;return route.fulfill({json:{stars:record.stars,viewerHasStarred:record.viewerHasStarred}});}
  if(u.pathname==='/api/explore/feeds'){
   reads++;const snapshot={...record};
   if(reads===2){snapshot.viewerHasStarred=initiallyStarred;await gate;}
   return route.fulfill({json:{feeds:[snapshot],nextOffset:null}});
  }
  return route.fulfill({json:{briefings:[]}});
 });
 await page.goto('/explore');await page.locator('.feed-tile-grid').getByRole('button',{name:`${initiallyStarred?'Unstar':'Star'} Science 0`,exact:true}).click();
 const confirmed=page.locator('.feed-tile-grid').getByRole('button',{name:`${initiallyStarred?'Star':'Unstar'} Science 0`,exact:true});await expect(confirmed).toBeVisible();
 await expect.poll(()=>reads).toBe(2);await expect(page.locator('.explore-view')).toHaveAttribute('aria-busy','true');
 const stale=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/explore/feeds');release();await stale;
 await expect(page.locator('.explore-view')).toHaveAttribute('aria-busy','false');await expect(confirmed).toBeVisible();
});

test('removing an earlier feed invalidates the next page even without overlap',async({page})=>{
 const records=[...feeds(),{...feeds()[0],id:'feed-101',slug:'feed-101',title:'Last science',stars:99}],offsets:number[]=[];let revision='r1',first=true;
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(u.pathname==='/api/explore/feeds'){
   const offset=Number(u.searchParams.get('offset')??0);offsets.push(offset);
   if(offset>0&&u.searchParams.get('revision')!==revision)return route.fulfill({status:409,json:{error:'Community feed listing changed. Reload it.',code:'EXPLORE_CHANGED'}});
   const visible=records.filter(feed=>!feed.paused).sort((a,b)=>b.stars-a.stars),body={feeds:visible.slice(offset,offset+100).map(feed=>({...feed})),nextOffset:offset+100<visible.length?offset+100:null,revision};
   if(first){first=false;records[5].paused=true;revision='r2';}
   return route.fulfill({json:body});
  }
  return route.fulfill({json:{briefings:[]}});
 });
 await page.goto('/explore');await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(100);
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect.poll(()=>offsets).toEqual([0,100,0]);
 await expect(page.locator('.feed-tile-grid .feed-tile-caption').filter({hasText:'Hidden astronomy'})).toBeVisible();await page.getByRole('button',{name:'Load more feeds',exact:true}).click();
 await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(101);expect(offsets).toEqual([0,100,0,100]);
});
test('a star change restarts ranked pagination so the feed moving into page one is not skipped',async({page})=>{
 const records=feeds(),offsets:number[]=[];
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:true,setupRequired:false,account:{id:'reader',username:'reader',role:'user'}}});
  if(u.pathname==='/api/explore/feeds'){
   const offset=Number(u.searchParams.get('offset')??0);offsets.push(offset);
   const sorted=[...records].sort((a,b)=>b.stars-a.stars);
   return route.fulfill({json:{feeds:sorted.slice(offset,offset+100),nextOffset:offset+100<sorted.length?offset+100:null}});
  }
  if(u.pathname.endsWith('/star')){records[99].stars=0;records[99].viewerHasStarred=false;return route.fulfill({json:{stars:0,viewerHasStarred:false}});}
  return route.fulfill({json:{briefings:[]}});
 });
 await page.goto('/explore');await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(100);
 await page.locator('.feed-tile-grid').getByRole('button',{name:'Unstar Science 99',exact:true}).click();
 await expect.poll(()=>offsets).toEqual([0,0]);await expect(page.locator('.feed-tile-grid .feed-tile-caption').filter({hasText:'Hidden astronomy'})).toBeVisible();
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(101);
 expect(offsets).toEqual([0,0,100]);
});

test('a partial Explore search explains its scope and finds a match after loading more',async({page})=>{
 const records=feeds();
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(u.pathname==='/api/explore/feeds'){const offset=Number(u.searchParams.get('offset')??0);return route.fulfill({json:{feeds:records.slice(offset,offset+100),nextOffset:offset===0?100:null}});}
  return route.fulfill({json:{briefings:[]}});
 });
 await page.goto('/explore');await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(100);
 await page.getByRole('searchbox',{name:'Search feeds',exact:true}).fill('astronomy');
 await expect(page.locator('.explore-view [role="status"]')).toHaveText('No matches in loaded feeds. Load more feeds to continue searching.');
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(1);await expect(page.locator('.feed-tile-grid .feed-tile-caption')).toContainText('Hidden astronomy');
 await page.getByRole('searchbox',{name:'Search feeds',exact:true}).fill('missing');await expect(page.locator('.explore-view [role="status"]')).toHaveText('No feeds match your search.');
});

test('a ranking change by another reader restarts an overlapping page instead of silently skipping a feed',async({page})=>{
 const records=feeds(),offsets:number[]=[];let moved=false;
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(u.pathname==='/api/explore/feeds'){
   const offset=Number(u.searchParams.get('offset')??0);offsets.push(offset);
   const sorted=[...records].sort((a,b)=>b.stars-a.stars);
   const body={feeds:sorted.slice(offset,offset+100),nextOffset:offset+100<sorted.length?offset+100:null};
   if(!moved){moved=true;records[100].stars=999;}
   return route.fulfill({json:body});
  }
  return route.fulfill({json:{briefings:[]}});
 });
 await page.goto('/explore');await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(100);
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();
 await expect.poll(()=>offsets).toEqual([0,100,0]);await expect(page.locator('.feed-tile-grid .feed-tile-caption').filter({hasText:'Hidden astronomy'})).toBeVisible();
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .feed-tile-grid .feed-tile')).toHaveCount(101);expect(offsets).toEqual([0,100,0,100]);
});
