import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = new URL("../apps/web/public/", import.meta.url);
const source = await readFile(new URL("favicon-light.svg", publicDir), "utf8");
const image = source.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1];
if (!image) throw new Error("Could not find the original brand mark in favicon-light.svg");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <mask id="mark" mask-type="alpha"><image href="${image}" width="512" height="512"/></mask>
  </defs>
  <rect width="512" height="512" fill="#5e5ce6" mask="url(#mark)"/>
</svg>`;

await writeFile(new URL("favicon.svg", publicDir), svg);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.goto(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
    await page.locator("svg").evaluate((element, iconSize) => {
      element.setAttribute("width", String(iconSize));
      element.setAttribute("height", String(iconSize));
    }, size);
    await page.locator("svg").screenshot({ path: fileURLToPath(new URL(name, publicDir)), omitBackground: true });
  }
} finally {
  await browser.close();
}
