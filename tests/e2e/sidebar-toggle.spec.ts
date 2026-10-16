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
  const logo = await sidebar.locator(".distilled-logo-symbol").boundingBox();
  const toggleIcon = await sidebar.locator(".sidebar-toggle svg").boundingBox();
  const homeIcon = await sidebar.locator(".navigation-item svg").first().boundingBox();
  expect(Math.abs((toggleIcon!.x + toggleIcon!.width / 2) - (homeIcon!.x + homeIcon!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs((toggleIcon!.y + toggleIcon!.height / 2) - (logo!.y + logo!.height / 2))).toBeLessThanOrEqual(1);
  await sidebar.hover();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await page.mouse.move(500, 300);
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await sidebar.hover();
  await sidebar.getByRole("button", { name: "Pin sidebar" }).click();
  await page.mouse.move(500, 300);
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await expect(sidebar.locator(".distilled-logo-wordmark")).toBeVisible();
  await expect(sidebar.locator(".distilled-logo-symbol")).toBeHidden();
  await sidebar.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  await page.reload();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await sidebar.getByRole("button", { name: "Unpin sidebar" }).click();
  await page.mouse.move(500, 300);
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar.locator(".sidebar-top")).toBeHidden();
  await expect(sidebar.getByRole("button", { name: "Home", exact: true }).locator("span")).toBeVisible();
});
