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
 : path === '/api/explore/feeds' ? {feeds:[feed]}
 : path === '/api/feed/' + username + '/' + currentFeed.slug ? {briefing:currentFeed,editions:[],viewerHasStarred:false}
 : path === '/api/me/sources' ? {sources:[]}
 : path === '/api/me/health' ? {health:{processing:{queued:0,completed:0,failed:0}}} : {};
 await route.fulfill({json:body});
 });
}
test('home has one creation entry and no decorative globe or briefing card',async({page})=>{
 await mock(page); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back, joud'})).toBeVisible();
 await expect(page.getByText('Distilling to you what is important.')).toBeVisible();
 await expect(page.locator('.orbit-art, .today-card')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add feed',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Add feed',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('textbox')).toHaveCount(2);
 await expect(dialog.getByRole('combobox')).toHaveCount(1);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('guests can explore and star feeds',async({page})=>{
 await mock(page,false); await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Top feeds',level:2})).toBeVisible();
 await page.getByRole('button',{name:'Star Lebanon',exact:true}).click();
 await expect(page.getByRole('button',{name:'Unstar Lebanon',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Add feed',exact:true})).toHaveCount(0);
 await expect(page.locator('.experience-brand a')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('owner opens feed settings from feed page',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Feed title')).toHaveValue('Lebanon');
 await expect(dialog.getByRole('button',{name:'Pause feed',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Copy URL',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Delete feed',exact:true})).toBeVisible();
});
test('admin username feed card opens its feed and settings',async({page})=>{
 await mock(page,true,'admin'); await page.goto('/');
 await page.locator('.personal-feed-grid a').click();
 await expect(page).toHaveURL(/\/admin\/lebanon\/$/);
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 await expect(page.getByRole('dialog').getByLabel('Feed title')).toHaveValue('Lebanon');
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
 await page.getByRole('button',{name:'Pause feed',exact:true}).click();
 expect((await saved).postDataJSON().paused).toBe(true);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto('/explore');
 await page.locator('.language-control summary').click();
 await page.locator('.language-menu button').nth(1).click();
 await expect(page.getByRole('heading',{name:'Fils populaires',level:2})).toBeVisible();
});
test('desktop pages avoid empty vertical overflow',async({page},info)=>{
 test.skip(info.project.name==='mobile');
 await mock(page); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back, joud'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 await page.screenshot({path:'test-results/home-updated.png'});
 await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Top feeds',level:2})).toBeVisible();
 await page.screenshot({path:'test-results/explore-updated.png'});
});
test('guest home offers public feeds and create feed without navigation',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Top feeds',level:2})).toBeVisible();
 await expect(page.getByRole('navigation')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create feed',exact:true})).toBeVisible();
});
test('normal users never see admin account management',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'Settings'}).click();
 await expect(page.locator('.accounts-section')).toHaveCount(0);
});

test('guest search filters illustrated public feeds inline',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.locator('.ranked-feed .topic-art')).toBeVisible();
 await expect(page.getByRole('searchbox',{name:'Search feeds'})).toBeVisible();
 await expect(page.locator('.topic-grid .topic-card')).toHaveCount(6);
 await page.getByRole('searchbox').fill('technology');
 await expect(page.locator('.ranked-feed')).toHaveCount(0);
 await page.getByRole('searchbox').fill('Lebanon');
 await expect(page.locator('.ranked-feed')).toHaveCount(1);
});

test('feed language and advanced settings persist independently of website language',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const edits: any[]=[];
 page.on('request',request=>{if(request.url().endsWith('/api/me/briefings')&&request.method()==='POST')edits.push(request.postDataJSON());});
 await page.locator('.language-control summary').click();
 await page.locator('.language-menu').getByRole('button',{name:'Français'}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('.feed-advanced summary').click();
 await expect(dialog.getByLabel('Langue du fil')).toHaveValue('en');
 expect(edits).toHaveLength(0);
 await dialog.getByLabel('Langue du fil').selectOption('ar');
 await dialog.getByLabel('Style de rédaction').fill('Short, calm sentences.');
 await dialog.getByLabel('Fuseau horaire').fill('Europe/Paris');
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/briefings')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',styleInstruction:'Short, calm sentences.',briefingTimezone:'Europe/Paris'});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 await page.locator('.feed-advanced summary').click();
 await expect(page.getByLabel('Langue du fil')).toHaveValue('ar');
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('clicking outside delete confirmation cancels without deleting the feed',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const deletions:string[]=[];
 page.on('request',request=>{if(request.method()==='DELETE')deletions.push(request.url());});
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
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
 await page.getByRole('button',{name:'Add feed',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Feed title').fill('Science today');
 await dialog.getByLabel('Prompt',{exact:true}).fill('Important science discoveries');
 await dialog.locator('.feed-advanced summary').click();
 await dialog.getByLabel('Feed language').selectOption('ar');
 await dialog.getByLabel('Time zone').fill('Asia/Beirut');
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/briefings')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Create feed',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',title:'Science today',briefingTimezone:'Asia/Beirut'});
 await expect(page).toHaveURL(/\/joud\/science-today\/$/);
 await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
 await page.locator('.feed-advanced summary').click();
 await expect(page.getByLabel('Feed language')).toHaveValue('ar');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('account and help dialogs dismiss outside without dismissing on an inside click',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('button',{name:'Account profile'}).click();
 await page.getByRole('dialog',{name:'account',exact:true}).getByRole('heading',{name:'account',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'account',exact:true})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Account profile'})).toBeFocused();
 await page.getByRole('navigation').getByRole('button',{name:'Settings'}).click();
 await page.getByRole('button',{name:'Help & support'}).click();
 await expect(page.getByRole('dialog',{name:'feed help'})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
