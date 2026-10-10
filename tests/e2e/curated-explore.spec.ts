import { expect, test, type Page } from "@playwright/test";

const feed = { id: "quiet", ownerAccountId: "admin", ownerUsername: "admin", slug: "quiet", title: "Quiet science", stars: 0, interestProfile: "Science", publicFeedEnabled: true, paused: false, language: "en", briefingCadence: "daily", briefingTimezone: "UTC", retentionDays: 15 };
const starredFeed = { ...feed, id: "starred", slug: "starred", title: "World news", stars: 99 };

async function mock(page: Page, role: "admin" | "user" | "guest" = "admin", initialSelection: string[] = []) {
  let selected = [...initialSelection];
  const allFeeds = [feed, starredFeed];
  const requests: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const publishing = path.match(/^\/api\/admin\/briefings\/([^/]+)\/explore$/);
    if (publishing) {
      const { featured } = route.request().postDataJSON();
      selected = selected.filter(id => id !== publishing[1]);
      if (featured) selected.unshift(publishing[1]);
    }
    const body = path === "/api/auth/session" ? { authenticated: role !== "guest", setupRequired: false, account: role === "guest" ? null : { id: role, username: role, email: `${role}@example.test`, role } }
      : path === "/api/me/briefings" ? { briefings: role === "admin" ? allFeeds : [{ ...feed, ownerAccountId: "user", ownerUsername: "user", title: "My user feed" }] }
      : path === "/api/explore/feeds" ? { feeds: selected.map(id => allFeeds.find(item => item.id === id)) }
      : path.startsWith("/api/feed/") ? { briefing: path.includes("/quiet") ? feed : starredFeed, editions: [], viewerHasStarred: false }
      : path === "/api/admin/accounts" ? { accounts: [] }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
      : publishing ? { featured: selected.includes(publishing[1]) } : {};
    await route.fulfill({ json: body });
  });
  return requests;
}

test("admin Explore preserves the configured editorial order without unavailable publishing controls", async ({ page }) => {
  const requests = await mock(page, "admin", ["quiet", "starred"]);
  await page.goto("/");
  const card = page.locator(".personal-feed-grid .topic-card").filter({ hasText: "World news" });
  await card.locator("summary").click();
  await expect(card.getByRole("button", { name: "Publish to Explore", exact: true })).toHaveCount(0);
  await card.locator("summary").press("Escape");
  await page.getByRole("navigation").getByRole("button", { name: "Explore", exact: true }).click();
  const cards = page.locator(".curated-feed-grid .topic-card");
  await expect(cards.locator(".topic-name")).toHaveText(["Quiet science", "World news"]);
  await expect(page.getByRole("button", { name: "Star Quiet science", exact: true })).toHaveText("0");
  expect(requests.filter(path => /\/api\/admin\/briefings\/[^/]+\/explore$/.test(path))).toEqual([]);
});

test("an empty guest Explore has no placeholder feeds or trending claims", async ({ page }) => {
  const requests = await mock(page, "guest");
  await page.goto("/explore");
  await expect(page.getByText("No feeds have been published to Explore yet.")).toHaveCount(0);
  await expect(page.locator(".topic-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Popular topics" })).toHaveCount(0);
  expect(requests).not.toContain("/api/explore/popular");
});

test("users see curated admin feeds and cannot publish their own to Explore", async ({ page }) => {
  await mock(page, "user", ["quiet"]);
  await page.goto("/");
  await page.locator(".personal-feed-grid summary").click();
  await expect(page.getByRole("button", { name: "Publish to Explore", exact: true })).toHaveCount(0);
  await page.locator(".personal-feed-grid summary").press("Escape");
  await page.getByRole("navigation").getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.locator(".curated-feed-grid .topic-name")).toHaveText(["Quiet science"]);
  await expect(page.locator(".curated-feed-grid")).not.toContainText("My user feed");
});
