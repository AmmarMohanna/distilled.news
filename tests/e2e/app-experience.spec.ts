import { expect, test } from "@playwright/test";
const feed = { id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };
async function mock(page: any, authenticated = true, username = 'joud') {
 let currentFeed = { ...feed, ownerUsername: username };
 await page.route("**/api/**", async (route: any) => {
 const path = new URL(route.request().url()).pathname;
 if (path === '/api/me/briefings' && route.request().method() === 'POST') currentFeed = { ...currentFeed, ...route.request().postDataJSON() };
 const body = path.endsWith('/star') ? {stars:4,viewerHasStarred:true}
 : path === '/api/auth/session' ? { authenticated, setupRequired:false, account:authenticated ? {id:'joud',username,email:'joud@example.test',role:'user'} : null }
 : path === '/api/me/briefings' ? (route.request().method()==='POST' ? {briefing:currentFeed} : {briefings:[currentFeed]})
 : (path === '/api/explore/feeds' || path === '/api/explore/popular') ? {feeds:[feed]}
 : path === '/api/feed/' + username + '/' + currentFeed.slug ? {briefing:currentFeed,editions:[],viewerHasStarred:false}
 : path === '/api/me/sources' ? {sources:[]}
 : path === '/api/me/health' ? {health:{processing:{queued:0,completed:0,failed:0}}} : {};
 await route.fulfill({json:body});
 });
}
test('home has one creation entry and no decorative globe or briefing card',async({page})=>{
 await mock(page); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back!'})).toBeVisible();
 await expect(page.getByText('You choose what matters.')).toBeVisible();
 await expect(page.locator('.orbit-art, .today-card')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create feed',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('textbox')).toHaveCount(3);
 await expect(dialog.getByRole('combobox')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('guests can explore and star feeds',async({page})=>{
 await mock(page,false); await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Featured feeds',level:2})).toHaveCount(0);
 await page.getByRole('button',{name:'Star Lebanon',exact:true}).click();
 await expect(page.getByRole('button',{name:'Unstar Lebanon',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Create feed',exact:true})).toHaveCount(1);
 await expect(page.locator('.experience-brand a')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('owner opens feed settings from feed page',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Feed name')).toHaveValue('Lebanon');
 await dialog.getByRole('button',{name:'Preferences',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Pause feed',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Copy URL',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Delete feed',exact:true})).toBeVisible();
});
test('feed header matches home and opens the signed-in account profile',async({page})=>{
 await mock(page); await page.goto('/');
 await expect(page.locator('.experience-header .avatar-button')).toBeVisible();
 const headerState = () => page.locator('.experience-header').evaluate(node => ({
  height: node.getBoundingClientRect().height,
  controls: Array.from(node.querySelectorAll('button')).map(button => button.getAttribute('aria-label')),
  logo: node.querySelector('.distilled-logo-wordmark')?.textContent
 }));
 const homeHeader = await headerState();
 await page.goto('/joud/lebanon/');
 await expect(page.locator('.experience-header .avatar-button')).toHaveText('J');
 expect(await headerState()).toEqual(homeHeader);
 await page.getByRole('button',{name:'Account profile',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'account',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog').getByLabel('username',{exact:true})).toHaveValue('joud');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('admin username feed card opens its feed and settings',async({page})=>{
 await mock(page,true,'admin'); await page.goto('/');
 await page.locator('.personal-feed-grid .topic-card > a .topic-name').click();
 await expect(page).toHaveURL(/\/admin\/lebanon\/$/);
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 await expect(page.getByRole('dialog').getByLabel('Feed name')).toHaveValue('Lebanon');
});
test('login link opens a dismissible dialog over the landing page',async({page})=>{
 await mock(page,false); await page.goto('/login');
 await expect(page.getByRole('dialog',{name:'Login or sign up'})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'A calmer perspective on a complex world.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('feed pause persists and header language changes the interface',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 const saved=page.waitForRequest(r=>r.url().endsWith('/api/me/briefings')&&r.method()==='POST');
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 await page.getByRole('button',{name:'Pause feed',exact:true}).click();
 expect((await saved).postDataJSON().paused).toBe(true);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto('/explore');
 await page.getByRole('button',{name:/^Website language:/}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await expect(page.getByRole('button',{name:'Créer le fil',exact:true})).toBeVisible();
});
test('desktop pages avoid empty vertical overflow',async({page},info)=>{
 test.skip(info.project.name==='mobile');
 await mock(page); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back!'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 await page.screenshot({path:'test-results/home-updated.png'});
 await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Featured feeds',level:2})).toHaveCount(0);
 await page.screenshot({path:'test-results/explore-updated.png'});
});
test('guest home offers public feeds and create feed with header controls',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Featured feeds',level:2})).toHaveCount(0);
 await expect(page.getByRole('navigation')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create feed',exact:true})).toBeVisible();
 const logo=await page.locator('.experience-header > .experience-brand:visible, .bottom-navigation .sidebar-logo:visible').first().boundingBox();
 const search=await page.locator('.explore-search').boundingBox();
 const create=await page.locator('.landing-create').boundingBox();
 expect(logo!.x).toBeLessThan(60);
 expect(Math.abs(search!.y + search!.height/2 - create!.y - create!.height/2)).toBeLessThan(3);
 expect(create!.x).toBeGreaterThan(search!.x);

});
test('normal users never see admin account management',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'Settings'}).click();
 await expect(page.locator('.accounts-section')).toHaveCount(0);
});

test('guest search filters illustrated public feeds inline',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.locator('.curated-feed-grid .topic-art')).toBeVisible();
 await expect(page.getByRole('searchbox',{name:'Search feeds'})).toBeVisible();
 await expect(page.locator('.topic-grid .topic-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('technology');
 await expect(page.locator('.curated-feed-grid .topic-card')).toHaveCount(0);
 await page.getByRole('searchbox').fill('Lebanon');
 await expect(page.locator('.curated-feed-grid .topic-card')).toHaveCount(1);
});

test('feed language and advanced settings persist independently of website language',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const edits: any[]=[];
 page.on('request',request=>{if(request.url().endsWith('/api/me/briefings')&&request.method()==='POST')edits.push(request.postDataJSON());});
 await page.getByRole('button',{name:/^Website language:/}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('.feed-preferences-disclosure').click();
 await expect(dialog.getByRole('button',{name:'Feed language: en'})).toBeVisible();
 expect(edits).toHaveLength(0);
 await dialog.getByRole('button',{name:'Feed language: en'}).click(); await dialog.getByRole('button',{name:'Feed language: fr'}).click();
 await dialog.getByLabel('Style de rédaction').fill('Short, calm sentences.');
 await expect(dialog.getByLabel('Fuseau horaire')).toHaveCount(0);
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/briefings')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',styleInstruction:'Short, calm sentences.',briefingTimezone:'Asia/Beirut'});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 await page.locator('.feed-preferences-disclosure').click();
 await expect(page.getByRole('button',{name:'Feed language: ar'})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('clicking outside delete confirmation cancels without deleting the feed',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const deletions:string[]=[];
 page.on('request',request=>{if(request.method()==='DELETE')deletions.push(request.url());});
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 await page.getByRole('button',{name:'Delete feed',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Confirm deletion'})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog',{name:'Confirm deletion'})).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Edit feed settings'})).toBeVisible();
 expect(deletions).toHaveLength(0);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('new feed keeps the language selected in advanced settings',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Feed name').fill('Science today');
 await dialog.getByLabel('What would you like to follow?',{exact:true}).fill('Important science discoveries');
 await dialog.locator('.feed-preferences-disclosure').click();
 await dialog.getByRole('button',{name:'Feed language: en'}).click(); await dialog.getByRole('button',{name:'Feed language: fr'}).click();
 const deviceZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/briefings')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Create feed',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',title:'Science today',briefingTimezone:deviceZone,publicFeedEnabled:true});
 await expect(page).toHaveURL(/\/joud\/science-today\/$/);
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 await page.locator('.feed-preferences-disclosure').click();
 await expect(page.getByRole('button',{name:'Feed language: ar'})).toBeVisible();
 await expect(page.locator('.feed-preferences-disclosure')).toContainText('Public');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('account and help dialogs dismiss outside without dismissing on an inside click',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('button',{name:'Account profile'}).click();
 await page.getByRole('dialog',{name:'account',exact:true}).locator('.profile-email').click();
 await expect(page.getByRole('dialog',{name:'account',exact:true})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Account profile'})).toBeFocused();
 await page.getByRole('navigation').getByRole('button',{name:'Settings'}).click();
 await page.getByRole('button',{name:'Help & support'}).click();
 await expect(page.getByRole('dialog',{name:'Help & Support'})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
