import { describe, expect, it } from "vitest";
import { AuthenticatedBrowserBridgeError } from "@distilled/agent-runtime";
import { publicBrowserFailureDiagnostic, publicBrowserPolicyLogFields } from "./public-browser-acquisition";

describe("public browser bounded diagnostics", () => {
  it("preserves navigation stage and typed code without provider text", () => {
    const result = publicBrowserFailureDiagnostic(new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED"), "NAVIGATE_PUBLIC_PAGE", true);
    expect(result).toEqual({ stage: "NAVIGATE_PUBLIC_PAGE", operation: "NAVIGATE_PUBLIC_PAGE", errorCode: "BRIDGE_NETWORK_POLICY_DENIED", provider: "CLOUDFLARE_CONTAINER", browserBackend: "container", cleanup: true });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("preserves bounded policy diagnostics without raw URLs", () => {
    const result = publicBrowserFailureDiagnostic(new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED", { policyRule: "ORIGIN_NOT_ADMITTED", deniedHostname: "cdn.example.test", redirectHop: false, topLevelNavigation: true, sameSiteWithRequestedSource: false, admittedOriginCount: 1 }), "NAVIGATE_PUBLIC_PAGE", true);
    expect(result).toMatchObject({ policy: { policyRule: "ORIGIN_NOT_ADMITTED", deniedHostname: "cdn.example.test", redirectHop: false, topLevelNavigation: true, sameSiteWithRequestedSource: false, admittedOriginCount: 1 } });
    expect(JSON.stringify(result)).not.toContain("/secret");
  });

  it("logs only bounded policy fields", () => {
    const diagnostic = publicBrowserFailureDiagnostic(new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED", { policyRule: "REDIRECT_ORIGIN_NOT_ADMITTED", deniedHostname: "cdn.example.test", redirectHop: true, topLevelNavigation: true, sameSiteWithRequestedSource: false, admittedOriginCount: 1 }), "NAVIGATE_PUBLIC_PAGE", true);
    const fields = publicBrowserPolicyLogFields(diagnostic);
    expect(fields).toMatchObject({ event: "public_browser_policy_denial", operation: "NAVIGATE_PUBLIC_PAGE", policyRule: "REDIRECT_ORIGIN_NOT_ADMITTED", deniedHostname: "cdn.example.test", redirectHop: true, cleanup: true });
    expect(JSON.stringify(fields)).not.toContain("provider detail");
  });

  it("preserves observation stage and omits raw provider errors", () => {
    const result = publicBrowserFailureDiagnostic(Object.assign(new Error("provider detail must not escape"), { name: "BrowserNavigationError" }), "OBSERVE_PUBLIC_PAGE", false);
    expect(result).toMatchObject({ stage: "OBSERVE_PUBLIC_PAGE", operation: "OBSERVE_PUBLIC_PAGE", errorCode: "public_browser_acquisition_failed", cleanup: false });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });
});
