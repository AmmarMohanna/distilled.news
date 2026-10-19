import { expect, test } from "@playwright/test";
import { cycleLanguage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/auth/session" ? { authenticated: true, account: { id: "test", username: "test", role: "user" } }
      : path === "/api/me/briefings" ? { briefings: [] }
      : (path === "/api/explore/feeds" || path === "/api/explore/popular") ? { feeds: [] }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } } : {};
    return route.fulfill({ json: body });
  });
});

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 664 }, { width: 667, height: 375 }]) {
  test(`feed form fits ${size.width}x${size.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByRole("button", { name: "Create feed", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add feed" });
    await expect(dialog.getByLabel("Feed name")).toBeVisible();
    await dialog.getByLabel("Feed name").fill("Plants");
    await dialog.getByLabel("What would you like to follow?", { exact: true }).fill("Botanical discoveries");
    await expect(dialog.getByLabel("Time zone", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Preferences", exact: true }).click();
    await dialog.getByRole("radio", { name: "FR", exact: true }).check();
    await expect(dialog.getByRole("radio", { name: "FR", exact: true })).toBeChecked();
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("website language cycles en fr ar en without a menu", async ({ page }) => {
  await page.goto("/");
  for (const next of ["fr", "ar", "en"]) {
    await cycleLanguage(page);
    await expect(page.locator("html")).toHaveAttribute("lang", next);
  }
  await expect(page.locator(".language-menu")).toHaveCount(0);
});

test("feeds are public and expose no private visibility control", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create feed', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(dialog.locator('.feed-preferences-disclosure')).toContainText('Public');
  await expect(dialog.getByLabel('Visibility', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('option', { name: 'Private', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('What would you like to follow?', { exact: true })).toHaveCount(1);
  await expect(dialog.getByLabel('What would you like to follow?', { exact: true })).toHaveAttribute('placeholder', 'e.g. topics, keywords...');
});

test("change password expands and collapses the password fields", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account profile', exact: true }).click();
  const toggle = page.locator('.password-disclosure');
  await expect(page.getByLabel('Current Password', { exact: true })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Current Password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New Password', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.getByLabel('New Password', { exact: true })).toBeHidden();
});

test("voice controls keep feed name separate from description", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      onresult: any; onend: any;
      start() { this.onresult({ results: [[{ transcript: "Marine archaeology discoveries" }]] }); this.onend(); }
      stop() { this.onend(); } abort() {}
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  await page.getByRole("button", { name: "Describe by voice" }).click();
  await expect(page.getByLabel("Feed name")).toHaveValue("");
  await page.getByRole("button", {name: "Record feed title"}).click();
  await expect(page.getByLabel("Feed name")).toHaveValue("Marine archaeology discoveries");
  await expect(page.getByLabel("What would you like to follow?", { exact: true })).toHaveValue("Marine archaeology discoveries");
});

test("all feed cards scroll with the page without paging controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.route("**/api/me/briefings", route => route.fulfill({ json: { briefings: Array.from({ length: 20 }, (_, i) => ({ id: `feed-${i}`, ownerUsername: "test", slug: `feed-${i}`, title: `Feed ${i + 1}` })) } }));
  await page.goto("/");
  await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(20);
  await expect(page.locator('.feed-pagination')).toHaveCount(0);
  await expect(page.locator('.personal-feed-grid')).toHaveCSS('overflow-y', 'visible');
  const viewport = page.locator('.app-pages > .screen-page-viewport');
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await viewport.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const card = await page.locator('.personal-feed-grid .topic-card').last().boundingBox();
  const navigation = await page.locator('.bottom-navigation').boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(navigation!.y);
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 1280, height: 720 }, { width: 1440, height: 1000 }]) {
  test(`feed rows stay compact and evenly spaced at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route("**/api/me/briefings", route => route.fulfill({ json: { briefings: Array.from({ length: 20 }, (_, i) => ({ id: `feed-${i}`, ownerUsername: "test", slug: `feed-${i}`, title: `Feed ${i + 1}` })) } }));
    await page.goto("/");
    await expect(page.locator('.personal-feed-grid .topic-card').first()).toBeVisible();
    const firstCard = page.locator('.personal-feed-grid .topic-card').first();
    await expect.poll(() => firstCard.evaluate(node => {
      const grid = node.closest<HTMLElement>('.adaptive-feed-grid')!;
      const expected = grid.dataset.layout === 'large' ? 208 : 84;
      return Math.abs(node.getBoundingClientRect().height - expected) < 1;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const cards = [...document.querySelectorAll('.personal-feed-grid .topic-card')].map(node => node.getBoundingClientRect());
      const rows = cards.filter((card, index) => !index || Math.abs(card.top - cards[index - 1].top) > 1);
      const gap = innerWidth >= 900 ? 16 : 10;
      return rows.slice(1).every((row, index) => Math.abs(row.top - rows[index].bottom - gap) < 1);
    })).toBe(true);
    await expect(page.locator('.personal-feed-grid')).toHaveCSS('margin-top', '8px');


  });
}

