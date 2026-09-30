import { expect, it } from "vitest";
import { nextBootstrapProvider,shouldBootstrapFailoverOnFailure } from "./authenticated-profile-bootstrap";
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

it("fails over when container allocation fails before browser initialization",()=>{
  expect(shouldBootstrapFailoverOnFailure("BOOTSTRAP_INFRASTRUCTURE_FAILED","profile_resolved","CLOUDFLARE_CONTAINER")).toBe(true);
  expect(shouldBootstrapFailoverOnFailure("BOOTSTRAP_INFRASTRUCTURE_FAILED","credential_retrieved","CLOUDFLARE_CONTAINER")).toBe(false);
  expect(shouldBootstrapFailoverOnFailure("BOOTSTRAP_INFRASTRUCTURE_FAILED","profile_resolved","SELF_HOSTED_CHROMIUM")).toBe(false);
});
