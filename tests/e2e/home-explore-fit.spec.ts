import { expect, test } from "@playwright/test";
import {chooseSetting} from './helpers';

const titles = ["Lebanese politics", "Global affairs", "AI and technology", "Business markets"];
const feed = (index: number) => ({ id: `feed-${index}`, ownerUsername: "owner", slug: `feed-${index}`, title: `${titles[index % titles.length]} ${index}`, stars: 0, publicFeedEnabled: true });

async function openApp(page: import("@playwright/test").Page, count: number) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, account: { id: "owner", username: "owner", role: "user" } } });
    if (path === "/api/me/briefings") return route.fulfill({ json: { briefings: Array.from({ length: count }, (_, index) => feed(index)) } });
    if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: Array.from({ length: count }, (_, index) => ({...feed(index), id: `community-${index}`, ownerUsername: "community"})) } });
    if (path === "/api/me/sources") return route.fulfill({ json: { sources: [] } });
    if (path === "/api/me/health") return route.fulfill({ json: { health: { processing: { queued: 0, completed: 0, failed: 0 } } } });
    if (path.endsWith("/sketch")) return route.fulfill({ status: 404 });
    if (path.startsWith("/api/feed/")) return route.fulfill({ json: { briefing: feed(0), editions: [{ updatedAt: "2026-10-01T12:00:00Z" }], viewerHasStarred: false } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.locator(".personal-feed-grid .topic-card")).toHaveCount(count);
}

for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 593 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} first feed fits ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openApp(page, 1);
      if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
      const grid = page.locator(tab === "home" ? ".personal-feed-grid" : ".curated-feed-grid");
      await expect(grid.locator(".topic-card")).toHaveCount(1);
      const result = await page.evaluate(() => {
        const viewport = document.querySelector(".app-pages > .screen-page-viewport")!;
        const navigation = document.querySelector(".bottom-navigation")!.getBoundingClientRect();
        const card = [...document.querySelectorAll(".home-view .topic-card, .explore-view .topic-card")].find(node=>node.getClientRects().length)!.getBoundingClientRect();
        return { scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight, cardBottom: card.bottom, navigationTop: navigation.top };
      });
      expect(result.scrollHeight).toBeLessThanOrEqual(result.clientHeight + 1);
      if (size.width < 900) expect(result.cardBottom).toBeLessThanOrEqual(result.navigationTop);
    });
  }
}

for (const size of [{ width: 1280, height: 593, count: 4 }, { width: 390, height: 664, count: 2 }, { width: 667, height: 375, count: 2 }]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} first list row is visible and all cards are reachable at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openApp(page, size.count);
      if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
      const viewport = page.locator(".app-pages > .screen-page-viewport");
      await expect(page.locator(tab === "home" ? ".personal-feed-grid .topic-card" : ".curated-feed-grid .topic-card")).toHaveCount(size.count);
      await page.locator(tab === "home" ? ".personal-feed-grid .topic-card" : ".curated-feed-grid .topic-card").last().scrollIntoViewIfNeeded();
      await expect(page.locator(tab === "home" ? ".personal-feed-grid .topic-card" : ".curated-feed-grid .topic-card").last()).toBeInViewport();
    });
  }
}

for (const tab of ["home", "explore"] as const) {
  test(`${tab} scrolls within complete rows when feeds exceed the available space`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await openApp(page, 8);
    if (tab === "explore") await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
    const viewport = page.locator(".app-pages > .screen-page-viewport");
    expect(await viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  });
}

