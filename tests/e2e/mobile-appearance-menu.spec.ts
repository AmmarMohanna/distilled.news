import {expect, test} from '@playwright/test';

for (const width of [320,390,600]) for (const authenticated of [false,true]) {
  test(`mobile full logo and appearance menu: ${width}px ${authenticated?'account':'guest'}`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.addInitScript(() => {localStorage.setItem('dn_language','en');localStorage.setItem('dn_theme','light');});
    await page.route('**/api/**', route => route.fulfill({json:new URL(route.request().url()).pathname === '/api/auth/session'
      ? {authenticated,account:authenticated?{id:'owner',username:'owner',role:'user'}:undefined} : {feeds:[],briefings:[]}}));
    await page.goto('/');
    const brand = page.locator('.experience-header .distilled-logo');
    await expect(brand.locator('.distilled-logo-wordmark')).toBeVisible();
    const logoBounds = (await brand.boundingBox())!, controls = (await page.locator('.experience-header-actions').boundingBox())!;
    expect(logoBounds.x + logoBounds.width).toBeLessThanOrEqual(controls.x + 1);
    expect(logoBounds.x).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.experience-header > .experience-header-actions > .language-cycle')).toBeHidden();
    const trigger = page.locator('.appearance-menu > summary');
    await expect(page.locator('.appearance-menu')).toHaveCSS('border-top-width','0px');
    await expect(page.locator('.appearance-menu')).toHaveCSS('padding-top','0px');
    await expect(trigger.locator('.appearance-symbol')).toHaveAttribute('data-theme','light');
    if (!authenticated) {
      const icon = (await trigger.boundingBox())!, login = (await page.locator('.experience-header a[href="/login"]').boundingBox())!;
      expect(Math.abs(icon.y + icon.height / 2 - login.y - login.height / 2)).toBeLessThan(1);
    }
    await trigger.click();
    const panel = page.locator('.appearance-menu-panel');
    await expect(panel).toBeVisible();
    const panelBounds = (await panel.boundingBox())!;
    expect(panelBounds.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(width);
    await panel.getByRole('button', {name:'Theme Light'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(trigger.locator('.appearance-symbol')).toHaveAttribute('data-theme','dark');
    for (const next of ['fr','ar','en']) {
      await panel.locator('button').first().click();
      await expect(page.locator('html')).toHaveAttribute('lang',next);
      await expect(brand.locator('.distilled-logo-wordmark')).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.locator('.experience-brand').click();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`.local-reports/mobile-appearance-${width}-${authenticated}.png`});
  });
}
