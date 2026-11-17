import {expect,test,type Page} from '@playwright/test';
const feed={id:'science',ownerAccountId:'publisher',ownerUsername:'publisher',slug:'science',title:'Science',stars:2,interestProfile:'Science',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15,viewerHasStarred:true,latestUpdatedAt:'2026-11-16T12:00:00Z'};
const account=(id='reader')=>({id,username:id,email:id+'@example.invalid',role:'user'});
const edition={id:'edition-one',briefingId:feed.id,title:'A development',summary:'Officials proposed a change.',publishedAt:new Date().toISOString(),sections:[{title:'A proposal',summary:'Officials proposed a change.',evidence:[]}]};
async function loggedIn(page:Page){
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:account()}:path==='/api/me/briefings'?{briefings:[]}:path==='/api/explore/feeds'?{feeds:[],nextOffset:null}:{}});
 });
}

test('successful login survives a feed-list outage and retry needs no second login',async({page})=>{
 let authenticated=false,logins=0,reads=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/login'){authenticated=true;logins++;return route.fulfill({json:{ok:true,account:account()}});}
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated,setupRequired:false,...(authenticated?{account:account()}:{})}});
  if(path==='/api/me/briefings'){reads++;return reads===1?route.fulfill({status:503,json:{error:'temporarily unavailable'}}):route.fulfill({json:{briefings:[{...feed,ownerAccountId:'reader',ownerUsername:'reader'}]}});}
  return route.fulfill({json:path==='/api/explore/feeds'?{feeds:[],nextOffset:null}:{}});
 });
 await page.goto('/login');await page.getByLabel('email',{exact:true}).fill('reader@example.invalid');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('password',{exact:true}).fill('test-password');
 await page.locator('.auth-submit').click();
 await expect(page.getByRole('button',{name:'Account profile'})).toBeVisible();await expect(page.locator('.auth-dialog')).toHaveCount(0);
 await expect(page.locator('.home-view .feed-list-state')).toHaveAttribute('role','alert');
 await page.locator('.home-view .feed-list-state').getByRole('button',{name:'Try Again'}).click();
 await expect(page.locator('.personal-feed-grid')).toContainText('Science');expect(logins).toBe(1);expect(reads).toBe(2);
});

test('tabs survive refresh and follow browser Back and Forward',async({page})=>{
 await loggedIn(page);await page.goto('/explore');
 await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.reload();
 await expect(page.locator('.home-view')).toBeVisible();
 await page.getByRole('button',{name:'Explore',exact:true}).click();await expect(page).toHaveURL(/\/explore$/);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page).toHaveURL(/\/\?view=settings$/);await page.reload();
 await expect(page.locator('.settings-view')).toBeVisible();await page.goBack();await expect(page.locator('.explore-view')).toBeVisible();
 await page.goBack();await expect(page.locator('.home-view')).toBeVisible();await page.goForward();await expect(page.locator('.explore-view')).toBeVisible();
 await page.goForward();await expect(page.locator('.settings-view')).toBeVisible();
});

test('thirty Home cards render current listing metadata without feed-detail reads',async({page})=>{
 let detailReads=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/feed/')){if(path.endsWith('/sketch'))return route.fulfill({status:404});detailReads++;return route.fulfill({json:{briefing:feed,editions:[]}});}
  return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:account()}:path==='/api/me/briefings'?{briefings:Array.from({length:30},(_,i)=>({...feed,id:'own-'+i,slug:'own-'+i,ownerAccountId:'reader',ownerUsername:'reader'}))}:path==='/api/explore/feeds'?{feeds:[],nextOffset:null}:{}});
 });
 await page.goto('/');await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(30);
 await expect(page.locator('.personal-feed-grid time')).toHaveCount(30);await expect(page.locator('.personal-feed-grid button[aria-pressed="true"]')).toHaveCount(30);
 expect(detailReads).toBe(0);
});

test('read progress is account-specific and corrupt data does not crash the feed',async({page})=>{
 let reader='reader-a';const failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('dn_read:v2:'+JSON.stringify([['account','reader-a'],'publisher','science']),'{broken');localStorage.setItem('ln_read:publisher:science','["edition-one"]');});
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:account(reader)}:path==='/api/feed/publisher/science'?{briefing:feed,editions:[edition],viewerHasStarred:false}:path==='/api/explore/feeds'?{feeds:[],nextOffset:null}:{}});
 });
 await page.goto('/publisher/science/');await expect(page.getByRole('button',{name:'Mark as read',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(page.getByRole('button',{name:'Mark as unread',exact:true})).toBeVisible();
 // Remove the init script by opening a fresh page in the SAME browser context; storage remains shared.
 const next=await page.context().newPage();await next.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:account(reader)}:path==='/api/feed/publisher/science'?{briefing:feed,editions:[edition],viewerHasStarred:false}:{}});
 });
 try{
  reader='reader-b';await next.goto('/publisher/science/');await expect(next.getByRole('button',{name:'Mark as read',exact:true})).toBeVisible();
  reader='reader-a';await next.reload();await expect(next.getByRole('button',{name:'Mark as unread',exact:true})).toBeVisible();
  expect(failures).toEqual([]);
 }finally{await next.close();}
});
