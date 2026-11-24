import { expect, test } from "@playwright/test";
import { chooseSetting, cycleLanguage, openEditSettings, expectSignedInAppearanceControls } from "./helpers";
const feed = { id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };
async function mock(page: any, authenticated = true, username = 'joud') {
 let currentFeed = { ...feed, ownerUsername: username };
 let viewerHasStarred=false;
 await page.route("**/api/**", async (route: any) => {
 const path = new URL(route.request().url()).pathname;
 if(path.endsWith('/star')&&route.request().method()==='POST')viewerHasStarred=route.request().postDataJSON().starred;
 if ((path === '/api/me/briefings' || path === '/api/me/feeds') && route.request().method() === 'POST') {
   const input = route.request().postDataJSON();
   currentFeed = { ...currentFeed, ...input, slug: input.title === 'Science today' ? 'science-today' : currentFeed.slug };
 }
 const body = path.endsWith('/star') ? {stars:feed.stars+(viewerHasStarred?1:0),viewerHasStarred}
 : path === '/api/auth/session' ? { authenticated, setupRequired:false, account:authenticated ? {id:'joud',username,email:'joud@example.test',role:'user'} : null }
 : path === '/api/me/briefings' || path === '/api/me/feeds' ? (route.request().method()==='POST' ? {briefing:currentFeed} : {briefings:[currentFeed]})
 : (path === '/api/explore/feeds' || path === '/api/explore/popular') ? {feeds:[{...feed,stars:feed.stars+(viewerHasStarred?1:0),viewerHasStarred}],nextOffset:null}
 : path === '/api/feed/' + username + '/' + currentFeed.slug ? {briefing:{...currentFeed,stars:feed.stars+(viewerHasStarred?1:0)},editions:[],viewerHasStarred}
 : path === '/api/me/sources/assess' ? {assessment:{status:'accepted',input:route.request().postDataJSON().source,reason:'Fixture source matches',checkedAt:'2026-10-24T12:00:00Z'}}
 : path === '/api/me/sources' ? {sources:[{id:'rss-1',enabled:true,input:'https://example.test/feed.xml',title:'Science',provider:'rss',kind:'rss_feed'}]}
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
 await expect(dialog.getByRole('textbox')).toHaveCount(2);
 await expect(dialog.getByRole('combobox', {name:'Sources',exact:true})).toHaveCount(1);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('uploads a profile picture and restores it after a reload', async ({ page }) => {
  await mock(page);
  let picture: Buffer | null = null;
  await page.route('**/api/me/avatar**', async route => {
    if (route.request().method() === 'PUT') {
      picture = route.request().postDataBuffer();
      expect(route.request().headers()['content-type']).toBe('image/jpeg');
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.fulfill(picture ? { contentType: 'image/jpeg', body: picture } : { status: 404 });
    }
  });
  await page.goto('/');
  const avatar = page.getByRole('button', { name: 'Account profile' });
  await avatar.click();
  const dialog = page.getByRole('dialog', { name: 'Account' });
  await expect(dialog.getByText('Your account username')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Profile settings' })).toBeVisible();
  await expect(dialog.getByText('joud@example.test')).toHaveCount(0);
  const portrait = (await dialog.getByRole('heading', { name: 'Profile picture' }).boundingBox())!;
  const username = (await dialog.getByRole('textbox', { name: 'username' }).boundingBox())!;
  if (await page.evaluate(() => matchMedia('(min-width: 621px)').matches)) {
    expect(portrait.x).toBeGreaterThan(username.x + username.width);
  } else {
    expect(portrait.y).toBeGreaterThan(username.y + username.height);
  }
  const file = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 30;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 30, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await dialog.locator('input[type=file]').dispatchEvent('cancel', { bubbles: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Preview public profile' })).toHaveAttribute('href', '/explore?channel=joud');
  await dialog.getByRole('button', { name: 'Upload profile picture' }).click();
  await (await chooser).setFiles({ name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from(file, 'base64') });
  await expect(dialog.getByText('Profile picture saved')).toBeVisible();
  await expect(dialog.locator('.account-avatar-image')).toBeVisible();
  await page.reload();
  const image = avatar.locator('.account-avatar-image');
  await expect(image).toBeVisible();
  const button = (await avatar.boundingBox())!;
  const photo = (await image.boundingBox())!;
  expect(photo.width).toBeCloseTo(button.width, 0);
  expect(photo.height).toBeCloseTo(button.height, 0);
  expect(photo.x).toBeCloseTo(button.x, 0);
  expect(photo.y).toBeCloseTo(button.y, 0);
});
test('opens a top channel with its public feeds, recent updates and report menu', async ({ page }) => {
  const channel = { username: 'joud', publicFeedCount: 2, followerCount: 7 };
  await mock(page, false);
  await page.route('**/api/explore/channels**', route => {
    const path = new URL(route.request().url()).pathname;
    return path.endsWith('/avatar') ? route.fulfill({ status: 404 })
      : route.fulfill({ json: path.endsWith('/channels') ? { channels: [channel] } : { channel } });
  });
  await page.route('**/api/explore/feeds?*', route => {
    const filtered = new URL(route.request().url()).searchParams.get('channel');
    return route.fulfill({ json: { feeds: filtered ? [{ ...feed, latestUpdatedAt: '2026-11-22T12:00:00Z' }] : [], nextOffset: null } });
  });
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Top channels' })).toBeVisible();
  const channelCard = page.getByRole('link', { name: /@joud.*2 public feeds.*7 followers/ });
  await expect(channelCard).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(channelCard.locator('.channel-avatar')).toHaveCSS('border-radius','50%');
  await channelCard.click();
  await expect(page.getByRole('heading', { name: '@joud' })).toBeVisible();
  const banner = (await page.locator('.channel-banner').boundingBox())!;
  const avatar = (await page.locator('.channel-hero .channel-avatar').boundingBox())!;
  expect(avatar.y).toBeLessThan(banner.y + banner.height);
  expect(avatar.y + avatar.height).toBeGreaterThan(banner.y + banner.height);
  await expect(page.getByRole('heading', { name: 'Public feeds' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently updated' })).toBeVisible();
  await page.locator('.channel-options summary').click();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.getByRole('button', { name: 'Report a concern' }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Support' }).locator('a').first()).toHaveAttribute('href', /channel%3Djoud/);
});
test('discovery shelves link to a dedicated briefing with its published body', async ({ page }) => {
  await mock(page, false);
  const edition = { id: 'evening', briefingId: feed.id, title: 'An evening film briefing',
    summary: 'The festival announced its full programme and published the dates for its screenings.',
    sections: [{ title:'Screening details', summary:'The screenings begin with a restored print from the city archive.', evidence:[] }], publishedAt: '2026-11-22T12:00:00Z', updatedAt: '2026-11-22T12:00:00Z' };
  await page.route('**/api/explore/highlights', route => route.fulfill({json:{trending:[{...feed,latestEditionId:edition.id}],newest:[feed]}}));
  await page.route('**/api/feed/joud/lebanon/editions/evening*', route => {
    const photo = new URL(route.request().url()).searchParams.has('photo');
    return route.fulfill({json:photo ? {photo:null} : {briefing:feed,edition}});
  });
  await page.goto('/explore');
  await expect(page.getByRole('heading', {name:'All public feeds'})).toBeVisible();
  await expect(page.getByRole('heading', {name:'New feeds'})).toBeVisible();
  const shelf = page.getByRole('region', {name:'Trending briefings',exact:true}).last();
  await expect(page.getByRole('button', {name:'Scroll forward',exact:true})).toHaveCount(0);
  await expect(shelf).toHaveCSS('overflow-x', 'auto');
  await shelf.getByRole('link', {name:'Lebanon',exact:true}).click();
  await expect(page).toHaveURL(/\/joud\/lebanon\/briefing\/evening\//);
  await expect(page.getByRole('heading', {name:edition.title})).toBeVisible();
  await expect(page.locator('.briefing-detail-summary')).toContainText(edition.summary);
  await expect(page.getByRole('heading', {name:'Screening details'})).toBeVisible();
  await expect(page.locator('.briefing-detail-body')).toContainText(edition.sections[0].summary);
  await expect(page.locator('.briefing-parent-feed')).toHaveAttribute('href','/joud/lebanon/');
  await expect(page.getByRole('link', {name:'Back to feed'})).toHaveAttribute('href','/joud/lebanon/');
});
test('guests can explore and star feeds',async({page})=>{
 await mock(page,false); await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Featured feeds',level:2})).toHaveCount(0);
 await page.locator('.feed-tile-grid').getByRole('button',{name:'Star Lebanon',exact:true}).click();
 await expect(page.locator('.feed-tile-grid').getByRole('button',{name:'Unstar Lebanon',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(page.locator('.feed-tile-grid').getByRole('button',{name:'Unstar Lebanon',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Create feed',exact:true})).toHaveCount(1);
 await expect(page.locator('.experience-brand a')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('owner opens feed settings from feed page',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await openEditSettings(page);
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Feed name')).toHaveValue('Lebanon');
 await dialog.getByRole('button',{name:'Preferences',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Pause feed',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Copy link',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Delete feed',exact:true})).toBeVisible();
});
test('a signed-in feed keeps feed actions and an accessible account profile',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await expect(page.locator('.feed-shell > .bottom-navigation')).toBeVisible();
 await expect(page.locator('.experience-header .avatar-button')).toHaveText('J');
 await expectSignedInAppearanceControls(page);
 await page.goto('/');
 await expect(page.locator('.experience-header .avatar-button')).toHaveText('J');
 await page.getByRole('button',{name:'Account profile',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'account',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog').getByLabel('username',{exact:true})).toHaveValue('joud');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('admin username feed card opens its feed and settings',async({page})=>{
 await mock(page,true,'admin'); await page.goto('/');
 await page.locator('.feed-tile-grid[data-feed-view=home] .feed-tile-caption > a').click();
 await expect(page).toHaveURL(/\/admin\/lebanon\/$/);
 await openEditSettings(page);
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
test('feed pause persists and Settings language changes the interface',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 await openEditSettings(page);
 const saved=page.waitForRequest(r=>r.url().endsWith('/api/me/briefings')&&r.method()==='POST');
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 await page.getByRole('button',{name:'Pause feed',exact:true}).click();
 expect((await saved).postDataJSON().paused).toBe(true);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto('/explore');
 await cycleLanguage(page);
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
 await expect(page.locator('.feed-tile-grid[data-feed-view=explore] .topic-art')).toBeVisible();
 await expect(page.getByRole('searchbox',{name:'Search feeds'})).toBeVisible();
 await expect(page.locator('.feed-tile-grid[data-feed-view=explore] .feed-tile')).toHaveCount(1);
 await page.getByRole('searchbox').fill('technology');
 await expect(page.locator('.feed-tile-grid[data-feed-view=explore] .feed-tile')).toHaveCount(0);
 await page.getByRole('searchbox').fill('Lebanon');
 await expect(page.locator('.feed-tile-grid[data-feed-view=explore] .feed-tile')).toHaveCount(1);
});

test('feed language and advanced settings persist independently of website language',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const edits: any[]=[];
 page.on('request',request=>{if(request.url().endsWith('/api/me/feeds')&&request.method()==='POST')edits.push(request.postDataJSON());});
 await expect(page.getByRole('button',{name:'Edit feed settings',exact:true})).toBeVisible();
 await cycleLanguage(page);
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('.feed-preferences-disclosure').click();
 await expect(dialog.getByRole('button',{name:'Langue des briefs Anglais',exact:true})).toBeVisible();
 expect(edits).toHaveLength(0);
 await chooseSetting(dialog,'Langue des briefs','Arabe');
 await expect(dialog.getByLabel('Fuseau horaire')).toHaveCount(0);
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/feeds')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',briefingTimezone:'Asia/Beirut',sourceInputs:['https://example.test/feed.xml']});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.getByRole('button',{name:'Modifier le fil',exact:true}).click();
 await page.locator('.feed-preferences-disclosure').click();
 await expect(dialog.getByRole('button',{name:'Langue des briefs Arabe',exact:true})).toBeVisible();
 await page.mouse.click(4,4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('clicking outside delete confirmation cancels without deleting the feed',async({page})=>{
 await mock(page); await page.goto('/joud/lebanon/');
 const deletions:string[]=[];
 page.on('request',request=>{if(request.method()==='DELETE')deletions.push(request.url());});
 await openEditSettings(page);
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
 await dialog.getByLabel('Sources',{exact:true}).fill('https://example.test/feed.xml');
 await dialog.getByRole('button',{name:'Add source',exact:true}).click();
 await dialog.locator('.feed-preferences-disclosure').click();
 await chooseSetting(dialog,'Briefing language','Arabic');
 const deviceZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
 const saved=page.waitForRequest(request=>request.url().endsWith('/api/me/feeds')&&request.method()==='POST');
 await dialog.getByRole('button',{name:'Create feed',exact:true}).click();
 expect((await saved).postDataJSON()).toMatchObject({language:'ar',title:'Science today',briefingTimezone:deviceZone,publicFeedEnabled:true});
 await expect(page).toHaveURL(/\/joud\/science-today\/$/);
 await openEditSettings(page);
 await page.locator('.feed-preferences-disclosure').click();
 await expect(dialog.getByRole('button',{name:'Briefing language Arabic',exact:true})).toBeVisible();
 await expect(page.locator('.feed-preferences-disclosure')).toContainText('Public');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
});

for(const size of [{width:320,height:568},{width:667,height:375}])test(`Arabic preference menus stay reachable at ${size.width}x${size.height}`,async({page},info)=>{
 await page.setViewportSize(size);
 await page.addInitScript(()=>localStorage.setItem('dn_language','ar'));
 await mock(page);await page.goto('/');
 await page.getByRole('button',{name:'إنشاء خلاصة',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'التفضيلات',exact:true}).click();
 await chooseSetting(dialog,'لغة الموجز','الفرنسية');
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('html')).toHaveAttribute('lang','ar');
 await dialog.getByRole('button',{name:'لغة الموجز الفرنسية',exact:true}).press('ArrowDown');
 const menu=dialog.getByRole('listbox',{name:'لغة الموجز',exact:true});
 await expect(menu.getByRole('option',{name:'الفرنسية',exact:true})).toHaveAttribute('aria-selected','true');
 await page.screenshot({path:info.outputPath('rtl-language-menu.png')});
 await menu.press('Escape');
 await expect(menu).toBeHidden();
});

test('account and help dialogs dismiss outside without dismissing on an inside click',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('button',{name:'Account profile'}).click();
 await page.getByRole('dialog',{name:'account',exact:true}).getByRole('heading',{name:'Profile settings'}).click();
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
