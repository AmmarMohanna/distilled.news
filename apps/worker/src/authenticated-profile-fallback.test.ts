import { expect, it } from "vitest";
import { nextBootstrapProvider } from "./authenticated-profile-bootstrap";
import type { Env } from "./types";

it("uses at most two eligible alternate executors for X bootstrap", () => {
  const env = {
    DISTILLED_BROWSER_PROVIDER: "cloudflare_container",
    SELF_HOSTED_BROWSER_BRIDGE_URL: "https://bridge.example.test/v1/authenticated-browser",
    SELF_HOSTED_BROWSER_BRIDGE_AUTH: "fixture-credential",
    BROWSER: {} as Env["BROWSER"]
  } as Env;
  expect(nextBootstrapProvider(env, {})).toBe("self_hosted");
  expect(nextBootstrapProvider(env, { providerOverride: "self_hosted" })).toBe("cloudflare");
  expect(nextBootstrapProvider(env, { providerOverride: "cloudflare" })).toBeUndefined();
  expect(nextBootstrapProvider(env, { selectBackend: () => undefined })).toBeUndefined();
  expect(nextBootstrapProvider({ ...env, SELF_HOSTED_BROWSER_BRIDGE_URL: undefined }, {})).toBe("cloudflare");
});
