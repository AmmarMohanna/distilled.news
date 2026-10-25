import { expect, test } from "@playwright/test";
import {cycleLanguage} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: false, turnstileSiteKey: "test" } });
    if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: [] } });
    return route.fulfill({ json: {} });
  });
});

for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 593 }, { width: 390, height: 664 }, { width: 390, height: 568 }, { width: 320, height: 568 }]) {
  test(`landing header stays fixed across languages at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator(".guest-landing .experience-header .experience-brand")).toBeVisible();
    const positions = async () => page.evaluate(() => Object.fromEntries(
      [".experience-brand", ".language-cycle", ".theme-toggle", ".experience-header-actions .button-link"].map(selector => {
        const { x, y, width, height } = document.querySelector(`.guest-landing .experience-header ${selector}`)!.getBoundingClientRect();
        return [selector, { x, y, width, height }];
      })
    ));
    const initial = await positions();
    for (const language of ["fr", "ar", "en"]) {
      await cycleLanguage(page);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator(".language-cycle")).not.toHaveCSS("transform", /matrix/);
      expect(await positions()).toEqual(initial);
    }
  });

  test(`create account fits without scrolling at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByRole("button", { name: "Create feed", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Continue with Email" })).toBeVisible();
    await expect(page.locator(".auth-dialog .auth-input")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await page.locator(".auth-dialog .screen-page-viewport").evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await page.locator(".auth-choice button").click();
    await expect(page.getByRole("heading", { name: "Create your Account" })).toBeVisible();
    const dialog = page.locator(".auth-dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    expect(await dialog.locator(".screen-page-viewport").evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    expect(await dialog.locator(".login").evaluate(node => parseFloat(getComputedStyle(node).gap))).toBeGreaterThanOrEqual(10);
    await expect(dialog.locator(".auth-tabs")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    expect(await dialog.locator(".screen-page-viewport").evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  });
}

for (const language of ["fr", "ar"]) {
  test(`create account fits without scrolling in ${language} on a short phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 568 });
    await page.addInitScript(value => localStorage.setItem("dn_language", value), language);
    await page.goto("/");
    await page.locator(".experience-header").waitFor();
    await page.locator(".landing-create").click();
    await page.locator(".auth-choice button").click();
    const viewport = page.locator(".auth-dialog .screen-page-viewport");
    await expect(page.locator(".auth-dialog .auth-tabs")).toHaveCount(0);
    expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  });
}
