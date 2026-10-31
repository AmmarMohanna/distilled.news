import { expect, test } from "@playwright/test";
import { cycleLanguage, toggleTheme } from "./helpers";
const feed = { id: "one", ownerAccountId: "owner", ownerUsername: "owner", slug: "science", title: "Science", stars: 2, interestProfile: "Science news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "UTC", retentionDays: 15 };
async function mock(page: import("@playwright/test").Page, authenticated = true) {
 await page.route("**/api/**", route => {
  const path = new URL(route.request().url()).pathname;
  const body = path === "/api/auth/session" ? { authenticated, account: authenticated ? { id: "owner", username: "owner", role: "user" } : null }
   : path === "/api/me/briefings" ? { briefings: [feed] }
   : path === "/api/explore/feeds" || path === "/api/explore/popular" ? { feeds: [feed] }
   : path.startsWith("/api/feed/") ? { briefing: feed, editions: [], viewerHasStarred: false }
   : path === "/api/me/sources" ? { sources: [] }
   : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
   : path === "/api/me/sources/assess" ? { assessment: { input: route.request().postDataJSON().source, status: "accepted", reason: "Relevant", checkedAt: new Date().toISOString() } }
      : path === "/api/me/sources/recommend" ? { sources: ["NASA", "Space exploration"] } : {};
  return route.fulfill({ json: body });
 });
}

test("phone header preserves compact branding and controls with an icon-only create button", async ({ page }) => {
 await mock(page, false);
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/");
 const create = page.getByRole("button", { name: "Create feed", exact: true });
 await expect(create).toBeVisible();
 await expect(create.locator('.create-feed-label')).toBeHidden();
 await expect(create).toHaveCSS('width', '48px');
 const brand = page.locator('.experience-header .experience-brand');
 await expect(brand.locator('.distilled-logo-wordmark')).toBeHidden();
 await expect(brand).toHaveAttribute('aria-label','Distilled.news');
 await expect(brand.locator('.distilled-logo-symbol')).toBeVisible();
 const symbol = await brand.locator('.distilled-logo-symbol').boundingBox();
 await expect(page.locator('.experience-header .language-cycle')).toBeVisible();
 await expect(page.locator('.experience-header .theme-toggle')).toBeVisible();
 await expect(page.locator('.experience-header .mobile-appearance-settings')).toHaveCount(0);
 await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
 const login = await page.getByRole('link', { name: 'Log in', exact: true }).boundingBox();
 expect(Math.abs(symbol!.y + symbol!.height / 2 - login!.y - login!.height / 2)).toBeLessThan(2);
 await page.setViewportSize({ width: 320, height: 568 });
 await expect(brand.locator('.distilled-logo-wordmark')).toBeHidden();
 const narrowSymbol = await brand.locator('.distilled-logo-symbol').boundingBox();
 const narrowLogin = await page.getByRole('link', { name: 'Log in', exact: true }).boundingBox();
 expect(narrowSymbol!.x).toBeGreaterThanOrEqual(0);
 expect(narrowSymbol!.x + narrowSymbol!.width).toBeLessThanOrEqual(narrowLogin!.x);
 await create.click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:1280,height:844});
 await expect(brand.locator('.distilled-logo-wordmark')).toBeVisible();
});

