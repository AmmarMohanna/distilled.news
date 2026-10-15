import type { Page } from "@playwright/test";

/** Feed page actions that live in the "More" menu of the top bar. */
export async function openMore(page: Page) {
  const more = page.locator(".feed-more");
  if (!(await more.evaluate(node => (node as HTMLDetailsElement).open))) await more.locator("summary").click();
}

export async function refreshFeed(page: Page) {
  await openMore(page);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
}

export async function openEditSettings(page: Page) {
  await openMore(page);
  await page.getByRole("button", { name: "Edit feed settings", exact: true }).click();
}

/** Cycles the website language: the header control where it exists, otherwise (phones, signed in) the same setting Settings writes. */
export async function cycleLanguage(page: Page) {
  await page.locator(".experience-header").first().waitFor();
  const button = page.locator(".language-cycle");
  if (await button.isVisible()) { await button.click(); return; }
  await page.evaluate(() => {
    const order = ["en", "fr", "ar"];
    const current = localStorage.getItem("dn_language") ?? "en";
    localStorage.setItem("dn_language", order[(order.indexOf(current) + 1) % order.length]);
    window.dispatchEvent(new Event("dn-language"));
  });
}

/** Toggles dark mode: the header button where it exists, otherwise (phones, signed in) the setting Settings writes. */
export async function toggleTheme(page: Page) {
  await page.locator(".experience-header").first().waitFor();
  const button = page.locator(".theme-toggle");
  if (await button.isVisible()) { await button.click(); return; }
  await page.evaluate(() => {
    localStorage.setItem("dn_theme", localStorage.getItem("dn_theme") === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event("dn-theme"));
  });
}
