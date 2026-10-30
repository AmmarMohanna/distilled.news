import { expect, type Locator, type Page } from "@playwright/test";

/** Operate the approved button/listbox control and verify its selected state. */
export async function chooseSetting(scope: Locator, label: string, optionName: string) {
  const trigger = scope.getByRole('button', {name: new RegExp('^' + label + ' ')});
  await trigger.click();
  const menu = scope.getByRole('listbox', {name: label, exact: true});
  await expect(menu).toBeInViewport({ratio:1});
  await expect.poll(()=>menu.evaluate(node=>{
    const bounds=node.getBoundingClientRect(),viewport=window.visualViewport;
    const left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0;
    return bounds.left>=left && bounds.top>=top && bounds.right<=left+(viewport?.width??innerWidth) && bounds.bottom<=top+(viewport?.height??innerHeight);
  })).toBe(true);
  const option = menu.getByRole('option', {name: optionName, exact: true});
  await option.click({trial:true});
  await option.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toContainText(optionName);
  await trigger.press('ArrowDown');
  await expect(menu.getByRole('option', {name: optionName, exact: true})).toHaveAttribute('aria-selected', 'true');
  await menu.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
}

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
