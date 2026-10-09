import { expect, test, type Page } from "@playwright/test";

const admin = { id: "admin", username: "admin", email: "admin@example.test", role: "admin", createdAt: "2026-01-12T12:00:00Z", emailVerifiedAt: "2026-10-01T12:00:00Z", briefingCount: 1 };
const reader = { id: "reader", username: "reader", email: "reader@example.test", role: "user", createdAt: "2026-05-12T12:00:00Z", briefingCount: 0, disabledAt: undefined as string | undefined };
const feed = { id: "lebanon", ownerAccountId: "admin", ownerUsername: "admin", slug: "lebanon", title: "Lebanon", stars: 3, interestProfile: "Lebanon news", styleInstruction: "Calm", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "Asia/Beirut", retentionDays: 15 };

async function mock(page: Page) {
  let account = { ...admin };
  let managedReader = { ...reader };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/me/account" && method !== "GET") account = { ...account, ...route.request().postDataJSON() };
    if (path === "/api/admin/accounts/reader" && method !== "GET") {
      const input = route.request().postDataJSON();
      managedReader = { ...managedReader, disabledAt: input.disabled ? "2026-10-03T12:00:00Z" : undefined };
    }
    const body = path === "/api/auth/session" ? { authenticated: true, setupRequired: false, account }
      : path === "/api/me/account" ? { account, briefings: [feed] }
      : path === "/api/admin/accounts" || path === "/api/admin/accounts/reader" ? { accounts: [account, managedReader] }
      : path === "/api/admin/briefings" || path === "/api/me/briefings" ? { briefings: [feed], briefing: feed }
      : path === "/api/explore/feeds" || path === "/api/explore/popular" ? { feeds: [feed] }
      : path === "/api/me/sources/recommend" ? { sources: ["https://x.com/mtvlebanon", "https://t.me/mtvlebanon", "https://www.mtv.com.lb"] }
      : path === "/api/me/feeds" ? { briefing: feed }
      : path.startsWith("/api/feed/") ? { briefing: feed, editions: [], viewerHasStarred: false }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } } : {};
    await route.fulfill({ json: body });
  });
}

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "chromium") await page.setViewportSize({ width: 1600, height: 1100 });
});

