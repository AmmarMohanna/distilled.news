import {expect,test,type Page,type Route} from '@playwright/test';
const feed={id:'loading-feed',ownerUsername:'reader',slug:'news',title:'Reader News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',stars:0};
const edition=(id:string)=>({id,title:'Development '+id,summary:'Supported development '+id+' [1].',publishedAt:'2026-10-11T12:00:00Z',sections:[{title:'Development '+id,summary:'Supported development '+id+'.',evidence:[{messageId:'evidence-'+id,sourceTitle:'Original source',sourceUrl:'https://example.test/'+id,text:'Supported development '+id+'.',postedAt:'2026-10-11T10:00:00Z',links:[],media:[]}]}]});
const path='/api/feed/reader/news';
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>release=resolve);return {promise,release}}
async function mock(page:Page,handler:(route:Route)=>Promise<void>){await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname===path)return handler(route);if(url.pathname.endsWith('/search'))return route.fulfill({json:{editions:[]}});return route.fulfill({json:url.pathname==='/api/auth/session'?{authenticated:false}:{feeds:[]}})})}
for(const language of ['en','fr','ar'])test('initial '+language+' loading does not claim no publications',async({page})=>{
 const pending=gate();await page.addInitScript(lang=>localStorage.setItem('dn_language',lang),language);
 await mock(page,async route=>{await pending.promise;await route.fulfill({json:{briefing:feed,editions:[]}})});
 await page.goto('/reader/news/');await expect(page.locator('.feed-empty-state')).toHaveCount(0);
 await expect(page.locator('.feed-loading-message')).toBeVisible();
 pending.release();await expect(page.locator('.feed-empty-state')).toBeVisible();await expect(page.locator('.feed-loading-message')).toHaveCount(0);
});
test('initial errors never masquerade as empty feeds or keep claiming loading',async({page})=>{
 await mock(page,route=>route.fulfill({status:503,json:{error:'Feed read temporarily failed.'}}));
 await page.goto('/reader/news/');await expect(page.getByText('Feed read temporarily failed.')).toBeVisible();await expect(page.locator('.feed-empty-state')).toHaveCount(0);await expect(page.locator('.feed-loading-message')).toHaveCount(0);
 await page.getByPlaceholder('Search briefings').press('Enter');await expect(page.getByText('Feed read temporarily failed.')).toBeVisible();
});
test('refresh preserves read status, loaded pages and expanded citations while pending and after success',async({page})=>{
 let delay=false;const pending=gate();const editions=Array.from({length:25},(_,i)=>edition(String(i+1)));
 await mock(page,async route=>{if(delay)await pending.promise;await route.fulfill({json:{briefing:feed,editions}})});
 await page.goto('/reader/news/');const unread=page.locator('.news-line:not(.news-line-read) .news-item');await expect(unread).toHaveCount(20);
 await unread.first().getByRole('button',{name:/mark .* read/i}).click();await page.getByRole('button',{name:'load more',exact:true}).click();await expect(unread).toHaveCount(24);
 await unread.first().getByRole('button',{name:/show /i}).click();await expect(page.locator('.reference-digest-row')).toHaveCount(1);
 delay=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(unread).toHaveCount(24);await expect(page.locator('.reference-digest-row')).toHaveCount(1);
 const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname===path);pending.release();await refreshed;await expect(unread).toHaveCount(24);await expect(page.locator('.reference-digest-row')).toHaveCount(1);await expect(page.locator('.news-line-read .news-item')).toHaveCount(1);
});
test('a failed refresh preserves previously published editions',async({page})=>{
 let failed=false;await mock(page,route=>failed?route.fulfill({status:503,json:{error:'Refresh unavailable.'}}):route.fulfill({json:{briefing:feed,editions:[edition('one')]}}));
 await page.goto('/reader/news/');await expect(page.locator('.news-item')).toHaveCount(1);failed=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText('Refresh unavailable.')).toBeVisible();await expect(page.locator('.news-item')).toHaveCount(1);await expect(page.locator('.feed-empty-state')).toHaveCount(0);
});
test('an older refresh response cannot overwrite a newer successful response',async({page})=>{
 const pending=gate();let calls=0;await mock(page,async route=>{const call=++calls;if(call===2)await pending.promise;await route.fulfill({json:{briefing:feed,editions:[edition(call===2?'stale':call>=3?'latest':'initial')]}})});
 await page.goto('/reader/news/');await expect(page.locator('.news-summary')).toContainText('Supported development initial');
 const second=page.waitForRequest(r=>new URL(r.url()).pathname===path);await page.getByRole('button',{name:'Refresh',exact:true}).click();await second;
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.news-summary')).toContainText('latest');pending.release();await page.waitForTimeout(350);await expect(page.locator('.news-summary')).toContainText('latest');await expect(page.getByText('Supported development stale')).toHaveCount(0);
});
test('stale search and refresh responses cannot replace the current search results',async({page})=>{
 const oldSearch=gate();let reads=0;
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());if(u.pathname===path){reads++;return route.fulfill({json:{briefing:feed,editions:[edition('unfiltered')]}})}
  if(u.pathname.endsWith('/search')){const q=u.searchParams.get('q');if(q==='old')await oldSearch.promise;return route.fulfill({json:{editions:[edition(q!)]}})}
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.news-item')).toHaveCount(1);
 const oldRequest=page.waitForRequest(r=>r.url().includes('/search?q=old'));await page.getByPlaceholder('Search briefings').fill('old');await oldRequest;
 await page.getByPlaceholder('Search briefings').fill('current');await expect(page.locator('.news-summary')).toContainText('current');
 oldSearch.release();await page.waitForTimeout(350);await expect(page.locator('.news-summary')).toContainText('current');
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect.poll(()=>reads).toBeGreaterThan(1);await page.waitForTimeout(350);await expect(page.locator('.news-summary')).toContainText('current');
});