for (const language of ["fr", "ar"]) {
  for (const tab of ["home", "explore"] as const) {
    test(`${tab} first feed fits short landscape in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width: 667, height: 375 });
      await page.addInitScript(value => localStorage.setItem("dn_language", value), language);
      await openApp(page, 1);
      if (tab === "explore") await page.locator(".bottom-navigation button").nth(1).click();
      const viewport = page.locator(".app-pages > .screen-page-viewport");
      expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    });
  }
}

for (const width of [1280, 1920]) {
  test(`collapsed sidebar centers three cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("dn-sidebar-collapsed", "true"));
    await openApp(page, 3);
    for (const tab of ["home", "explore"]) {
      if (tab === "explore") {
        await page.locator(".bottom-navigation").getByRole("button", { name: "Explore", exact: true }).click();
        await page.mouse.move(600, 70);
      }
      await expect(page.locator(".collapsible-navigation")).toHaveClass(/is-collapsed/);
      await expect.poll(async () => page.evaluate(() => {
        const title = [...document.querySelectorAll(".home-view .welcome-hero, .explore-view .experience-title")].find(node=>node.getClientRects().length)!.getBoundingClientRect();
        const cards = [...document.querySelectorAll(".home-view .topic-card, .explore-view .topic-card")].filter(node=>node.getClientRects().length).map(node => node.getBoundingClientRect());
        return Math.abs((Math.min(...cards.map(r => r.left)) + Math.max(...cards.map(r => r.right))) / 2 - (title.left + title.right) / 2);
      })).toBeLessThanOrEqual(1);
    }
  });
}


for(const size of [{width:1280,height:593},{width:1920,height:1100},{width:390,height:664},{width:667,height:375}]) {
 test(`feed rows divide available space without partial cards at ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);await openApp(page,5);
  for(const tab of ['home','explore']) {
   if(tab==='explore'){await page.locator('.bottom-navigation').getByRole('button',{name:'Explore',exact:true}).click();await page.mouse.move(size.width-10,70);}
   const grid=page.locator('.adaptive-feed-grid:visible');
   await expect(grid.locator('.topic-card')).toHaveCount(5);
   const complete=async()=>grid.evaluate(node=>{
    const bounds=node.getBoundingClientRect();
    return [...node.querySelectorAll('.topic-card')].every(card=>{
     const r=card.getBoundingClientRect();const overlap=Math.min(r.bottom,bounds.bottom)-Math.max(r.top,bounds.top);
     return overlap<=1||Math.abs(overlap-r.height)<=1;
    });
   });
   const density=await grid.evaluate(node=>{
    const css=getComputedStyle(node);const gap=parseFloat(css.rowGap);const row=parseFloat(css.getPropertyValue('--feed-row-height'));
    return {layout:(node as HTMLElement).dataset.layout,slots:Math.round((node.clientHeight+gap)/(row+gap)),height:node.clientHeight};
   });
   if(density.layout==='large') {
    expect(density.slots).toBe(2);
    const artwork=await grid.locator('.topic-card').first().evaluate(card=>{
     const art=card.querySelector('.topic-art')!.getBoundingClientRect();
     const title=card.querySelector('.topic-name')!.getBoundingClientRect();
     return {width:art.width,right:art.right,titleLeft:title.left};
    });
    expect(artwork.width).toBeGreaterThan(0);
    expect(artwork.width).toBeLessThanOrEqual(112);
    expect(artwork.right).toBeLessThan(artwork.titleLeft);
   }
   else expect(await grid.locator('.topic-card').first().evaluate(n=>Math.round(n.getBoundingClientRect().height))).toBeGreaterThanOrEqual(64);
   await expect.poll(complete).toBe(true);
   expect(await grid.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
   await page.locator('.app-pages > .screen-page-viewport').evaluate(n=>n.scrollTo({top:n.scrollHeight,behavior:'instant'}));
   await expect.poll(complete).toBe(true);
   await expect(page.getByRole('button',{name:'Next page',exact:true})).toHaveCount(0);
  }
 });
}

test('first feed card keeps its top outline inside the grid on hover',async({page})=>{
 await page.setViewportSize({width:1280,height:593});await openApp(page,5);
 for(const tab of ['home','explore']) {
  if(tab==='explore') await page.locator('.bottom-navigation').getByRole('button',{name:'Explore',exact:true}).click();
  const card=page.locator('.adaptive-feed-grid:visible .topic-card').first();
  await card.hover();
  await expect(card).toHaveCSS('transform','none');
  expect(await card.evaluate(node=>{
   const css=getComputedStyle(node);
   return node.getBoundingClientRect().top>=node.parentElement!.getBoundingClientRect().top && parseFloat(css.borderTopWidth)>=1 && css.borderTopStyle==='solid';
  })).toBe(true);
 }
});

test('compact feed cards adapt columns in both directions when the window resizes',async({page})=>{
 await page.setViewportSize({width:1920,height:1100});await openApp(page,5);
 const grid=page.locator('.adaptive-feed-grid:visible');
 await expect(grid).toHaveAttribute('data-layout','list');
 await expect(grid).toHaveAttribute('data-size','compact');
 await expect.poll(()=>grid.evaluate(node=>getComputedStyle(node).getPropertyValue('--feed-columns').trim())).toBe('3');
 await page.setViewportSize({width:390,height:664});
 await expect(grid).toHaveAttribute('data-size','compact');
 await expect.poll(()=>grid.evaluate(node=>getComputedStyle(node).getPropertyValue('--feed-columns').trim())).toBe('1');
 await page.setViewportSize({width:1920,height:1100});
 await expect(grid).toHaveAttribute('data-size','compact');
 await expect.poll(()=>grid.evaluate(node=>getComputedStyle(node).getPropertyValue('--feed-columns').trim())).toBe('3');
 await expect.poll(async()=>grid.locator('.topic-art').first().evaluate(n=>n.getBoundingClientRect().width)).toBeLessThanOrEqual(112);
});

for(const width of [1280,390]) test(`create feed preferences use aligned grouped rows at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await openApp(page,1);
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 const preferences=page.locator('#feed-preferences');
 const visibility=preferences.getByRole('group',{name:'Feed visibility'});
 await visibility.getByRole('radio',{name:'Private',exact:true}).check();
 await expect(page.locator('.feed-preferences-disclosure')).toContainText('Private');
 await visibility.getByRole('radio',{name:'Public',exact:true}).check();
 await expect(visibility.getByRole('radio',{name:'Public',exact:true})).toBeChecked();
 const rowWeights=await preferences.locator('.feed-preference-row').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontWeight));
 expect(rowWeights).toHaveLength(4);
 expect(rowWeights).toEqual(['500','500','500','500']);
 await expect(preferences.getByText('Schedule',{exact:true})).toBeVisible();
 await chooseSetting(preferences,'Briefing language','French');
 await chooseSetting(preferences,'Update rhythm','Every hour');
 await expect(preferences.getByLabel('Deliver at')).toHaveCount(0);
 await chooseSetting(preferences,'Update rhythm','Daily');
 await expect(preferences.getByLabel('Deliver at')).toBeVisible();
 expect(await preferences.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 await preferences.screenshot({path:`test-results/feed-preferences-${width}.png`});
});

