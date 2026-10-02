import { expect, test } from "@playwright/test";
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
   : path === "/api/me/sources/recommend" ? { sources: ["NASA", "Space exploration"] } : {};
  return route.fulfill({ json: body });
 });
}
test("cards expose owner edit and stars; speech controls are icons and sources selectable", async ({ page }) => {
 await mock(page); await page.goto("/");
 await expect(page.locator(".personal-feed-grid").getByRole("link", { name: "Edit feed settings" })).toBeVisible();
 await expect(page.locator(".personal-feed-grid").getByRole("button", { name: "Star", exact: true })).toBeVisible();
 await expect(page.getByText("View briefing", { exact: true })).toHaveCount(0);
 await page.getByRole("button", { name: "Create feed", exact: true }).click();
 const dialog = page.getByRole("dialog", { name: "Add feed" });
 await dialog.getByLabel("Feed name", { exact: true }).fill("Space");
 await dialog.getByLabel("What would you like to follow?", { exact: true }).fill("Space exploration");
 await expect(dialog.getByText("Your browser may process speech online.")).toHaveCount(0);
 await expect(dialog.locator(".voice-input button").first()).toHaveText("");
 await dialog.getByRole("button", { name: "Recommend sources with AI" }).click();
 await dialog.getByRole("checkbox", { name: "NASA" }).check();
 await expect(dialog.getByLabel("Sources", { exact: true })).toHaveValue("NASA");
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
 await page.getByRole("button", { name: /^Website language:/ }).click();
 await page.getByRole("button", { name: /^Website language:/ }).click();
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
