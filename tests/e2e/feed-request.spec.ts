import { expect, test } from "@playwright/test";
import { refreshFeed } from "./helpers";
const feed = { id: "one", ownerAccountId: "owner", ownerUsername: "admin", slug: "personal", title: "Personal Briefing", stars: 0, interestProfile: "News", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "UTC", retentionDays: 15 };
test("requested feed layout and language controls", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/session" ? { authenticated: true, account: { id: "owner", username: "admin", role: "user" } }
      : path === "/api/me/briefings" ? { briefings: [feed,{...feed,id:"archived",slug:"archived",title:"Archived feed",paused:true}] }
      : path === "/api/explore/feeds" ? { feeds: [] }
      : path.startsWith("/api/feed/") ? { briefing: feed, editions: [{ id: "edition", publishedAt: new Date(Date.now() - 3600000).toISOString(), sections: [] }], viewerHasStarred: false }
      : path === "/api/me/sources" ? { sources: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  const card = page.locator(".personal-feed-grid .topic-card");
  await expect(card.locator(".feed-card-identity strong")).toHaveText("Personal Briefing");
  await expect(card.locator(".feed-card-identity small")).toHaveText("@admin");
  await expect(card.locator(".feed-card-status")).toHaveText("Live");
  await expect(card.locator("time")).toContainText("Updated");
  await expect(card.locator(".topic-art")).toBeVisible();
  await expect(page.locator(".distilled-logo-dot").first()).toHaveCSS("color", "rgb(94, 92, 230)");
  await page.getByRole("button", { name: "Archived feeds", exact: true }).click();
  const archive = page.getByRole("dialog", { name: "Archived feeds" });
  await expect(archive).toContainText("Archived feed");
  await expect(archive).toContainText("Paused");
  await expect(archive).not.toContainText("Personal Briefing");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add feed" });
  await dialog.getByRole("button", { name: "Preferences" }).click();
  const languages=dialog.getByLabel("Briefing language");
  await expect(languages.locator("option")).toHaveCount(3);
  await languages.selectOption("fr");
  await expect(languages).toHaveValue("fr");
});

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 664 }]) test(`create feed fits ${size.width}x${size.height} with reachable preferences`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/session" ? { authenticated: true, account: { id: "owner", username: "admin", role: "user" } }
      : path === "/api/me/briefings" || path === "/api/explore/feeds" ? { briefings: [], feeds: [] }
      : path === "/api/me/sources" ? { sources: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add feed" });
  const viewport = dialog.locator(".screen-page-viewport");
  await expect(dialog.getByLabel("Feed name")).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
  await dialog.getByRole("button", { name: "Preferences" }).click();
  await dialog.getByLabel("Briefing language").scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel("Briefing language")).toBeInViewport();
});

test("phone install control explains the browser install path", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  // This is a Safari fixture running in Chromium. Safari has no native
  // beforeinstallprompt; don't let Chromium's installability timing change it.
  await page.addInitScript(() => window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); event.stopImmediatePropagation();
  }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/session" ? { authenticated: true, account: { id: "owner", username: "admin", role: "user" } }
      : path === "/api/me/briefings" || path === "/api/explore/feeds" ? { briefings: [], feeds: [] }
      : path === "/api/me/sources" ? { sources: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Install app" }).click();
  await expect(page.getByRole("dialog", { name: "Install app" })).toContainText("Add to Home Screen");
  await context.close();
});

for(const width of [1280,390])test(`scheduled processing remains visible without manual generation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});let calls=0;
 const activeFeed={...feed,paused:false};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/request-summary')){calls++;return route.fulfill({status:410,json:{error:'retired'}})}
  const data=path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'admin',role:'user'}}:
   path==='/api/me/briefings'?{briefings:[activeFeed]}:
   path==='/api/feed/admin/personal'?{briefing:activeFeed,editions:[],viewerHasStarred:false,publicationState:'checking',publicationProgress:{stage:'PROCESSING',acquisition:{completed:2,total:3,failed:0},review:{completed:1,total:2,failed:0},pending:2}}:{};
  return route.fulfill({json:data});
 });
 await page.goto('/admin/personal/');
 await expect(page.getByRole('button',{name:/brief now/i})).toHaveCount(0);
 await expect(page.getByText(/Reviewing collected items/)).toBeVisible();
 await refreshFeed(page);expect(calls).toBe(0);
});
