import {expect,test,type Page} from '@playwright/test';
const original={id:'owner-id',username:'owner',email:'owner@example.invalid',role:'user'};
const base={id:'stable-feed-id',ownerAccountId:original.id,ownerUsername:'owner',slug:'news',title:'Owner news',publicFeedEnabled:false,stars:2,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
const edition={id:'stable-edition',briefingId:base.id,title:'Protected development',summary:'Private source-grounded content.',publishedAt:new Date().toISOString(),sections:[{title:'Protected development',summary:'Private source-grounded content.',evidence:[]}]};
async function fixture(page:Page,isPublic=false){
 let signedIn=true,owner={...original};let starCalls=0;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  const feed={...base,ownerUsername:owner.username,publicFeedEnabled:isPublic};
  if(path==='/api/auth/logout'){signedIn=false;return route.fulfill({json:{ok:true}});}
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:signedIn,setupRequired:false,...(signedIn?{account:owner}:{})}});
  if(path==='/api/me/account'&&method!=='GET'){owner={...owner,username:route.request().postDataJSON().username};return route.fulfill({json:{account:owner,briefings:[{...feed,ownerUsername:owner.username}]}});}
  if(path==='/api/me/briefings')return route.fulfill({json:{briefings:signedIn?[feed]:[]}});
  if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[],nextOffset:null}});
  if(path.endsWith('/star')){starCalls++;return starCalls===1?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{stars:3,viewerHasStarred:true}});}
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  if(path.startsWith('/api/feed/'))return !signedIn&&!isPublic?route.fulfill({status:404,json:{error:'feed not found'}}):route.fulfill({json:{briefing:feed,editions:[edition],viewerHasStarred:false}});
  return route.fulfill({json:{}});
 });
 return {errors,rename:()=>{owner={...owner,username:'renamed-owner'}}};
}
async function rename(page:Page){
 await page.getByRole('button',{name:'Account profile',exact:true}).click();
 const dialog=page.locator('.profile-dialog');await dialog.getByRole('button',{name:'Edit username',exact:true}).click();
 await dialog.getByLabel('username',{exact:true}).fill('renamed-owner');await dialog.getByRole('button',{name:'Save',exact:true}).click();
}

