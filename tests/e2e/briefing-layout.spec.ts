import { expect, test } from "@playwright/test";
import { refreshFeed } from "./helpers";

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
  await expect(page.getByRole("link", {name:"Back"})).toBeVisible();
  await expect(page.locator(".feed-check-status")).toContainText("feed paused");
  const artwork=page.locator('.feed-hero-art .topic-art');
  const displayed=await artwork.boundingBox();
  const reserved=await page.locator('.feed-hero-art').boundingBox();
  const header=await page.locator('.experience-header').boundingBox();
  expect(displayed!.height).toBeGreaterThanOrEqual(80);
  expect(displayed!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(displayed!.y).toBeGreaterThanOrEqual(reserved!.y);
  expect(displayed!.y+displayed!.height).toBeLessThanOrEqual(reserved!.y+reserved!.height+1);
  const titleBounds=await page.locator('.page-heading h1').boundingBox();
  const authorBounds=await page.locator('.page-heading > p').boundingBox();
  const emptyBounds=await page.locator('.briefings-empty').boundingBox();
  const actions = page.locator(".page-heading .feed-header-actions");
  const actionBounds=await actions.boundingBox();
  expect(authorBounds!.y-titleBounds!.y-titleBounds!.height).toBeLessThanOrEqual(8);
  expect(actionBounds!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  expect(actionBounds!.y).toBeGreaterThanOrEqual(authorBounds!.y+authorBounds!.height-1);
  expect(emptyBounds!.y-actionBounds!.y-actionBounds!.height).toBeGreaterThanOrEqual(0);
  await actions.getByLabel("Feed options").click();
  await expect(actions.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Search briefings" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(actions.getByRole("button", { name: /Star/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Brief now/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Explore/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Edit feed settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const toolbar = page.locator(".feed-tools");
  await expect(toolbar.getByPlaceholder("Search briefings")).toHaveCount(0);
  await expect(page.locator(".feed-empty-state")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No published briefings yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore feeds" })).toHaveAttribute("href", "/explore");
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

test("published headlines open retained briefing evidence and preserve read-only refresh", async ({ page }) => {
  const sourceUrl = "https://example.test/supported-development";
  const summary = "Acme released an updated research model. ".repeat(18) + "The full briefing ends here [1].";
  const edition = { id: "published-one", title: "October 11 updates", summary, publishedAt: "2026-10-11T08:00:00Z", sections: [{ title: "Research model", summary, evidence: [{ messageId: "evidence-one", sourceTitle: "Research source", sourceUrl, text: summary, postedAt: "2026-10-11T07:00:00Z", links: [], media: [] }] }] };
  let manualRequests = 0, feedReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("request-summary")) manualRequests++;
    if (path === "/api/feed/admin/personal-briefing") feedReads++;
    const data = path === "/api/auth/session" ? { authenticated: false }
      : path === "/api/feed/admin/personal-briefing" ? { briefing, editions: [edition] }
      : path.endsWith("/editions/published-one") ? { briefing, edition } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/admin/personal-briefing/");
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  const row = page.locator('.news-item').first();
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) await row.hover();
  const rowTop = (await row.boundingBox())!.y;
  const timeTop = (await row.locator('.news-head time').boundingBox())!.y;
  expect(timeTop - rowTop).toBeGreaterThanOrEqual(12);
  await expect(page.locator(".news-summary:visible")).toHaveCount(0);
  await expect(page.locator(".news-sources")).toHaveCount(0);
  await expect(page.locator(".news-headline .briefing-reference > bdi")).toHaveText("[1]");
  await expect(page.getByRole("button", { name: /brief now/i })).toHaveCount(0);
  await expect(page.locator(".news-headline .briefing-reference")).toHaveAttribute("href", sourceUrl);
  await expect(page.locator('.briefing-read-more')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const readsBefore = feedReads;
  await refreshFeed(page);
  await expect.poll(() => feedReads).toBeGreaterThan(readsBefore);
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  expect(manualRequests).toBe(0);
  await page.reload();
  await expect(page.locator(".news-headline .briefing-headline-link")).toHaveText("Research model");
  await expect(page.locator(".news-summary:visible")).toHaveCount(0);
  const login = page.locator('.experience-header a[href="/login"]');
  await expect(login).toBeVisible();
  const feedLogin = (await login.boundingBox())!;
  const backLabel = page.locator(".experience-header .feed-nav-back > span");
  const feedBackLabel = await backLabel.boundingBox();
  await page.locator(".briefing-headline-link").click();
  await expect(login).toBeVisible();
  const detailLogin = (await login.boundingBox())!;
  expect(await backLabel.boundingBox()).toEqual(feedBackLabel);
  expect(detailLogin.x + detailLogin.width).toBeCloseTo(feedLogin.x + feedLogin.width, 0);
  expect(detailLogin.y + detailLogin.height / 2).toBeCloseTo(feedLogin.y + feedLogin.height / 2, 0);
  const menu = page.locator('.briefing-detail-feed-row .feed-more > summary');
  await expect(menu).toHaveCSS('border-radius', '50%');
  await expect(page.locator('.briefing-detail-art > .topic-art')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const titleBounds = (await page.locator('.briefing-detail-feed-row .briefing-parent-feed').boundingBox())!;
  const menuBounds = (await menu.boundingBox())!;
  expect(menuBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width);
  expect(menuBounds.y + menuBounds.height / 2).toBeCloseTo(titleBounds.y + titleBounds.height / 2, 0);
  await menu.click();
  await expect(page.locator('.briefing-detail-menu .feed-options-popover')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await menu.press('Escape');
  await page.evaluate(() => document.documentElement.lang = 'ar');
  await expect(page.locator('.briefing-detail-hero h1')).toHaveCSS('direction', 'ltr');
  await expect(page.locator('.briefing-detail-body .news-summary')).toHaveCSS('direction', 'ltr');
  await page.evaluate(() => document.documentElement.lang = 'en');
  const body = page.locator(".briefing-detail-body .news-summary");
  await expect(body).toContainText("The full briefing ends here");
  await expect(body).toHaveCSS("overflow", "visible");
  await page.locator(".briefing-detail-body .briefing-reference").first().click();
  const source = page.getByRole("dialog", { name: "Source preview" });
  await expect(source).toContainText("The full briefing ends here");
  await expect(source.getByRole("link", { name: "Read full article" })).toHaveAttribute("href", sourceUrl);
});

for (const language of ["en", "fr", "ar"] as const) test(`briefing photos and menu follow ${language} layout`, async ({ page }) => {
  const edition = { id: "latest", title: "A published headline", summary: "Published briefing text.",
    publishedAt: "2026-10-11T08:00:00Z", sections: [] };
  const photoUrl = "https://example.test/briefing-photo.svg";
  const secondPhotoUrl = "https://example.test/second-briefing-photo.svg";
  let photoRequests = 0;
  await page.route("https://example.test/*briefing-photo.svg", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="blue"/></svg>',
  }));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("photo")) {
      photoRequests++;
      return route.fulfill({ json: { photos: [{ url: photoUrl, source: "Example" }, { url: secondPhotoUrl, source: "Second publisher" }] } });
    }
    if (url.pathname.endsWith("/sketch")) return route.fulfill({ status: 404 });
    return route.fulfill({ json: url.pathname === "/api/auth/session"
      ? { authenticated: false } : { briefing: { ...briefing, language }, editions: [edition], edition, viewerHasStarred: false } });
  });
  await page.goto("/admin/personal-briefing/");
  const headline = page.getByRole("link", { name: edition.title, exact: true });
  await expect(headline).toBeVisible();
  expect(photoRequests).toBe(0);
  await headline.click();
  await expect(page.locator(".briefing-detail-photo img")).toBeVisible();
  const menu = (await page.locator(".briefing-detail-menu summary").boundingBox())!;
  const photo = (await page.locator(".briefing-detail-photo").boundingBox())!;
  if (language === "ar") expect(menu.x).toBeCloseTo(photo.x, 0);
  else expect(menu.x + menu.width).toBeCloseTo(photo.x + photo.width, 0);
  await expect(page.locator(".briefing-detail-photo img")).toHaveAttribute("src", photoUrl);
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
    await page.locator(".briefing-photo-viewport").hover();
  }
  const next = page.getByRole("button", { name: "Next image" });
  const viewport = page.locator(".briefing-photo-viewport");
  const bounds = (await viewport.boundingBox())!;
  const nextBounds = (await next.boundingBox())!;
  const rtl = await viewport.evaluate(node => getComputedStyle(node).direction === "rtl");
  expect(nextBounds.x + nextBounds.width / 2).toBeCloseTo(rtl ? bounds.x : bounds.x + bounds.width, 0);
  await next.click();
  await expect(page.locator(".briefing-detail-photo img")).toHaveAttribute("src", secondPhotoUrl);
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) await viewport.hover();
  await page.getByRole("button", { name: "Previous image" }).click();
  await expect(page.locator(".briefing-detail-photo img")).toHaveAttribute("src", photoUrl);
  expect(photoRequests).toBe(1);
});
