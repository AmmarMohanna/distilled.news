import { expect, test } from "@playwright/test";
const feed = { id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };
async function mock(page: any, authenticated = true) {
 await page.route("**/api/**", async (route: any) => {
 const path = new URL(route.request().url()).pathname;
 const body = path.endsWith('/star') ? {stars:4,viewerHasStarred:true}
 : path === '/api/auth/session' ? { authenticated, setupRequired:false, account:authenticated ? {id:'joud',username:'joud',email:'joud@example.test',role:'user'} : null }
 : path === '/api/me/briefings' ? (route.request().method()==='POST' ? {briefing:{...feed,...route.request().postDataJSON()}} : {briefings:[feed]})
 : path === '/api/explore/feeds' ? {feeds:[feed]}
 : path === '/api/feed/joud/lebanon' ? {briefing:feed,editions:[],viewerHasStarred:false}
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
 await expect(page.getByRole('heading',{name:'Top feeds',level:1})).toBeVisible();
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
test('login background is white',async({page})=>{
 await mock(page,false); await page.goto('/login');
 await expect(page.locator('.auth-experience')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(page.getByRole('link',{name:'Explore',exact:true})).toBeVisible();
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
test('guest home offers sidebar browsing and sign in',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.getByRole('heading',{name:'Top feeds',level:1})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('button',{name:'Search',exact:true})).toBeVisible();
 await expect(nav.getByRole('link',{name:'Sign up'})).toHaveAttribute('href','/login?signup=1');
});
test('normal users never see admin account management',async({page})=>{
 await mock(page); await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'Settings'}).click();
 await expect(page.locator('.accounts-section')).toHaveCount(0);
});

test('guest search is separate from illustrated top feeds',async({page})=>{
 await mock(page,false); await page.goto('/');
 await expect(page.locator('.ranked-feed .topic-art')).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('button')).toHaveCount(2);
 await nav.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.getByRole('textbox')).toBeVisible();
 await expect(page.locator('.topic-grid .topic-card')).toHaveCount(6);
 await expect(page.locator('.ranked-feed')).toHaveCount(0);
 await nav.getByRole('link',{name:'Sign up'}).click();
 await expect(page.getByRole('button',{name:'Sign up',exact:true}).first()).toHaveAttribute('aria-pressed','true');
});