test('navigation cannot inherit a pending response from another feed',async({page})=>{
 const previous=gate();
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname===path){await previous.promise;return route.fulfill({json:{briefing:feed,editions:[edition('previous-feed')]}}).catch(()=>{})}
  if(u.pathname==='/api/feed/reader/other')return route.fulfill({json:{briefing:{...feed,id:'other-feed',slug:'other',title:'Other feed'},editions:[edition('current-feed')]}});
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.feed-loading-message')).toBeVisible();
 await page.goto('/reader/other/');await expect(page.locator('.news-summary')).toContainText('current-feed');
 previous.release();await page.waitForTimeout(350);await expect(page.locator('.news-summary')).toContainText('current-feed');await expect(page.getByText('Supported development previous-feed')).toHaveCount(0);
});
test('a late detail response cannot reopen a withdrawn edition after refresh',async({page})=>{
 const pending=gate();let withdrawn=false;
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname===path)return route.fulfill({json:{briefing:feed,editions:withdrawn?[]:[{...edition('one'),sections:[]}]}});
  if(u.pathname===path+'/editions/one'){await pending.promise;return route.fulfill({json:{edition:edition('one')}})}
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.news-item')).toHaveCount(1);
 const detail=page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/editions/one'));await page.getByRole('button',{name:/show /i}).click();await detail;
 withdrawn=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.news-item')).toHaveCount(0);
 const finished=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/editions/one'));pending.release();await finished;
 await expect(page.locator('.news-item')).toHaveCount(0);await expect(page.locator('.reference-digest-row')).toHaveCount(0);
});

test('refresh removes withdrawn prose from active search results even if search subsequently fails',async({page})=>{
 let withdrawn=false;
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname===path)return route.fulfill({json:{briefing:feed,editions:withdrawn?[]:[edition('one')]}});
  if(u.pathname.endsWith('/search'))return withdrawn?route.fulfill({status:503,json:{error:'Search unavailable.'}}):route.fulfill({json:{editions:[edition('one')]}});
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.news-item')).toHaveCount(1);
 const searched=page.waitForResponse(r=>r.url().includes('/search?q=one'));await page.getByPlaceholder('Search briefings').fill('one');await searched;
 withdrawn=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.news-item')).toHaveCount(0);await expect(page.getByText('Search unavailable.')).toBeVisible();
 await expect(page.getByText('Supported development one')).toHaveCount(0);
});

test('initial read retry shows loading while its replacement response is pending',async({page})=>{
 const pending=gate();let reads=0;
 await mock(page,async route=>{if(++reads===1)return route.fulfill({status:503,json:{error:'Initial read failed.'}});await pending.promise;await route.fulfill({json:{briefing:feed,editions:[edition('recovered')]}})});
 await page.goto('/reader/news/');await expect(page.getByText('Initial read failed.')).toBeVisible();
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.locator('.feed-loading-message')).toBeVisible();await expect(page.locator('.feed-empty-state')).toHaveCount(0);
 pending.release();await expect(page.locator('.news-summary')).toContainText('recovered');await expect(page.locator('.feed-loading-message')).toHaveCount(0);
});
test('clearing a failed search restores the successful empty feed without a stale error',async({page})=>{
 await page.route('**/api/**',route=>{
  const u=new URL(route.request().url());if(u.pathname===path)return route.fulfill({json:{briefing:feed,editions:[]}});
  if(u.pathname.endsWith('/search'))return route.fulfill({status:503,json:{error:'Search unavailable.'}});
  return route.fulfill({json:{authenticated:false,feeds:[]}});
 });
 await page.goto('/reader/news/');await expect(page.locator('.feed-empty-state')).toBeVisible();
 await page.getByPlaceholder('Search briefings').fill('test');await expect(page.getByText('Search unavailable.')).toBeVisible();
 await page.getByPlaceholder('Search briefings').fill('');await expect(page.getByText('Search unavailable.')).toHaveCount(0);await expect(page.locator('.feed-empty-state')).toBeVisible();
});
