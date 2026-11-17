import { expect, test } from "@playwright/test";

const feed = { id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };

async function mock(page: import("@playwright/test").Page, authenticated: boolean) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/auth/session" ? { authenticated, setupRequired: false, account: authenticated ? { id: "joud", username: "joud", email: "j@example.test", role: "user" } : null }
      : path === "/api/me/briefings" ? { briefings: authenticated ? [feed] : [] }
      : path === "/api/explore/feeds" ? { feeds: [] }
      : path === "/api/feed/joud/lebanon" ? { briefing: feed, editions: [], viewerHasStarred: false }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
      : {};
    return route.fulfill({ json: body });
  });
}

const headerItems = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const items = [...document.querySelectorAll(".experience-header a, .experience-header button, .experience-header summary")]
    .map(node => ({ node, rect: node.getBoundingClientRect(), shown: getComputedStyle(node).display !== "none" }))
    .filter(item => item.shown && item.rect.width > 0 && item.rect.x >= 0);
  const overlaps: string[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].rect, b = items[j].rect;
    if (Math.abs(a.y - b.y) < 4 && a.x < b.right - 1 && b.x < a.right - 1) overlaps.push(`${items[i].node.textContent?.trim()}×${items[j].node.textContent?.trim()}`);
  }
  return { overlaps, offscreen: items.filter(item => item.rect.right > innerWidth + 1).length, horizontalScroll: document.documentElement.scrollWidth > innerWidth };
});

test("guest feed header never overlaps or leaves the screen at 320px or with doubled text", async ({ page }) => {
  await mock(page, false);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/joud/lebanon/");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  expect(await headerItems(page)).toEqual({ overlaps: [], offscreen: 0, horizontalScroll: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
  expect(await headerItems(page)).toEqual({ overlaps: [], offscreen: 0, horizontalScroll: false });
});