test('an ownership lookup failure has a visible retry that restores feed settings',async({page})=>{
 await fixture(page);let attempts=0;
 await page.route('**/api/me/briefings',route=>++attempts===1?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{briefings:[base]}}));
 await page.goto('/owner/news/');await expect(page.locator('.news-item')).toContainText('Protected development');
 await page.getByRole('button',{name:'Retry feed controls',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit feed settings',exact:true})).toBeVisible();expect(attempts).toBe(2);
});
test('logout replaces the open private feed with Home and cannot restore its content using Back',async({page})=>{
 await fixture(page);await page.goto('/');await page.goto('/owner/news/');await expect(page.locator('.news-item')).toContainText('Protected development');
 await page.getByRole('button',{name:'Account profile',exact:true}).click();await page.locator('.profile-dialog').getByRole('button',{name:'Log out',exact:true}).click();
 // The URL changes at navigation commit, before the replacement document has
 // loaded. Back must wait for that logout navigation rather than abort it.
 await page.waitForURL(/\/$/,{waitUntil:'load'});await expect(page.getByText('Protected development',{exact:true})).toHaveCount(0);
 await page.goBack();await expect(page.getByText('Protected development',{exact:true})).toHaveCount(0);
 await page.goto('/owner/news/');await expect(page.locator('.news-item')).toHaveCount(0);
});
test('renaming the owner follows its canonical feed URL and retains editor controls and read progress',async({page})=>{
 await fixture(page);await page.goto('/owner/news/');await page.getByRole('button',{name:'Mark as read',exact:true}).click();
 await rename(page);await expect(page).toHaveURL(/\/renamed-owner\/news\/$/);
 await expect(page.getByRole('button',{name:'Edit feed settings',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Mark as unread',exact:true})).toBeVisible();
});
for(const [language,message] of [
 ['en','Could not complete the request. Try again.'],
 ['fr','Impossible de terminer la demande. Réessayez.'],
 ['ar','تعذّر إكمال الطلب. حاول مجددًا.']
] as const)test(`failed stars show ${language} feedback and remain retryable without an unhandled rejection`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 const state=await fixture(page,true);await page.goto('/owner/news/');const button=page.locator('.feed-header-actions .star-vote');await expect(button).toBeEnabled();await button.click();
 await expect(page.getByText(message,{exact:true})).toBeVisible();expect(state.errors).toEqual([]);
 await expect(button).toBeEnabled();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
});
test('reader history from the old account-scoped URL key migrates across a publisher rename',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('dn_read:v2:'+JSON.stringify([['account','owner-id'],'owner','news']),'["stable-edition"]'));
 const state=await fixture(page,true);state.rename();await page.goto('/renamed-owner/news/');
 await expect(page.getByRole('button',{name:'Mark as unread',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dn_read:v3:'+JSON.stringify([['account','owner-id'],'stable-feed-id']))??'[]'))).toContain('stable-edition');
 await page.getByRole('button',{name:'Mark as unread',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Mark as read',exact:true})).toBeVisible();
});

test('two tabs synchronize independent read marks and retain an explicit unread choice after reload',async({page,context})=>{
 const other=await context.newPage();
 const rows=['A','B','C'].map(letter=>({...edition,id:'edition-'+letter,title:'Development '+letter,sections:edition.sections.map(section=>({...section,title:'Development '+letter}))}));
 for(const tab of [page,other]){
  await fixture(tab,true);
  await tab.route('**/api/feed/owner/news',route=>route.fulfill({json:{briefing:{...base,publicFeedEnabled:true},editions:rows,viewerHasStarred:false}}));
 }
 const row=(tab:Page,letter:string)=>tab.locator('.news-item').filter({hasText:'Development '+letter});
 await Promise.all([page.goto('/owner/news/'),other.goto('/owner/news/')]);
 for(const tab of [page,other])await expect(tab.locator('.news-item')).toHaveCount(3);
 await Promise.all([row(page,'A').getByRole('button',{name:'Mark as read',exact:true}).click(),row(other,'B').getByRole('button',{name:'Mark as read',exact:true}).click()]);
 for(const tab of [page,other])await expect(tab.locator('.news-item.is-read')).toHaveCount(2);
 await row(page,'A').getByRole('button',{name:'Mark as unread',exact:true}).click();
 await row(other,'C').getByRole('button',{name:'Mark as read',exact:true}).click();
 for(const tab of [page,other]){await expect(row(tab,'A')).not.toHaveClass(/is-read/);await expect(tab.locator('.news-item.is-read')).toHaveCount(2);}
 await Promise.all([page.reload(),other.reload()]);
 for(const tab of [page,other]){await expect(row(tab,'A')).not.toHaveClass(/is-read/);await expect(row(tab,'B')).toHaveClass(/is-read/);await expect(row(tab,'C')).toHaveClass(/is-read/);}
});

test('failed logout keeps the private reader authenticated and retryable',async({page})=>{
 await fixture(page);await page.route('**/api/auth/logout',route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.goto('/owner/news/');await expect(page.locator('.news-item')).toContainText('Protected development');
 await page.getByRole('button',{name:'Account profile',exact:true}).click();const dialog=page.locator('.profile-dialog');
 await dialog.getByRole('button',{name:'Log out',exact:true}).click();await expect(dialog.locator('.error')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Log out',exact:true})).toBeEnabled();
 await expect(page).toHaveURL(/\/owner\/news\/$/);await expect(page.locator('.news-item')).toContainText('Protected development');
});

test('session outage keeps loaded feed history unassigned until retry confirms the reader',async({page})=>{
 let sessions=0;const anonymousKey='dn_read:v3:'+JSON.stringify([['anonymous'],'stable-feed-id']);
 await page.addInitScript(key=>localStorage.setItem(key,'["anonymous-only"]'),anonymousKey);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session'){sessions++;return sessions===1?route.fulfill({status:503,json:{error:'temporarily unavailable'}}):route.fulfill({json:{authenticated:true,setupRequired:false,account:original}});}
  if(path==='/api/me/briefings')return route.fulfill({json:{briefings:[{...base,publicFeedEnabled:true}]}});
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  if(path.startsWith('/api/feed/'))return route.fulfill({json:{briefing:{...base,publicFeedEnabled:true},editions:[edition],viewerHasStarred:false}});
  return route.fulfill({json:{}});
 });
 await page.goto('/owner/news/');await expect(page.locator('.news-item')).toContainText('Protected development');
 await expect(page.getByRole('button',{name:'Retry session',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Mark as read',exact:true})).toBeDisabled();
 expect(await page.evaluate(key=>localStorage.getItem(key),anonymousKey)).toBe('["anonymous-only"]');
 expect(await page.evaluate(()=>localStorage.getItem('dn_read:v3:'+JSON.stringify([['account','owner-id'],'stable-feed-id'])))).toBeNull();
 await page.getByRole('button',{name:'Retry session',exact:true}).click();
 await expect(page.getByRole('button',{name:'Account profile',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Mark as read',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Mark as read',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mark as unread',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dn_read:v3:'+JSON.stringify([['account','owner-id'],'stable-feed-id']))??'[]'))).toContain('stable-edition');
 expect(await page.evaluate(key=>localStorage.getItem(key),anonymousKey)).toBe('["anonymous-only"]');expect(sessions).toBe(2);
});