test("microphone denial keeps typed input and explains recovery", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      onerror: any; onend: any;
      start() { this.onerror({ error: "not-allowed" }); this.onend(); }
      stop() {} abort() {}
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  await page.getByLabel("Feed name").fill("My feed");
  await page.getByRole("button", { name: "Describe by voice" }).click();
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await expect(page.getByLabel("Feed name")).toHaveValue("My feed");
});



test("language changes keep navigation in place and localize empty Explore", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/explore');
  const navigation = page.locator('.bottom-navigation');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(navigation).toBeVisible();
  const before = await navigation.boundingBox();
  const searchBefore = await page.locator('.explore-search').boundingBox();
  for (const language of ['fr', 'ar']) {
    await cycleLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    const after = await navigation.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    if (language !== 'ar') expect((await page.locator('.explore-search').boundingBox())!.x).toBeCloseTo(searchBefore!.x, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('.explore-search').boundingBox())!.y).toBeCloseTo(searchBefore!.y, 0);
  }
  await expect(page.getByRole('heading', { name: 'استكشف', exact: true })).toBeVisible();
  await expect(page.locator('.topic-card')).toHaveCount(0);
  await expect(page.locator('.category-chips')).toHaveCount(0);
});

test("mobile search and create stay together across languages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const search = page.locator('.home-controls .explore-search');
  const create = page.locator('.home-add-feed');
  await expect(create).toBeVisible();
  await page.waitForTimeout(200); // Allow viewport fitting after the session response.
  const original = await create.boundingBox();
  for (let i = 0; i < 3; i++) {
    const a = await search.boundingBox(), b = await create.boundingBox();
    expect(Math.abs(a!.y + a!.height / 2 - b!.y - b!.height / 2)).toBeLessThan(2);
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(390);
    expect(b!.y).toBeCloseTo(original!.y, 0);
    await cycleLanguage(page);
    await page.waitForTimeout(200);
  }
  const homeFont = await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily);
  await page.getByRole('navigation').getByRole('button', {name:'Explore', exact:true}).click();
  expect(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).toBe(homeFont);
  await page.screenshot({ path: 'test-results/mobile-explore-updated.png' });
});

test("install action invokes the browser installation prompt", async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, { prompt: async () => { (window as any).installRequested = true; }, userChoice: Promise.resolve({outcome:'accepted'}) });
    window.dispatchEvent(event);
  });
  await page.getByRole('navigation').getByRole('button', {name:'Settings'}).click();
  await page.getByRole('button', {name:'Install app'}).click();
  expect(await page.evaluate(() => (window as any).installRequested)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('dialog', {name:'Install app'}).getByRole('status')).toHaveText('Installation completed. Check your apps.');
});

test("disabled notifications do not request a browser subscription", async ({ page }) => {
  await page.addInitScript(() => {
    let subscription: any = null;
    const manager = {
      getSubscription: async () => subscription,
      subscribe: async () => subscription = { endpoint:'https://fcm.googleapis.com/test', toJSON: () => ({endpoint:'https://fcm.googleapis.com/test',keys:{auth:'test',p256dh:'test'}}), unsubscribe: async () => {subscription=null;return true;} }
    };
    const registration = {pushManager:manager};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration)}});
    Object.defineProperty(window,'Notification',{value:{requestPermission:async()=>'granted'}});
    Object.defineProperty(window,'PushManager',{value:class {}});
  });
  const requests: string[] = [];
  await page.route('**/api/me/push', route => {
    requests.push(route.request().method());
    return route.fulfill({json:route.request().method()==='GET'?{publicKey:btoa('public-key')}:{ok:true}});
  });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', {name:'Settings'}).click();
  const notifications = page.getByRole('switch', {name:'Notifications'});
  await expect(notifications).not.toBeChecked();
  await notifications.click();
  await expect(notifications).toBeChecked();
  await expect(page.getByRole('dialog', {name:'Notifications'})).toHaveCount(0);
  await notifications.click();
  await expect(notifications).not.toBeChecked();
  expect(requests).toEqual(['GET','POST','DELETE']);
});