test('desktop card has readable linked identity and a separate menu control',async({page})=>{
 await page.setViewportSize({width:1920,height:1100});await openApp(page,5);
 const card=page.getByRole('article').filter({has:page.getByRole('link',{name:'Lebanese politics 0 @owner',exact:true})});
 await expect(card.locator('.topic-name strong')).toBeVisible();
 await expect(card.locator('.topic-name strong')).toHaveCSS('font-size','15px');
 expect(await card.locator('.topic-name strong').evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 const geometry=await card.evaluate(node=>{
  const card=node.getBoundingClientRect();
  const menu=node.querySelector('.feed-options')!.getBoundingClientRect();
  const identity=node.querySelector('.feed-card-identity')!.getBoundingClientRect();
  return {inside:menu.left>=card.left && menu.right<=card.right && menu.top>=card.top && menu.bottom<=card.bottom && identity.left>=card.left && identity.right<=card.right && identity.top>=card.top && identity.bottom<=card.bottom,overlap:Math.max(0,Math.min(menu.right,identity.right)-Math.max(menu.left,identity.left))*Math.max(0,Math.min(menu.bottom,identity.bottom)-Math.max(menu.top,identity.top))};
 });
 expect(geometry.inside).toBe(true);
 expect(geometry.overlap).toBe(0);
 await expect(card.getByRole('link')).toHaveAttribute('href','/owner/feed-0/');
 await card.locator('.feed-card-identity').click({trial:true});
 await expect(card.locator('.feed-card-open')).toBeHidden();
 await expect(card.locator('.feed-options summary')).toBeVisible();
 await card.locator('.feed-options summary').click({trial:true});
 await card.screenshot({path:'test-results/desktop-feed-card.png'});
});
