import { test, expect, type Page } from "@playwright/test";

const feed = { id: "lebanon", ownerAccountId: "joud", ownerUsername: "joud", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", publicFeedEnabled: true, paused: false, language: "en", intensity: "medium", briefingCadence: "daily", briefingTimeOfDay: "00:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };
async function mockGuest(page: Page) {
  let authenticated = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login") authenticated = true;
    const body = path === "/api/auth/session" ? { authenticated, setupRequired: false, account: authenticated ? { id: "joud", username: "joud", email: "joud@example.test", role: "user" } : null }
      : path === "/api/explore/feeds" ? { feeds: [feed] }
      : path === "/api/feed/joud/lebanon" ? { briefing: feed, editions: [], viewerHasStarred: false }
      : path === "/api/me/briefings" ? { briefings: [feed] }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
      : {};
    await route.fulfill({ json: body });
  });
}

test("guest landing browses and searches public feeds without a menu", async ({ page }) => {
  await mockGuest(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A calmer perspective on a complex world." })).toBeVisible();
  await expect(page.getByText("Distilling to you what is important.")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Top feeds" })).toBeVisible();
  await expect(page.locator(".ranked-feed")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search feeds" }).fill("nonexistent");
  await expect(page.locator(".ranked-feed")).toHaveCount(0);
  await expect(page.locator(".top-feeds")).toHaveCount(0);
  await page.getByRole("searchbox").fill("joud");
  await expect(page.locator(".ranked-feed")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("searchbox").fill("");
  await page.screenshot({ path: "test-results/landing-" + test.info().project.name + ".png" });
});

test("create feed opens login and signup with outside, inside, and Escape behavior", async ({ page }) => {
  await mockGuest(page);
  await page.goto("/");
  const create = page.getByRole("button", { name: "Create feed", exact: true });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "Login or sign up" });
  await expect(dialog.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await dialog.getByLabel("email", { exact: true }).fill("joud@example.test");
  await expect(dialog).toBeVisible();
  await dialog.locator(".auth-tabs").getByRole("button", { name: "Sign up" }).click();
  await expect(dialog.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await dialog.getByLabel("username", { exact: true }).fill("joud");
  await dialog.getByLabel("password", { exact: true }).fill("example-password");
  const registered = page.waitForRequest(request => request.url().endsWith("/api/auth/register"));
  await dialog.getByRole("button", { name: "create account", exact: true }).click();
  expect((await registered).postDataJSON()).toMatchObject({ username: "joud", email: "joud@example.test" });
  await expect(dialog.getByText(/verification email sent/i)).toBeVisible();
  await page.screenshot({ path: "test-results/auth-popup-" + test.info().project.name + ".png" });
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();
  await create.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("create feed continues to the editor after login", async ({ page }) => {
  await mockGuest(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Login or sign up" });
  await dialog.getByLabel("email", { exact: true }).fill("joud@example.test");
  await dialog.getByLabel("password", { exact: true }).fill("example-password");
  await dialog.getByRole("button", { name: "login", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Add feed" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Login or sign up" })).toHaveCount(0);
  await page.mouse.click(4, 4);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Welcome back, joud" })).toBeVisible();
});

test("language menu closes outside and changes website preferences", async ({ page }) => {
  await mockGuest(page);
  await page.goto("/");
  const menu = page.locator(".language-control");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(menu).not.toHaveAttribute("open", "");
  await menu.locator("summary").click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await menu.locator("summary").click();
  await menu.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رؤية أكثر هدوءًا لعالم معقّد.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
