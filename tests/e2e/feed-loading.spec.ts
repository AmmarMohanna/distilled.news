import {expect,test,type Page,type Route} from '@playwright/test';
import { refreshFeed } from "./helpers";
const feed={id:'loading-feed',ownerUsername:'reader',slug:'news',title:'Reader News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',stars:0};
const edition=(id:string)=>({id,title:'Development '+id,summary:'Supported development '+id+' [1].',publishedAt:'2026-10-11T12:00:00Z',sections:[{title:'Development '+id,summary:'Supported development '+id+'.',evidence:[{messageId:'evidence-'+id,sourceTitle:'Original source',sourceUrl:'https://example.test/'+id,text:'Supported development '+id+'.',postedAt:'2026-10-11T10:00:00Z',links:[],media:[]}]}]});
const path='/api/feed/reader/news';
const requestFailed='Could not complete the request. Try again.';
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>release=resolve);return {promise,release}}
async function mock(page:Page,handler:(route:Route)=>Promise<void>){await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname===path)return handler(route);if(url.pathname.endsWith('/search'))return route.fulfill({json:{editions:[]}});return route.fulfill({json:url.pathname==='/api/auth/session'?{authenticated:false}:{feeds:[]}})})}
for(const language of ['en','fr','ar'])test('initial '+language+' loading does not claim no publications',async({page})=>{
 const pending=gate();await page.addInitScript(lang=>localStorage.setItem('dn_language',lang),language);
 await mock(page,async route=>{await pending.promise;await route.fulfill({json:{briefing:feed,editions:[]}})});
 await page.goto('/reader/news/');await expect(page.locator('.feed-empty-state')).toHaveCount(0);
 await expect(page.locator('.feed-tools')).toHaveCount(0);
 pending.release();await expect(page.locator('.briefings-empty')).toBeVisible();await expect(page.locator('.feed-tools')).toBeHidden();
});
test('initial errors never masquerade as empty feeds or keep claiming loading',async({page})=>{
 await mock(page,route=>route.fulfill({status:503,json:{error:'Feed read temporarily failed.'}}));
 await page.goto('/reader/news/');await expect(page.getByRole('alert')).toContainText(requestFailed);await expect(page.locator('.feed-empty-state')).toHaveCount(0);await expect(page.locator('.feed-tools')).toBeHidden();
 await expect(page.getByText('Feed read temporarily failed.')).toHaveCount(0);
});
test('refresh preserves read status and loaded pages while pending and after success',async({page})=>{
 let delay=false;const pending=gate();const editions=Array.from({length:25},(_,i)=>edition(String(i+1)));
 await mock(page,async route=>{if(delay)await pending.promise;await route.fulfill({json:{briefing:feed,editions}})});
 await page.goto('/reader/news/');const unread=page.locator('.news-item:not(.is-read)');await expect(unread).toHaveCount(20);
 await unread.first().getByRole('button',{name:/mark .* read/i}).click();await page.getByRole('button',{name:'Load More',exact:true}).click();await expect(unread).toHaveCount(24);
 delay=true;await refreshFeed(page);await expect(unread).toHaveCount(24);
 const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname===path);pending.release();await refreshed;await expect(unread).toHaveCount(24);await expect(page.locator('.news-item.is-read')).toHaveCount(1);await expect(page.locator('.news-item')).toHaveCount(25);
});
test('a failed refresh preserves previously published editions',async({page})=>{
 let failed=false;await mock(page,route=>failed?route.fulfill({status:503,json:{error:'Refresh unavailable.'}}):route.fulfill({json:{briefing:feed,editions:[edition('one')]}}));
 await page.goto('/reader/news/');await expect(page.locator('.news-item')).toHaveCount(1);failed=true;
 const refresh=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.status()===503);
 await refreshFeed(page);await refresh;await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.news-item')).toHaveCount(1);await expect(page.locator('.feed-empty-state')).toHaveCount(0);
});
test('concurrent focus refreshes coalesce and a later refresh retrieves newer data',async({page})=>{
 const pending=gate();let calls=0;await mock(page,async route=>{const call=++calls;if(call===2)await pending.promise;await route.fulfill({json:{briefing:feed,editions:[edition(call===2?'stale':call>=3?'latest':'initial')]}})});
 await page.goto('/reader/news/');await expect(page.locator('.news-headline')).toContainText('Development initial');
 const second=page.waitForRequest(r=>new URL(r.url()).pathname===path);await refreshFeed(page);await second;
 await refreshFeed(page);expect(calls).toBe(2);pending.release();await expect(page.locator('.news-headline')).toContainText('stale');await refreshFeed(page);await expect(page.locator('.news-headline')).toContainText('latest');await expect(page.getByText('Development stale')).toHaveCount(0);
});
test('navigation cannot inherit a pending response from another feed',async({page})=>{
 const previous=gate();
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname===path){await previous.promise;return route.fulfill({json:{briefing:feed,editions:[edition('previous-feed')]}}).catch(()=>{})}
  if(u.pathname==='/api/feed/reader/other')return route.fulfill({json:{briefing:{...feed,id:'other-feed',slug:'other',title:'Other feed'},editions:[edition('current-feed')]}});
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.feed-tools')).toHaveCount(0);
 await page.goto('/reader/other/');await expect(page.locator('.news-headline')).toContainText('current-feed');
 previous.release();await page.waitForTimeout(350);await expect(page.locator('.news-headline')).toContainText('current-feed');await expect(page.getByText('Development previous-feed')).toHaveCount(0);
});
test('initial read retry shows loading while its replacement response is pending',async({page})=>{
 const pending=gate();let recovering=false;
 await mock(page,async route=>{if(!recovering)return route.fulfill({status:503,json:{error:'Initial read failed.'}});await pending.promise;await route.fulfill({json:{briefing:feed,editions:[edition('recovered')]}})});
 await page.goto('/reader/news/');await expect(page.getByRole('alert')).toContainText(requestFailed);
 recovering=true;await refreshFeed(page);await expect(page.locator('.feed-tools')).toHaveCount(0);await expect(page.locator('.feed-empty-state')).toHaveCount(0);
 pending.release();await expect(page.locator('.news-headline')).toContainText('recovered');await expect(page.locator('.feed-tools')).toBeHidden();
});
