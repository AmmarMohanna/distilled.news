import { describe, expect, it } from "vitest";
import { AuthenticatedBrowserBridgeService } from "../src/service";
import { MockBrowserProvider, baseCapability } from "./support";

describe("typed Browser Use Container ingress", () => {
  it("rejects unrelated origins before spawning Python and cleans up the session", async () => {
    const provider = new MockBrowserProvider();
    const service = new AuthenticatedBrowserBridgeService({ serviceCredential: "test-secret", provider });
    const sourceUrl = "https://news.example/";
    const capability = baseCapability({ siteKind: "PUBLIC", authEntryPoint: sourceUrl, sessionProbeUrl: sourceUrl, allowedOrigins: ["https://news.example"], writeOrigins: [] });
    const post = async (operation: Record<string, unknown>) => service.handleInternal(new Request("http://container/v1/internal-authenticated-browser", { method: "POST", body: JSON.stringify({ protocol: "v1", operationId: crypto.randomUUID(), capability, ...operation }) }));
    expect((await (await post({ operation: "OPEN_AUTH_BROWSER" })).json()).ok).toBe(true);
    const denied = await (await post({ operation: "DISCOVER_SOURCE_WITH_BROWSER_USE", sourceUrl: "https://metadata.google.internal/", modelRef: "openai/model", maxSteps: 4 })).json() as { error?: { code: string } };
    expect(denied.error?.code).toBe("BRIDGE_NETWORK_POLICY_DENIED");
    expect((await (await post({ operation: "CLOSE_AUTH_BROWSER" })).json()).ok).toBe(true);
    expect(provider.closeCalls).toBe(1);
    await service.shutdown();
  });
});
