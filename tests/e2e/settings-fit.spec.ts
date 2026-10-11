import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, account: { id: "owner", username: "owner", role: "user" } } });
    if (path === "/api/me/briefings") return route.fulfill({ json: { briefings: [] } });
    if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: [] } });
    return route.fulfill({ json: {} });
  });
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 320, height: 568 },
  { width: 667, height: 375 }
]) {
  test(`settings fit ${size.width}x${size.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const result = await page.evaluate(() => {
      const viewport = document.querySelector(".app-pages > .screen-page-viewport")!;
      const settings = document.querySelector(".settings-view")!.getBoundingClientRect();
      const navigation = document.querySelector(".bottom-navigation")!.getBoundingClientRect();
      return { scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight, settingsBottom: settings.bottom, navigationTop: navigation.top };
    });
    expect(result.scrollHeight).toBeLessThanOrEqual(result.clientHeight + 1);
    if (size.width < 900) expect(result.settingsBottom).toBeLessThanOrEqual(result.navigationTop);
    expect(await page.locator(".setting-row").first().evaluate(node => getComputedStyle(node).fontSize)).toBe("16px");
  });
}

for (const language of ["fr", "ar"]) for (const size of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`settings fit ${size.width}x${size.height} in ${language}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(value => localStorage.setItem("dn_language", value), language);
    await page.goto("/");
    await page.locator(".bottom-navigation .navigation-settings").click();
    const viewport = page.locator(".app-pages > .screen-page-viewport");
    expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    const navigation = await page.locator(".bottom-navigation").boundingBox();
    const settings = await page.locator(".settings-view").boundingBox();
    expect(settings!.y + settings!.height).toBeLessThanOrEqual(navigation!.y);
  });
}

for (const size of [{ width: 1280, height: 637 }, { width: 1280, height: 593 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`admin settings fit ${size.width}x${size.height} while account management is closed`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.unroute("**/api/**");
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, account: { id: "owner", username: "owner", role: "admin" } } });
      if (path === "/api/me/briefings") return route.fulfill({ json: { briefings: [] } });
      if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: [] } });
      if (path === "/api/admin/accounts") return route.fulfill({ json: { accounts: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto("/");
    await page.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
    await expect(page.locator(".accounts-section")).toBeVisible();
    const viewport = page.locator(".app-pages > .screen-page-viewport");
    expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    const corners = await page.evaluate(() => ({
      group: getComputedStyle(document.querySelector(".settings-account-group")!).borderTopLeftRadius,
      management: getComputedStyle(document.querySelector(".accounts-section")!).borderTopLeftRadius
    }));
    expect(corners.management).toBe(corners.group);
    if (size.width === 1280) {
      const gaps = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        return [
          box(".settings-account-label").top - box(".settings-view .experience-title").bottom,
          box(".settings-app-label").top - box(".settings-account-group").bottom,
          box(".accounts-section").top - box(".settings-app-group").bottom
        ];
      });
      for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1);
    }
    const navigation = await page.locator(".bottom-navigation").boundingBox();
    const settings = await page.locator(".settings-view").boundingBox();
    if (size.width < 900) expect(settings!.y + settings!.height).toBeLessThanOrEqual(navigation!.y);
  });
}
