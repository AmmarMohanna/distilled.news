import { expect, test } from "@playwright/test";
import { expectCopiedSource, refreshFeed } from "./helpers";

const briefing = { id: "personal", ownerAccountId: "admin-id", ownerUsername: "admin", slug: "personal-briefing", title: "Personal Briefing", stars: 0, interestProfile: "Current events", publicFeedEnabled: true, paused: true, language: "en", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "UTC", retentionDays: 15 };

async function openBriefing(page: import("@playwright/test").Page) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/session" ? { authenticated: true, account: { id: "admin-id", username: "admin", role: "admin" } }
      : path === "/api/me/briefings" ? { briefings: [briefing] }
      : path === "/api/feed/admin/personal-briefing" ? { briefing, editions: [], viewerHasStarred: false }
      : path === "/api/explore/feeds" ? { feeds: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/admin/personal-briefing/");
  await expect(page.getByRole("heading", { name: "Personal Briefing" })).toBeVisible();
}

test("restored briefing layout preserves controls and theme", async ({ page }) => {
  await openBriefing(page);
  await expect(page.locator(".page-heading")).toContainText("by admin");
  const headingBounds=await page.locator('.page-heading').boundingBox();
  for(const node of [page.locator('.page-heading h1'),page.locator('.page-heading > p')]) {const box=await node.boundingBox();expect(Math.abs(box!.x+box!.width/2-headingBounds!.x-headingBounds!.width/2)).toBeLessThan(2);}
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  await expect(page.locator(".feed-check-status")).toContainText("feed paused");
  const artwork=page.locator('.feed-hero-art .topic-art');
  const enlarged=await artwork.boundingBox();
  const titleBefore=await page.locator('.page-heading h1').boundingBox();
  await artwork.evaluate(node=>(node as HTMLElement).style.transform='none');
  const original=await artwork.boundingBox();
  const titleAfter=await page.locator('.page-heading h1').boundingBox();
  expect(enlarged!.width/original!.width).toBeCloseTo(1.5,1);
  expect(Math.abs(enlarged!.y+enlarged!.height-original!.y-original!.height)).toBeLessThan(1);
  expect(titleAfter!.y).toBe(titleBefore!.y);
  await artwork.evaluate(node=>(node as HTMLElement).style.removeProperty('transform'));
  const artBounds=await page.locator('.feed-hero-art').boundingBox();
  const titleBounds=await page.locator('.page-heading h1').boundingBox();
  const authorBounds=await page.locator('.page-heading > p').boundingBox();
  const toolsBounds=await page.locator('.feed-tools').boundingBox();
  expect(titleBounds!.y-artBounds!.y-artBounds!.height).toBeLessThanOrEqual(8);
  expect(authorBounds!.y-titleBounds!.y-titleBounds!.height).toBeLessThanOrEqual(8);
  expect(toolsBounds!.y-authorBounds!.y-authorBounds!.height).toBeLessThanOrEqual(28);
  const headerButtons=page.locator('.experience-header-actions > .language-cycle:visible, .experience-header-actions > .theme-toggle:visible, .experience-header-actions .feed-header-actions > button:visible');
  const controlBounds=await headerButtons.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
  const sameRow=controlBounds.every(box=>Math.abs(box.y-controlBounds[0].y)<2);
  if(sameRow) { const gaps=controlBounds.slice(1).map((box,index)=>box.x-controlBounds[index].x-controlBounds[index].width);expect(Math.max(...gaps)-Math.min(...gaps)).toBeLessThan(2); }
  for(const box of controlBounds)expect(box.height).toBeGreaterThanOrEqual(44);
  const actions = page.locator(".feed-header-actions");
  await expect(actions.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(actions.getByRole("button", { name: /Star/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Brief now/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Explore/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Edit feed settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const toolbar = page.locator(".feed-tools");
  await expect(toolbar.getByPlaceholder("Search briefings")).toBeVisible();
  const empty = page.locator(".feed-empty-state");
  await expect(empty).toContainText("no published briefings");
  await expect(empty.locator(".feed-empty-icon")).toBeVisible();
  const emptyBounds = await empty.boundingBox();
  expect(emptyBounds).not.toBeNull();
  expect(emptyBounds!.y + emptyBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const control of await page.locator(".feed-tools input:visible, .feed-header-actions button:visible").all()) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return { accent: root.getPropertyValue("--accent").trim(), page: root.getPropertyValue("--page").trim(), body: getComputedStyle(document.body).backgroundColor };
  });
  expect(colors.accent).toBe("#5e5ce6");
  expect(colors.page).toBe("#fff");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("published summaries retain original citations and read-only refresh", async ({ page }) => {
  const sourceUrl = "https://example.test/supported-development";
  const summary = "Acme released an updated research model [1].";
  const edition = { id: "published-one", title: "October 11 updates", summary, publishedAt: "2026-10-11T08:00:00Z", sections: [{ title: "Research model", summary, evidence: [{ messageId: "evidence-one", sourceTitle: "Research source", sourceUrl, text: summary, postedAt: "2026-10-11T07:00:00Z", links: [], media: [] }] }] };
  let manualRequests = 0, feedReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("request-summary")) manualRequests++;
    if (path === "/api/feed/admin/personal-briefing") feedReads++;
    const data = path === "/api/auth/session" ? { authenticated: false }
      : path === "/api/feed/admin/personal-briefing" ? { briefing, editions: [edition] }
      : path.endsWith("/editions/published-one") ? { edition } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/admin/personal-briefing/");
  await expect(page.locator(".news-summary")).toContainText("Acme released an updated research model");
  await expect(page.getByRole("button", { name: /brief now/i })).toHaveCount(0);
  await page.locator(".news-summary button").click();
  await expectCopiedSource(page, sourceUrl);
  await expect(page.getByRole("dialog", { name: "Sources" }).locator(".sources-posts a[href]").first()).toHaveAttribute("href", new URL(sourceUrl).origin);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const readsBefore = feedReads;
  await refreshFeed(page);
  await expect.poll(() => feedReads).toBeGreaterThan(readsBefore);
  await expect(page.locator(".news-summary")).toHaveCount(1);
  expect(manualRequests).toBe(0);
  await page.reload();
  await expect(page.locator(".news-summary")).toContainText("Acme released an updated research model");
  await expect(page.locator(".news-summary button")).toHaveCount(1);
});
