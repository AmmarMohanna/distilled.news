import {expect,test} from '@playwright/test';

for(const [language,message] of [
 ['en','No community feeds are available yet.'],
 ['fr','Aucun fil communautaire n’est disponible pour le moment.'],
 ['ar','لا توجد خلاصات مجتمعية متاحة بعد.']
] as const)test(`successful empty Explore is explained in ${language}`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(path==='/api/explore/channels')return route.fulfill({json:{channels:[{username:'admin',publicFeedCount:6,followerCount:1}]}});
  return route.fulfill({json:{feeds:[],nextOffset:null}});
 });
 await page.goto('/explore');
 await expect(page.locator('.community-feeds-empty').getByRole('heading')).toHaveText(message);
 await expect(page.locator('.landing-controls .landing-create')).toHaveCount(1);
 await expect(page.locator('.community-feeds-empty').getByRole('button')).toHaveCount(0);
 await expect(page.locator('.channel-shelf')).toBeVisible();
 const empty=await page.locator('.community-feeds-empty').boundingBox();
 const shelf=await page.locator('.channel-shelf').boundingBox();
 expect(shelf!.y).toBeGreaterThan(empty!.y+empty!.height);
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
 await expect(explore.getByRole('alert')).toBeVisible();await expect(explore.locator('.community-feeds-empty')).toHaveCount(0);
 await explore.getByRole('button',{name:'Try Again',exact:true}).click();
 await expect(explore.locator('.community-feeds-empty').getByRole('heading')).toHaveText('No community feeds are available yet.');
});

test('Explore reveals the initial grid and optional shelves together', async ({page}) => {
  const feed={id:'science',title:'Science',ownerUsername:'owner',slug:'science',publicFeedEnabled:true,paused:false};
  const followed={...feed,id:'climate',slug:'climate',title:'Climate',viewerFollowsChannel:true};
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
    if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[feed,followed],nextOffset:null}});
    if(path==='/api/explore/highlights'){
      await gate;
      return route.fulfill({json:{trending:[feed],newest:[]}});
    }
    return route.fulfill({json:{channels:[{username:'owner',publicFeedCount:2,followerCount:1}]}});
  });
  const listing=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/explore/feeds');
  await page.goto('/explore');
  try{
    await listing;
    const tracks=page.locator('.explore-view .catalog-shelf-track');
    await expect(tracks).toHaveCount(0);
    release();
    await expect(page.locator('.explore-view .catalog-shelf h2')).toHaveText(['Top feeds','Trending topics','Public feeds','Explore channels']);
    await expect(tracks.nth(2).locator('.feed-tile-caption > a')).toHaveText(['Science','Climate']);
    await expect(tracks.nth(1).locator('.feed-tile')).toHaveText(/Science/);
    await expect(page.getByRole('button',{name:'Scroll forward',exact:true})).toHaveCount(0);
    for (const track of await tracks.all()) await expect(track).toHaveCSS('overflow-x','auto');
  }finally{release();}
});

test('empty Explore and Top channels fit together on a short desktop viewport', async ({page}) => {
  await page.setViewportSize({width:1280,height:588});
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'reader',username:'reader',role:'user'}}});
    if(path==='/api/explore/channels')return route.fulfill({json:{channels:[{username:'admin',publicFeedCount:6,followerCount:1}]}});
    return route.fulfill({json:{feeds:[],briefings:[],nextOffset:null}});
  });
  await page.goto('/explore');
  const empty = page.locator('.community-feeds-empty');
  await expect(empty.getByRole('heading', {name:'Stay curious.'})).toBeVisible();
  await expect.poll(() => empty.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(empty.getByRole('button', {name:'Create feed'})).toBeVisible();
  await expect(empty).toBeInViewport({ratio:1});
  await expect(page.locator('.channel-shelf')).toBeInViewport({ratio:1});
});

test('a followed channel shows a horizontal shelf above its public feeds', async ({page}) => {
  let following=false;
  const feed={id:'science',title:'Science',ownerUsername:'owner',slug:'science',publicFeedEnabled:true,paused:false};
  await page.route('**/api/**',route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'reader',username:'reader',role:'user'}}});
    if(path==='/api/me/channels/owner/follow')following=request.postDataJSON().following;
    if(path==='/api/explore/channels/owner'||path==='/api/me/channels/owner/follow'){
      return route.fulfill({json:{channel:{username:'owner',publicFeedCount:1,followerCount:Number(following),viewerFollowing:following}}});
    }
    return route.fulfill({json:{feeds:[feed],briefings:[],nextOffset:null}});
  });
  await page.goto('/explore?channel=owner');
  await expect(page.getByRole('heading',{name:'All public feeds'})).toBeVisible();
  await page.getByRole('button',{name:'Follow',exact:true}).click();
  const shelf=page.locator('section[aria-label="Followed feeds"]');
  await expect(shelf.getByText('Science',{exact:true})).toBeVisible();
  const shelfBounds=await shelf.boundingBox();
  const publicBounds=await page.getByRole('heading',{name:'All public feeds'}).boundingBox();
  expect(shelfBounds!.y+shelfBounds!.height).toBeLessThanOrEqual(publicBounds!.y);
  await page.reload();
  await expect(shelf).toBeVisible();
  await page.getByRole('button',{name:'Following',exact:true}).click();
  await expect(shelf).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'All public feeds'})).toBeVisible();
});

test('own public profile preview shows Follow without offering to follow yourself', async ({page}) => {
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}});
    if(path==='/api/explore/channels/owner')return route.fulfill({json:{channel:{username:'owner',publicFeedCount:1,followerCount:0}}});
    return route.fulfill({json:{feeds:[],briefings:[],nextOffset:null}});
  });
  await page.goto('/explore?channel=owner&preview=1');
  await expect(page.getByRole('button',{name:'Follow',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Create feed',exact:true})).toHaveCount(0);
  await page.goto('/explore?channel=owner');
  await expect(page.locator('.explore-controls').getByRole('button',{name:'Follow',exact:true})).toBeDisabled();
});
