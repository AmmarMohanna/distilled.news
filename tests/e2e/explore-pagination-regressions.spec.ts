import {expect,test} from '@playwright/test';

const feeds=()=>Array.from({length:101},(_,i)=>({id:'feed-'+i,ownerAccountId:'publisher',ownerUsername:'publisher',slug:'feed-'+i,title:i===100?'Hidden astronomy':'Science '+i,stars:200-i,viewerHasStarred:i===99,publicFeedEnabled:true,paused:false,language:'en'}));
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
 await page.goto('/explore');await expect(page.locator('.explore-view .topic-card')).toHaveCount(100);
 await page.getByRole('button',{name:'Unstar Science 99',exact:true}).click();
 await expect.poll(()=>offsets).toEqual([0,0]);await expect(page.locator('.topic-name').filter({hasText:'Hidden astronomy'})).toBeVisible();
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .topic-card')).toHaveCount(101);
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
 await page.goto('/explore');await expect(page.locator('.explore-view .topic-card')).toHaveCount(100);
 await page.getByRole('searchbox',{name:'Search feeds',exact:true}).fill('astronomy');
 await expect(page.locator('.explore-view [role="status"]')).toHaveText('No matches in loaded feeds. Load more feeds to continue searching.');
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .topic-card')).toHaveCount(1);await expect(page.locator('.topic-name')).toContainText('Hidden astronomy');
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
 await page.goto('/explore');await expect(page.locator('.explore-view .topic-card')).toHaveCount(100);
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();
 await expect.poll(()=>offsets).toEqual([0,100,0]);await expect(page.locator('.topic-name').filter({hasText:'Hidden astronomy'})).toBeVisible();
 await page.getByRole('button',{name:'Load more feeds',exact:true}).click();await expect(page.locator('.explore-view .topic-card')).toHaveCount(101);expect(offsets).toEqual([0,100,0,100]);
});