test("feed menus stay visible at viewport edges and escape card clipping", async ({ page }) => {
 await mock(page);
 await page.setViewportSize({ width: 390, height: 500 });
 await page.goto("/");
 const menu = page.locator(".personal-feed-grid .feed-options").first();
 await expect(menu).toBeVisible();
 for (const top of [12, 440]) {
  await menu.evaluate((node, y) => {
   node.style.position = "fixed";
   node.style.top = `${y}px`;
   node.style.right = "12px";
   node.closest<HTMLElement>(".topic-card")!.style.overflow = "hidden";
  }, top);
  await menu.locator("summary").focus();
  await menu.locator("summary").press("Enter");
  const panel = menu.locator(".feed-options-popover");
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(node => {
   const rect = node.getBoundingClientRect();
   const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
   return rect.top >= 12 && rect.bottom <= innerHeight - 12 && rect.left >= 12 && rect.right <= innerWidth - 12 && node.contains(hit);
  })).toBe(true);
  await menu.locator("summary").press("Escape");
  await expect(panel).toBeHidden();
 }
});
test("feed cards retain transparent illustrations, rounded cards, plain controls, and real update times", async ({ page }) => {
 await page.clock.install({ time: new Date("2026-10-02T14:00:00Z") });
 await mock(page);
 await page.route("**/api/feed/owner/science", route => route.fulfill({ json: {
  briefing: feed, viewerHasStarred: false,
  editions: [{ id: "edition", publishedAt: "2026-10-02T11:00:00Z", updatedAt: "2026-10-02T12:00:00Z", sections: [] }]
 } }));
 await page.goto("/");
 const card = page.locator(".personal-feed-grid .topic-card");
 await expect(card.locator("time")).toHaveText("Updated 2 hours ago");
 await expect(card.locator("time")).toHaveAttribute("datetime", "2026-10-02T12:00:00Z");
 await expect(card).toHaveCSS("border-radius", "20px");
 await expect(card.locator(".topic-art")).toHaveCSS("border-top-left-radius", '0px');
 await expect(card.locator(".topic-art")).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(card.locator(".feed-card-meta > button")).toBeVisible();
 for (const selector of [".theme-toggle", ".language-cycle", ".personal-feed-grid .feed-options > summary"]) {
  await expect(page.locator(selector)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
 }
 await expect(page.locator(".avatar-button")).toHaveCSS("color", "rgb(94, 92, 230)");
 await card.locator("summary").click();
 await expect(card.getByRole("link", { name: "Edit feed settings" })).toBeVisible();
 await card.locator("summary").press("Escape");
 await expect(card.locator("details")).not.toHaveAttribute("open", "");
 await toggleTheme(page);
 await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
 await expect(page.locator(".theme-toggle")).toHaveAttribute("aria-label", /light mode/i);
 await expect(card.locator(".feed-options > summary")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("cards expose owner edit and stars; speech controls are icons and sources selectable", async ({ page }) => {
 await mock(page); await page.goto("/");
 await page.locator('.personal-feed-grid .feed-options > summary').click();
 await expect(page.locator(".personal-feed-grid").getByRole("link", { name: "Edit feed settings" })).toBeVisible();
 await page.locator('.personal-feed-grid .feed-options > summary').press('Escape');
 await expect(page.locator(".personal-feed-grid").getByRole("button", { name: "Star", exact: true })).toBeVisible();
 await expect(page.getByText("View briefing", { exact: true })).toHaveCount(0);
 await page.getByRole("button", { name: "Create feed", exact: true }).click();
 const dialog = page.getByRole("dialog", { name: "Add feed" });
 await dialog.getByLabel("Feed name", { exact: true }).fill("Space");
 await dialog.getByLabel("What would you like to follow?", { exact: true }).fill("Space exploration");
 await expect(dialog.getByText("Your browser may process speech online.")).toHaveCount(0);
 await expect(dialog.locator(".voice-input button").first()).toHaveText("");
 await dialog.getByRole("button", { name: "Recommend sources with AI" }).click();
 await dialog.locator('.source-search-results button').filter({ hasText: 'NASA' }).click();
 await expect(dialog.locator('.selected-source-row')).toContainText('NASA');
});
test("guest landing has login, curated feeds, and no owner edit", async ({ page }) => {
 await mock(page, false); await page.goto("/");
 await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
 await expect(page.getByRole("link", { name: "Edit feed settings" })).toHaveCount(0);
 await expect(page.locator(".topic-grid").getByText("Science", { exact: true })).toBeVisible();
});
test("shared scaling keeps navigation and headers equal after visiting home and explore", async ({ page }) => {
 await mock(page); await page.goto("/");
 await page.getByRole("button", { name: "Explore", exact: true }).click();
 await page.waitForTimeout(250);
 const scale = await page.locator(".screen-page-content").evaluate(node => getComputedStyle(node).zoom);
 const header = await page.locator(".experience-header").boundingBox();
 await page.getByRole("button", { name: "Home", exact: true }).click();
 await page.waitForTimeout(250);
 expect(await page.locator(".screen-page-content").evaluate(node => getComputedStyle(node).zoom)).toBe(scale);
 expect((await page.locator(".experience-header").boundingBox())!.height).toBeCloseTo(header!.height, 0);
 expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
 await cycleLanguage(page);
 await cycleLanguage(page);
 await expect(page.locator("html")).toHaveAttribute("lang", "ar");
 expect(await page.locator(".welcome-copy p").evaluate(node => getComputedStyle(node).direction)).toBe("rtl");
});


test("search clears without losing feed controls and keyboard focus remains visible", async ({ page }) => {
 await mock(page); await page.goto("/");
 await expect(page.getByRole("heading", { name: "Welcome back!", exact: true })).toBeVisible();
 const search = page.getByRole("searchbox", { name: "Search feeds", exact: true });
 await search.fill("no matching feed");
 await expect(page.locator(".personal-feed-grid .topic-card")).toHaveCount(0);
 const clear = page.getByRole("button", { name: "Clear search", exact: true });
 await clear.focus();
 expect(await clear.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
 await page.keyboard.press("Enter");
 await expect(search).toHaveValue("");
 await expect(page.locator(".personal-feed-grid .topic-card")).toHaveCount(1);
});

test("reduced motion and transparency keep navigation and dialogs usable", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" });
 await mock(page); await page.goto("/");
 await page.getByRole("button", { name: "Create feed", exact: true }).click();
 const dialog = page.getByRole("dialog", { name: "Add feed" });
 await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(node => node.getAnimations().length)).toBe(0);
 await page.keyboard.press("Escape");
 await expect(dialog).toHaveCount(0);
 const client = await page.context().newCDPSession(page);
 await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-reduced-transparency", value: "reduce" }] });
 await expect.poll(() => page.locator(".bottom-navigation").evaluate(node => getComputedStyle(node).backdropFilter)).toBe("none");
});