test("signed-in users on phones reach Language and Dark mode in the bottom Settings tab", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('.experience-header .language-cycle')).toBeHidden();
  await expect(page.locator('.experience-header .theme-toggle')).toBeHidden();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.locator('.settings-view');
  await expect(settings).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Explore', exact: true })).toBeVisible();
  await expect(settings.getByRole('group', { name: 'Language' })).toBeVisible();
  await settings.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("empty public feed uses the reference dashboard layout", async ({ page }) => {
  await mock(page, false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/feed/joud/lebanon', route => route.fulfill({ json: { briefing: feed, editions: [], viewerHasStarred: false, publicationState: 'failed' } }));
  await page.goto('/joud/lebanon/');
  await expect(page.getByText('Briefing delayed', { exact: true })).toBeVisible();
  await expect(page.locator('.feed-empty-state')).toBeVisible();
  await expect(page.locator('.feed-filter')).toBeHidden();
  const search = await page.locator('.feed-tools .search').boundingBox();
  const empty = await page.locator('.feed-empty-state').boundingBox();
  expect(search!.width).toBeGreaterThanOrEqual(300);
  expect(search!.x + search!.width).toBeLessThanOrEqual(1440);
  expect(empty!.x + empty!.width).toBeLessThanOrEqual(1440);
  await expect(page.locator('.notice')).toHaveCount(0);
  await expect(page.locator('.feed-publication-status')).toBeVisible();
  expect(empty!.height).toBeGreaterThanOrEqual(140);
  await expect(page.locator('.feed-shell h1')).toHaveCSS('font-size', '40px');
  await page.screenshot({ path: test.info().outputPath('feed-dashboard.png'), fullPage: true });
});

for (const size of [{width: 1280, height: 640}, {width: 390, height: 664}]) {
  test(`empty feed fits without extra scroll and renders a complete icon at ${size.width}px`, async ({ page }) => {
    await mock(page, false);
    await page.setViewportSize(size);
    await page.route('**/api/feed/joud/lebanon', route => route.fulfill({ json: { briefing: {...feed, nextBriefingAt: new Date(Date.now() + 1_200_000).toISOString()}, editions: [], viewerHasStarred: false, publicationState: 'failed' } }));
    await page.goto('/joud/lebanon/');
    await expect(page.locator('.feed-empty-state')).toBeVisible();
    const viewport = page.locator('.app-pages > .screen-page-viewport');
    await expect.poll(() => viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    const circle = await page.locator('.feed-empty-icon').boundingBox();
    const icon = await page.locator('.feed-empty-icon svg').boundingBox();
    expect(icon!.x).toBeGreaterThan(circle!.x);
    expect(icon!.y).toBeGreaterThan(circle!.y);
    expect(icon!.x + icon!.width).toBeLessThan(circle!.x + circle!.width);
    expect(icon!.y + icon!.height).toBeLessThan(circle!.y + circle!.height);
    await expect(page.locator('.feed-tools .search')).toHaveCSS('height', '44px');
  });
}

test("feed stays quiet while loading and shows empty state only after the response", async ({ page }) => {
  await mock(page, false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/feed/joud/lebanon', async route => {
    await gate;
    await route.fulfill({ json: { briefing: feed, editions: [], viewerHasStarred: false } });
  });
  await page.goto('/joud/lebanon/');
  await expect(page.locator('.feed-loading-skeleton')).toHaveCount(0);
  await expect(page.locator('.feed-empty-state')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('h1')).not.toContainText(/loading/i);
  await expect(page.locator('.page-heading > p')).not.toContainText(/loading/i);
  await page.screenshot({ path: test.info().outputPath('feed-loading-skeleton.png'), fullPage: true });
  release();
  await expect(page.locator('.feed-loading-skeleton')).toHaveCount(0);
  await expect(page.locator('.feed-empty-state')).toBeVisible();
  await expect(page.locator('.feed-tools input')).toHaveCSS('font-size', '16px');
});

test("feed refreshes automatically without a manual refresh control", async ({ page }) => {
  await page.clock.install();
  await mock(page, false);
  let reads = 0;
  await page.route('**/api/feed/joud/lebanon', route => route.fulfill({ json: { briefing: { ...feed, title: `Update ${++reads}` }, editions: [], viewerHasStarred: false } }));
  await page.goto('/joud/lebanon/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Update 1');
  await expect(page.getByRole('button', { name: /refresh/i })).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect.poll(() => reads).toBeGreaterThan(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Update ${reads}`);
  const previous = reads;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => reads).toBeGreaterThan(previous);
});

test("profile identity has no gradient backdrop", async ({ page }) => {
  await mock(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Account profile' }).click();
  const identity = page.locator('.profile-dialog .profile-identity');
  await expect(identity).toBeVisible();
  expect(await identity.evaluate(node => getComputedStyle(node, '::before').backgroundImage)).toBe('none');
});

test("appearance follows the system until the person chooses", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await mock(page, true);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("dn_theme"))).toBeNull();
  await context.close();
  const light = await browser.newContext({ colorScheme: "light" });
  const lightPage = await light.newPage();
  await lightPage.addInitScript(() => localStorage.setItem("dn_theme", "dark"));
  await mock(lightPage, true);
  await lightPage.goto("/");
  await expect(lightPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await light.close();
});

test("Home explains an empty search and an empty library", async ({ page }) => {
  await mock(page, true);
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search feeds" }).fill("zzzz");
  await expect(page.getByText("No feeds match your search.").filter({visible:true})).toBeVisible();
  await page.unroute("**/api/**");
  await mock(page, true);
  await page.route("**/api/me/briefings", route => route.fulfill({ json: { briefings: [] } }));
  await page.goto("/");
  await expect(page.getByText("You haven’t created any feeds yet.")).toBeVisible();
});

test("language segments in Settings meet the 44pt target", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".bottom-navigation .navigation-settings").click();
  for (const button of await page.locator(".language-segments button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("a feed card's menu is never covered by the next card", async ({ page }) => {
  const feeds = ["Lebanon", "Technology", "Science"].map((title, index) => ({ ...feed, id: `f${index}`, slug: title.toLowerCase(), title, stars: index }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/auth/session" ? { authenticated: true, setupRequired: false, account: { id: "joud", username: "joud", email: "j@example.test", role: "admin" } }
      : path === "/api/me/briefings" || path === "/api/explore/feeds" ? { briefings: feeds, feeds }
      : path.startsWith("/api/feed/") ? { briefing: feeds[0], editions: [], viewerHasStarred: false }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
      : {};
    return route.fulfill({ json: body });
  });
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.locator(".personal-feed-grid .topic-card").first().locator(".feed-options > summary").click();
    const popover = page.locator(".personal-feed-grid .topic-card").first().locator(".feed-options-popover");
    await expect(popover).toBeVisible();
    const box = (await popover.boundingBox())!;
    const covered = await page.evaluate(({ x, y, width, height }) => {
      const popover = document.querySelector(".personal-feed-grid .topic-card .feed-options-popover")!;
      const points = [[0.1, 0.1], [0.5, 0.2], [0.9, 0.2], [0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]];
      return points.filter(([px, py]) => !popover.contains(document.elementFromPoint(x + width * px, y + height * py))).length;
    }, box);
    expect(covered).toBe(0);
  }
});

test("Create feed and the search row stay put when switching between Home and Explore", async ({ page }) => {
  const position = async () => page.evaluate(() => {
    const box = (element: Element | undefined | null) => { const r = element!.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const create = [...document.querySelectorAll("button")].find(button => /Create feed/.test(button.textContent ?? "") && button.getBoundingClientRect().width > 0);
    return { create: box(create), search: box([...document.querySelectorAll(".explore-search")].find(node=>node.getClientRects().length)) };
  });
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await mock(page, true);
    await page.goto("/");
    await page.waitForSelector(".home-view .explore-search");
    const home = await position();
    await page.locator(".bottom-navigation").getByRole("button", { name: "Explore" }).click();
    await page.waitForSelector(".explore-view .explore-search");
    const explore=await position();
    expect(explore.create[1]).toBe(home.create[1]);
    expect(explore.search[1]).toBe(home.search[1]);
    expect(explore.create[0]+explore.create[2]).toBeLessThanOrEqual(size.width);
    expect(explore.search[0]).toBeGreaterThanOrEqual(0);
    await page.unroute("**/api/**");
  }
});

test("Add feed microphones align and preferences are a single-column list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await mock(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add feed" });
  const mics = await dialog.locator(".voice-input button").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().right)));
  expect(mics).toHaveLength(2);
  expect(mics[0]).toBe(mics[1]);
  await dialog.getByRole("button", { name: "Preferences" }).click();
  const tops = await dialog.locator(".feed-preferences-fields > *").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(tops.length);
});

test("a few feeds retain bounded compact cards on laptops and phones", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const card = page.locator(".personal-feed-grid .topic-card").first();
  await expect(card).toBeVisible();
  const large = await card.boundingBox();
  await expect(page.locator('.personal-feed-grid')).toHaveAttribute('data-size','compact');
  expect(large!.height).toBeGreaterThanOrEqual(88);
  expect(large!.height).toBeLessThanOrEqual(144);
  expect(large!.width).toBeLessThanOrEqual(440);
  expect(await card.evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(140);
});

test("a feed retains per-edition read controls in one reading column", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/feed/joud/lebanon", route=>route.fulfill({json:{briefing:feed,editions:[{id:"one",title:"Supported update",summary:"A supported development.",publishedAt:"2026-10-24T10:00:00Z",sections:[]}]}}));
  await page.goto("/joud/lebanon/");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveCount(0);
  const item = page.locator('.news-item');
  await item.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await expect(item).toHaveClass(/is-read/);
  await item.getByRole('button', { name: 'Mark as unread', exact: true }).click();
  await expect(item).not.toHaveClass(/is-read/);
  const width = await page.locator(".news-line").evaluate(node => node.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(1440);
});

test("the guest landing page retains bounded compact cards for a few feeds", async ({ page }) => {
  const feeds = ["Lebanon", "Technology"].map((title, index) => ({ ...feed, id: `g${index}`, slug: title.toLowerCase(), title, stars: index }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/auth/session" ? { authenticated: false, setupRequired: false, account: null }
      : path === "/api/explore/feeds" ? { feeds } : {};
    return route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const card = page.locator(".curated-feed-grid .topic-card").first();
  await expect(card).toBeVisible();
  await expect(page.locator('.curated-feed-grid')).toHaveAttribute('data-size','compact');
  const bounds=(await card.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(88);
  expect(bounds.height).toBeLessThanOrEqual(144);
  expect(bounds.width).toBeLessThanOrEqual(440);
  expect(await card.evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test("on laptops Home and Explore centre the title, search row and categories on one axis", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mock(page, true);
  await page.goto("/");
  await page.waitForSelector(".home-view .explore-search");
  const centers = () => page.evaluate(() => {
    const center = (selector: string) => { const r = [...document.querySelectorAll(selector)].find(node=>node.getClientRects().length)!.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
    return { title: center(".home-view .welcome-hero, .explore-view .experience-title"), controls: center(".explore-controls") };
  });
  const home = await centers();
  expect(Math.abs(home.title - home.controls)).toBeLessThanOrEqual(2);
  await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
  await page.waitForSelector(".explore-view .explore-search");
  const explore = await centers();
  expect(Math.abs(explore.title - explore.controls)).toBeLessThanOrEqual(2);
});
