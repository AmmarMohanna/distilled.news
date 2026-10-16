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

test("guests on phones reach Language and Dark mode from the feed's More menu", async ({ page }) => {
  await mock(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/joud/lebanon/");
  await page.locator(".feed-more > summary").click();
  await page.getByRole("button", { name: /^Dark mode/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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
  await expect(page.getByText("No feeds match your search.")).toBeVisible();
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
    return { create: box(create), search: box(document.querySelector(".explore-search")) };
  });
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await mock(page, true);
    await page.goto("/");
    await page.waitForSelector(".home-view .explore-search");
    const home = await position();
    await page.locator(".bottom-navigation").getByRole("button", { name: "Explore" }).click();
    await page.waitForSelector(".explore-view .explore-search");
    expect(await position()).toEqual(home);
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

test("a few feeds become large capped cards on laptops but stay compact on phones", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const card = page.locator(".personal-feed-grid .topic-card").first();
  await expect(card).toBeVisible();
  const large = await card.boundingBox();
  expect(large!.height).toBeGreaterThan(250);
  expect(large!.width).toBeLessThanOrEqual(341);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(140);
});

test("a feed offers All and Unread filters in one reading column", async ({ page }) => {
  await mock(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/joud/lebanon/");
  const filter = page.getByRole("group", { name: "Filter briefings" });
  await expect(filter.getByRole("button", { name: "All", exact: true })).toBeVisible();
  await expect(filter.getByRole("button", { name: /^Unread/ })).toHaveAttribute("aria-pressed", "true");
  await filter.getByRole("button", { name: "All", exact: true }).click();
  await expect(filter.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  const width = await page.locator(".news-line").evaluate(node => node.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(721);
});

test("the guest landing page also uses large cards when there are only a few feeds", async ({ page }) => {
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
  expect((await card.boundingBox())!.height).toBeGreaterThan(250);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test("on laptops Home and Explore centre the title, search row and categories on one axis", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mock(page, true);
  await page.goto("/");
  await page.waitForSelector(".home-view .explore-search");
  const centers = () => page.evaluate(() => {
    const center = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
    return { title: center(".home-view h1, .explore-view h1"), controls: center(".explore-controls") };
  });
  const home = await centers();
  expect(Math.abs(home.title - home.controls)).toBeLessThanOrEqual(2);
  await page.getByRole("navigation").getByRole("button", { name: "Explore" }).click();
  await page.waitForSelector(".explore-view .explore-search");
  expect(await centers()).toEqual(home);
});
