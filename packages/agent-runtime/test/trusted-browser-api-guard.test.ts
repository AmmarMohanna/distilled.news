import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const trustedBrowserFiles = [
  resolve(import.meta.dirname, "../src/browser.ts")
];

const forbiddenPageRealmApis = [
  ".evaluate(",
  ".evaluateAll(",
  "$eval(",
  "$$eval(",
  ".addScriptTag(",
  ".exposeFunction(",
  ".dispatchEvent(",
  ".keyboard.",
  "Runtime.evaluate",
  "Runtime.callFunctionOn"
];

describe("trusted browser observation API guard", () => {
  it("keeps trusted observation and grounding modules out of the page JavaScript realm", () => {
    const violations = trustedBrowserFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return forbiddenPageRealmApis
        .filter((api) => source.includes(api))
        .map((api) => `${file}: ${api}`);
    });
    expect(violations).toEqual([]);
  });
});