test("add feed selects, removes, and submits real source inputs", async ({ page }) => {
  await mock(page); await page.goto("/");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add feed" });
  await expect(dialog.locator(".selected-sources")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add source", exact: true })).toHaveCount(0);
  await dialog.getByLabel("Feed name", { exact: true }).fill("Lebanon news");
  await dialog.getByLabel("What would you like to follow?", { exact: true }).fill("Lebanon and politics");
  await dialog.getByRole("button", { name: "Recommend sources with AI" }).click();
  await dialog.locator(".source-search-results button").filter({ hasText: "x.com/mtvlebanon" }).click();
  await dialog.getByLabel("Sources", { exact: true }).fill("https://t.me/mtvlebanon");
  await dialog.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(dialog.locator(".selected-source-row")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Remove source: https://t.me/mtvlebanon", exact: true }).click();
  await dialog.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(dialog.getByLabel("Update rhythm")).toBeVisible();
  await dialog.getByRole("button", { name: "Preferences", exact: true }).click();
  await dialog.locator('.screen-page-viewport').evaluate(node => { node.scrollTop = 0; });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `test-results/reference-add-feed-${test.info().project.name}.png` });
  const saved = page.waitForRequest(request => request.url().endsWith("/api/me/feeds") && request.method() === "POST");
  await dialog.getByRole("button", { name: "Create feed", exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({ title: "Lebanon news", publicFeedEnabled: true, sourceInputs: ["https://x.com/mtvlebanon"] });
});

test("profile edits username and expands password controls", async ({ page }) => {
  await mock(page); await page.goto("/");
  await page.getByRole("button", { name: "Account profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "account", exact: true });
  await expect(dialog.locator(".profile-avatar")).toHaveText("A");
  await expect(dialog.getByLabel("username", { exact: true })).toHaveAttribute("readonly", "");
  await page.screenshot({ path: `test-results/reference-profile-${test.info().project.name}.png` });
  await dialog.getByRole("button", { name: "Edit username", exact: true }).click();
  await dialog.getByLabel("username", { exact: true }).fill("new-admin");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.locator(".profile-avatar")).toHaveText("NA");
  await dialog.getByRole("button", { name: "Change Password", exact: true }).click();
  await expect(dialog.getByLabel("Current Password", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("New Password", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("user management filters users and manages the selected account", async ({ page }) => {
  await mock(page); await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".accounts-summary").click();
  await expect(page.getByRole("heading", { name: "User Management", exact: true })).toBeVisible();
  await expect(page.locator(".users-table tbody tr")).toHaveCount(2);
  const roleSelect = await page.getByLabel("Filter users by role").boundingBox();
  const roleArrow = await page.locator(".users-role-filter > svg").boundingBox();
  expect(Math.round(roleSelect!.x + roleSelect!.width - roleArrow!.x - roleArrow!.width)).toBe(18);
  await page.getByLabel("Filter users by role").selectOption("user");
  await expect(page.locator(".users-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Filter users by role").selectOption("all");
  await page.getByLabel("Search users", { exact: true }).fill("reader");
  await expect(page.locator(".users-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Search users", { exact: true }).fill("");
  await page.getByRole("button", { name: "manage reader", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "manage account" });
  await expect(panel.getByRole("heading", { name: "reader", exact: true })).toBeVisible();
  await expect(page.locator(".user-manage-button")).toHaveCount(0);
  await panel.locator(".managed-user-settings summary").click();
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(panel.getByRole("radio", { name: "User", exact: true })).toBeChecked();
  await expect(panel.getByText("Delete account", { exact: true })).toHaveCount(0);
  await expect(panel.locator('.managed-user-stats')).toContainText('May 12, 2026');
  await page.screenshot({ path: `test-results/reference-users-${test.info().project.name}.png` });
  await panel.getByRole("button", { name: "Suspend Account", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Enable Account", exact: true })).toBeVisible();
  await expect(page.locator(".users-table tbody tr").filter({ hasText: "reader" })).toContainText("Suspended");
  await page.getByRole("button", { name: "View admin", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "admin", exact: true })).toBeVisible();
  await expect(page.locator(".managed-user-panel")).toHaveCount(1);
  await panel.locator(".managed-user-feeds > summary").click();
  await expect(panel.getByRole("link", { name: "Open Lebanon in new tab" })).toHaveAttribute("target", "_blank");
  await panel.locator(".feed-options summary").click();
  await expect(panel.getByRole("button", { name: "Pause feed", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Delete feed", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "close account management" }).click();
  await expect(page.locator(".user-manage-button")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("settings use contact links and honest installation popups", async ({ page }) => {
  await mock(page); await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Install App (PWA)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Privacy", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Help & Support", exact: true }).click();
  const support = page.getByRole("dialog", { name: "Help & Support" });
  await expect(support.getByRole("link", { name: "distillednews.platform@gmail.com" })).toHaveAttribute("href", "mailto:distillednews.platform@gmail.com");
  await expect(support.getByRole("link", { name: "distilled.news@outlook.com" })).toHaveAttribute("href", "mailto:distilled.news@outlook.com");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => { (window as Window & { __testInstallRequested?: boolean }).__testInstallRequested = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { __testInstallRequested?: boolean }).__testInstallRequested)).toBe(true);
  const installation = page.getByRole("dialog", { name: "Install App (PWA)" });
  await expect(installation.getByRole("status")).toHaveText("Installing…");
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(installation.getByRole("status")).toHaveText("Installation completed. Check your apps.");
  await expect(installation.locator(".install-status-icon.success")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  await expect(installation.getByRole("status")).toHaveText("Already installed");
});

test("notifications switch saves subscription and turns it off", async ({ page }) => {
  await page.addInitScript(() => {
    let subscription: object | null = null;
    const worker = { pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => subscription = {
        endpoint: "https://push.example.test/subscription",
        toJSON: () => ({ endpoint: "https://push.example.test/subscription", keys: { p256dh: "test", auth: "test" } }),
        unsubscribe: async () => { subscription = null; return true; }
      }
    } };
    Object.defineProperty(navigator, "serviceWorker", { value: { register: async () => worker, ready: Promise.resolve(worker) } });
    Object.defineProperty(window, "Notification", { value: { permission: "granted", requestPermission: async () => "granted" } });
    Object.defineProperty(window, "PushManager", { value: function () {} });
  });
  await mock(page);
  const writes: string[] = [];
  await page.route("**/api/me/push", async route => {
    writes.push(route.request().method());
    await route.fulfill({ json: route.request().method() === "GET" ? { publicKey: "dGVzdA" } : { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  const notificationSwitch = page.getByRole("switch", { name: "Notifications" });
  await expect(notificationSwitch).not.toBeChecked();
  const track = notificationSwitch.locator(".notification-switch");
  const trackBounds = await track.boundingBox();
  const offThumb = await track.locator("span").boundingBox();
  expect(Math.round(offThumb!.x - trackBounds!.x)).toBe(3);
  await notificationSwitch.click();
  await expect(notificationSwitch).toBeChecked();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);
  await expect.poll(() => track.evaluate(node => {
    const track = node.getBoundingClientRect();
    const thumb = node.querySelector("span")!.getBoundingClientRect();
    return Math.round(track.right - thumb.right);
  })).toBe(3);
  await notificationSwitch.click();
  await expect(notificationSwitch).not.toBeChecked();
  expect(writes).toEqual(["GET", "POST", "DELETE"]);
});

test("installed app detection works from a browser tab", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", { value: async () => [{ platform: "webapp", url: location.origin + "/manifest.webmanifest", id: location.origin + "/" }] });
  });
  await mock(page); await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Install App (PWA)" });
  await expect(dialog.getByRole("status")).toHaveText("Already installed");
  await expect(dialog.locator(".install-status-icon.success svg")).toBeVisible();
});

test("Edge users can confirm an existing installation when detection is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", { value: async () => [] });
  });
  await mock(page); await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Install App (PWA)" });
  await expect(dialog.getByRole("button", { name: "Already installed on this device" })).toBeVisible();
  await dialog.getByRole("button", { name: "Already installed on this device" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Already installed");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Already installed");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Install App (PWA)", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Install App (PWA)" }).getByRole("status")).toHaveText("Already installed");
});

test("dark controls have no inset frames and support has one surface", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dn_theme", "dark"));
  await mock(page); await page.goto("/");
  await page.getByRole("button", { name: "Account profile", exact: true }).click();
  const profile = page.getByRole("dialog", { name: "account", exact: true });
  await expect(profile.locator(".profile-username-field input")).toHaveCSS("box-shadow", "none");
  await expect(profile.locator(".profile-edit-button")).toHaveCSS("box-shadow", "none");
  await profile.getByRole("button", { name: "Edit username", exact: true }).click();
  await expect(profile.locator(".profile-username-field")).toHaveCSS("outline-width", "2px");
  await page.screenshot({ path: `test-results/refined-dark-profile-${test.info().project.name}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  await expect(page.locator(".source-recommend-button")).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Escape");
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Help & Support", exact: true }).click();
  await expect(page.locator(".support-dialog .dialog-inner")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".support-dialog .dialog-inner > p").first()).toHaveCSS("color", "rgb(94, 92, 230)");
  await page.screenshot({ path: `test-results/refined-dark-support-${test.info().project.name}.png` });
  await page.keyboard.press("Escape");
  await page.locator(".accounts-summary").click();
  await expect(page.locator(".accounts-section")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".users-table th button")).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".user-name-button").first()).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".user-manage-button").first()).toHaveCSS("box-shadow", "none");
  await page.getByRole("button", { name: "View admin", exact: true }).click();
  await page.locator(".managed-user-settings > summary").click();
  await expect(page.getByRole("radio").first()).toHaveCSS("box-shadow", "none");
  await page.locator(".managed-user-feeds > summary").click();
  await page.locator(".admin-feed-row .feed-options > summary").click();
  const actions = page.locator(".admin-feed-actions button");
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveText("");
  await expect(actions.last()).toHaveText("");
  await expect(actions.last()).toHaveCSS("color", "rgb(229, 72, 77)");
  await page.screenshot({ path: `test-results/refined-dark-users-${test.info().project.name}.png` });
});

test("dark authentication has one surface and capitalized action labels", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dn_theme", "dark"));
  await mock(page);
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: false, setupRequired: false } }));
  await page.goto("/login");
  const dialog = page.getByRole("dialog", { name: "Login or sign up" });
  await expect(dialog.locator(".screen-page-viewport")).toHaveCSS("scrollbar-gutter", "auto");
  await expect(dialog.locator(".auth-modal-content")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(dialog.locator(".login")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(dialog.locator(".auth-submit")).toHaveText("Login");
  await dialog.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Create your Account", exact: true })).toBeVisible();
  await expect(dialog.locator(".auth-submit")).toHaveText("Create Account");
  await dialog.locator(".auth-tabs").getByRole("button", { name: "Login", exact: true }).click();
  await dialog.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Reset Password", exact: true })).toBeVisible();
  await expect(dialog.locator(".auth-submit")).toHaveText("Send Reset Link");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: `test-results/refined-dark-auth-${test.info().project.name}.png` });
});
