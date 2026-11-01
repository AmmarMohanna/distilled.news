import {expect, test} from '@playwright/test';

for (const width of [320,390,600,1280]) {
  test(`French landing headline occupies two complete lines at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.addInitScript(() => localStorage.setItem('dn_language','fr'));
    await page.route('**/api/**', route => route.fulfill({json:new URL(route.request().url()).pathname === '/api/auth/session' ? {authenticated:false} : {feeds:[],briefings:[]}}));
    await page.goto('/');
    const heading = page.locator('.landing-introduction h1');
    await expect(heading).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const lines = await heading.locator('span').evaluateAll(nodes => nodes.map(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].map(rect => ({x:rect.x,y:rect.y,right:rect.right}));
    }));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toHaveLength(1);
      expect(line[0].x).toBeGreaterThanOrEqual(0);
      expect(line[0].right).toBeLessThanOrEqual(width);
    }
    expect(lines[1][0].y).toBeGreaterThan(lines[0][0].y);
    await expect(heading).toHaveAccessibleName('Un regard plus serein sur un monde complexe.');
  });
}
