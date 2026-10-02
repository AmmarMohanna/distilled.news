import { expect, test } from "@playwright/test";

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
    await dialog.getByRole("button", { name: "Feed language: en", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Feed language: fr", exact: true })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("website language cycles en fr ar en without a menu", async ({ page }) => {
  await page.goto("/");
  for (const next of ["fr", "ar", "en"]) {
    await page.getByRole("button", { name: /^Website language:/ }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", next);
  }
  await expect(page.locator(".language-menu")).toHaveCount(0);
});

test("feed visibility is selectable and the description label is not repeated", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create feed', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Public', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Private', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('Only you can read this feed.')).toBeVisible();
  await expect(dialog.getByLabel('What would you like to follow?', { exact: true })).not.toHaveAttribute('placeholder');
});

test("change password expands and collapses the password fields", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account profile', exact: true }).click();
  const toggle = page.locator('.password-disclosure');
  await expect(page.getByLabel('current password', { exact: true })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('current password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('new password', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.getByLabel('new password', { exact: true })).toBeHidden();
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

test("long feed lists scroll with the last card clear of navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.route("**/api/me/briefings", route => route.fulfill({ json: { briefings: Array.from({ length: 20 }, (_, i) => ({ id: `feed-${i}`, ownerUsername: "test", slug: `feed-${i}`, title: `Feed ${i + 1}` })) } }));
  await page.route("**/sketch", route => route.fulfill({ status: 404 }));
  await page.goto("/");
  await expect(page.locator('.screen-page-controls')).toHaveCount(0);
  await expect(page.locator('.personal-feed-grid .topic-card')).toHaveCount(20);
  const viewport = page.locator('.app-pages > .screen-page-viewport');
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await expect.poll(() => page.locator('.app-pages .screen-page-content').evaluate(node => Number(getComputedStyle(node).zoom))).toBeGreaterThanOrEqual(0.85);
  await viewport.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const last = page.locator('.personal-feed-grid .topic-card').last();
  const card = await last.boundingBox();
  const navigation = await page.locator('.bottom-navigation').boundingBox();
  expect(card!.y).toBeGreaterThanOrEqual(0);
  expect(card!.y + card!.height).toBeLessThanOrEqual(navigation!.y);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(664);
});

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



test("language changes keep navigation in place and translate topics", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/explore');
  const navigation = page.locator('.bottom-navigation');
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  await expect(navigation).toBeVisible();
  const before = await navigation.boundingBox();
  const searchBefore = await page.locator('.explore-search').boundingBox();
  for (const language of ['fr', 'ar']) {
    await page.getByRole('button', { name: /^Website language:/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const after = await navigation.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect((await page.locator('.explore-search').boundingBox())!.x).toBeCloseTo(searchBefore!.x, 0);
    expect((await page.locator('.explore-search').boundingBox())!.y).toBeCloseTo(searchBefore!.y, 0);
  }
  await expect(page.locator('.topic-grid')).not.toContainText('Global Affairs');
  await expect(page.locator('.category-chips')).not.toContainText('Science');
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
    expect(b!.x).toBeCloseTo(original!.x, 0);
    expect(b!.y).toBeCloseTo(original!.y, 0);
    await page.getByRole('button', { name: /^Website language:/ }).click();
    await page.waitForTimeout(200);
  }
  const homeFont = await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily);
  await page.getByRole('navigation').getByRole('button', {name:'Explore'}).click();
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
  await page.getByRole('button', {name:'Install app (PWA)'}).click();
  await expect(page.getByRole('status')).toHaveText('App installed.');
  expect(await page.evaluate(() => (window as any).installRequested)).toBe(true);
});

test("notifications store a browser subscription and can be disabled", async ({ page }) => {
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
  await page.getByRole('button', {name:'Notifications',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Notifications enabled for new briefings in your feeds.');
  await page.getByRole('button', {name:'Notifications',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Notifications disabled on this device.');
  expect(requests).toEqual(['GET','POST','DELETE']);
});
