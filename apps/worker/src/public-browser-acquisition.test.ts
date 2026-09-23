import { describe, expect, it } from "vitest";
import { AuthenticatedBrowserBridgeError } from "@distilled/agent-runtime";
import { publicBrowserFailureDiagnostic } from "./public-browser-acquisition";

describe("public browser bounded diagnostics", () => {
  it("preserves navigation stage and typed code without provider text", () => {
    const result = publicBrowserFailureDiagnostic(new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED"), "NAVIGATE_PUBLIC_PAGE", true);
    expect(result).toEqual({ stage: "NAVIGATE_PUBLIC_PAGE", operation: "NAVIGATE_PUBLIC_PAGE", errorCode: "BRIDGE_NETWORK_POLICY_DENIED", provider: "CLOUDFLARE_CONTAINER", browserBackend: "container", cleanup: true });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("preserves observation stage and omits raw provider errors", () => {
    const result = publicBrowserFailureDiagnostic(Object.assign(new Error("provider detail must not escape"), { name: "BrowserNavigationError" }), "OBSERVE_PUBLIC_PAGE", false);
    expect(result).toMatchObject({ stage: "OBSERVE_PUBLIC_PAGE", operation: "OBSERVE_PUBLIC_PAGE", errorCode: "public_browser_acquisition_failed", cleanup: false });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });
});
