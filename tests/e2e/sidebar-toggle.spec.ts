import { expect, test } from "@playwright/test";

test("desktop sidebar collapses, expands, and remembers its state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/auth/session"
      ? { authenticated: true, account: { id: "owner", username: "owner", role: "user" } }
      : path === "/api/me/briefings" ? { briefings: [] }
      : path === "/api/explore/feeds" ? { feeds: [] }
      : path === "/api/me/sources" ? { sources: [] } : {};
    return route.fulfill({ json });
  });
  await page.goto("/");
  const sidebar = page.locator(".collapsible-navigation");
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await expect(sidebar.locator(".distilled-logo-wordmark")).toBeHidden();
  await expect(sidebar.locator(".distilled-logo-symbol")).toBeVisible();
  await sidebar.locator(".sidebar-top").hover();
  await sidebar.getByRole("button", { name: "Open sidebar" }).click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await expect(sidebar.locator(".distilled-logo-wordmark")).toBeVisible();
  await expect(sidebar.locator(".distilled-logo-symbol")).toBeHidden();
  await sidebar.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  await page.reload();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await sidebar.getByRole("button", { name: "Close sidebar" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar.locator(".sidebar-top")).toBeHidden();
  await expect(sidebar.getByRole("button", { name: "Home", exact: true }).locator("span")).toBeVisible();
});
