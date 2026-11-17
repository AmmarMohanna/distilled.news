import { expect, test } from "@playwright/test";

for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 593 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`profile controls stay reachable at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true, account: { id: "owner", username: "owner", email: "owner@example.com", role: "user" } } });
      if (path === "/api/me/briefings") return route.fulfill({ json: { briefings: [] } });
      if (path === "/api/explore/feeds") return route.fulfill({ json: { feeds: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Account profile" }).click();
    const dialog = page.locator(".profile-dialog");
    await expect(dialog.getByRole("button", { name: "Log out" })).toBeVisible();
    const result = await dialog.evaluate(node => ({
      viewportHeight: node.querySelector(".screen-page-viewport")!.clientHeight,
      scrollHeight: node.querySelector(".screen-page-viewport")!.scrollHeight,
      height: node.getBoundingClientRect().height
    }));
    // The integrated card design scrolls on short phones; controls must remain reachable.
    await dialog.getByRole("button", { name: "Log out" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Log out" })).toBeInViewport();
    expect(result.height).toBeLessThanOrEqual(size.height);
  });
}


test('server logout failure leaves the account dialog retryable', async ({page}) => {
  let attempts=0;
  await page.route('**/api/**', route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,account:{id:'owner',username:'owner',email:'owner@example.invalid',role:'user'}}});
    if(path==='/api/me/briefings')return route.fulfill({json:{briefings:[]}});
    if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[],nextOffset:null}});
    if(path==='/api/auth/logout') {attempts++;return attempts===1?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Account profile'}).click();
  const button=page.locator('.profile-dialog').getByRole('button',{name:'Log out',exact:true});
  await button.click();await expect(page.locator('.profile-dialog .error')).toContainText('Could not complete the request');
  await expect(button).toBeEnabled();await button.click();
  await expect(page.locator('.profile-dialog')).toHaveCount(0);expect(attempts).toBe(2);
});
