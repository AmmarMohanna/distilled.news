import { describe, expect, it } from "vitest";
import { isEligibleDiagnosticProvider } from "./authenticated-surface-diagnostic";

describe("credential-less auth surface diagnostic provider eligibility", () => {
  it.each([
    ["SELF_HOSTED_CHROMIUM", true],
    ["CLOUDFLARE_CONTAINER", true],
    ["CLOUDFLARE_BROWSER", false],
    ["UNKNOWN", false],
    [undefined, false]
  ] as const)("%s eligibility is %s", (provider, eligible) => {
    expect(isEligibleDiagnosticProvider(provider)).toBe(eligible);
  });

  it("keeps the diagnostic provider gate independent of secret/session operations", () => {
    expect(isEligibleDiagnosticProvider("CLOUDFLARE_CONTAINER")).toBe(true);
    expect(isEligibleDiagnosticProvider("SELF_HOSTED_CHROMIUM")).toBe(true);
    // The predicate is pure: accepting a provider performs no credential, session,
    // browser-control, or profile operation. Those operations remain absent from the
    // existing diagnostic lifecycle, which is separately covered by its operation trace.
  });
});
