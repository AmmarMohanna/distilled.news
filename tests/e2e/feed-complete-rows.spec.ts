import { expect, test, type Page } from '@playwright/test';

async function openFeeds(page: Page, count: number) {
  const feeds = Array.from({ length: count }, (_, index) => ({ id: `adaptive-${index}`, ownerAccountId: 'owner', ownerUsername: 'owner', slug: `feed-${index}`, title: `Science ${index + 1}`, stars: 0, paused: false, publicFeedEnabled: true }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sketch')) return route.fulfill({ status: 404 });
    return route.fulfill({ json: path === '/api/auth/session' ? { authenticated: true, account: { id: 'owner', username: 'owner', role: 'user' } }
      : path === '/api/me/briefings' ? { briefings: feeds } : path === '/api/explore/feeds' ? { feeds: feeds.map(feed => ({...feed,id:`community-${feed.id}`,ownerAccountId:'community',ownerUsername:'community'})) }
      : path.startsWith('/api/feed/') ? { briefing: feeds[0], editions: [] } : { sources: [] } });
  });
  await page.goto('/');
  await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(count);
}


for(const width of [390,1280])for(const height of [664,900])test('complete feed rows at '+width+'x'+height,async({page})=>{
 await page.setViewportSize({width,height});await openFeeds(page,30);await page.mouse.move(width-2,60);
 const grid=page.locator('.personal-feed-grid');await expect(grid).toBeVisible();
 const inspect=()=>grid.evaluate(node=>{const bounds=node.getBoundingClientRect();const cards=[...node.querySelectorAll('.topic-card')].map(n=>n.getBoundingClientRect());return {scrollable:node.scrollHeight>node.clientHeight+1,partial:cards.filter(r=>r.bottom>bounds.top+1&&r.top<bounds.bottom-1).some(r=>r.top<bounds.top-1||r.bottom>bounds.bottom+1),visible:cards.filter(r=>r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1).length};});
 await expect.poll(async()=> (await inspect()).scrollable).toBe(true);expect((await inspect()).partial).toBe(false);expect((await inspect()).visible).toBeGreaterThan(0);
 await grid.evaluate(node=>node.scrollTop=90);await expect.poll(async()=> (await inspect()).partial).toBe(false);
 await grid.evaluate(node=>node.scrollTop=node.scrollHeight);await page.waitForTimeout(250);await expect(grid.locator('.topic-card').last()).toBeInViewport();expect((await inspect()).partial).toBe(false);
});

test('keyboard focus reveals feeds below the complete rows',async({page})=>{
 await page.setViewportSize({width:390,height:664});await openFeeds(page,30);
 const last=page.locator('.personal-feed-grid .topic-card').last().locator('button').first();await last.focus();await expect(last).toBeFocused();await expect(last).toBeInViewport();
});
test('enlarged text remains reachable on a short screen',async({page})=>{
 await page.setViewportSize({width:320,height:568});await openFeeds(page,12);await page.addStyleTag({content:'html {font-size:200% !important}'});
 const grid=page.locator('.personal-feed-grid');const last=grid.locator('.topic-card').last();await last.locator('button').first().focus();await expect(last).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const title of await grid.locator('strong').all())expect(await title.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
});
