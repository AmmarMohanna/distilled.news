import { expect, type Page } from "@playwright/test";

/** Public feeds refresh on focus, preserving reader state. */
export async function refreshFeed(page: Page) {
  // The integrated UI refreshes public reads on focus, including for guests.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

export async function openEditSettings(page: Page) {
  await page.getByRole("button", { name: "Edit feed settings", exact: true }).click();
}

/** Use the actual Settings controls when compact headers hide their shortcuts. */
async function inSettings(page: Page, action: () => Promise<void>) {
  const url = page.url();
  const navigation = page.locator('.bottom-navigation .navigation-item');
  const previous = await navigation.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-current') === 'page'));
  // Feed pages keep mobile account preferences on Home, reached through Back.
  if (!await page.locator('.bottom-navigation .navigation-settings').isVisible()) await page.locator('.feed-nav-back').click();
  await page.locator('.bottom-navigation .navigation-settings').click();
  await action();
  if (previous >= 0 && previous !== 2) await navigation.nth(previous).click();
  else if (previous < 0) await page.goto(url);
}

export async function cycleLanguage(page: Page) {
  await page.locator(".experience-header").first().waitFor();
  const button = page.locator('.language-cycle');
  if (await button.isVisible()) { await button.click(); return; }
  const language = await page.locator('html').getAttribute('lang') ?? 'en';
  const order = ['en', 'fr', 'ar'];
  const next = order[(order.indexOf(language) + 1) % order.length];
  await inSettings(page, () => page.locator('.setting-language button[lang="' + next + '"]').click());
}

export async function toggleTheme(page: Page) {
  await page.locator(".experience-header").first().waitFor();
  const button = page.locator('.theme-toggle');
  if (await button.isVisible()) { await button.click(); return; }
  await inSettings(page, () => page.locator('.settings-preferences-group > button[role="switch"]').click());
}

/** Source URLs are exposed by Copy link; website actions retain the article's outbound links. */
export async function expectCopiedSource(page: Page, sourceUrl: string) {
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {writeText: async (text: string) => { (window as Window & {copiedSource?: string}).copiedSource = text; }}
  }));
  await page.getByRole('dialog', {name:'Sources'}).getByRole('button', {name:'Copy link',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as Window & {copiedSource?: string}).copiedSource)).toBe(sourceUrl);
}
