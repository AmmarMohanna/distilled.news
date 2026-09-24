import { describe, expect, it } from "vitest";
import type { BrowserBridgeTransport } from "@distilled/agent-runtime";
import { ContainerPublicWebOperatorBrowser } from "./container-web-operator-browser";
import type { Env } from "./types";

const origin = "https://publisher.example";
const env = { DISTILLED_BROWSER_PROVIDER: "cloudflare_container", AUTHENTICATED_BROWSER_CONTAINER: {} } as Env;

describe("restricted Web Operator Container browser", () => {
  it("opens, navigates, observes, and closes with PUBLIC read-only fences", async () => {
    const operations: string[] = [];
    const transport: BrowserBridgeTransport = { async execute(message) {
      operations.push(message.operation);
      expect(message.capability.siteKind).toBe("PUBLIC");
      expect(message.capability.writeOrigins).toEqual([]);
      expect(message.capability.ownerId).toBe("owner_a");
      if (message.operation === "OPEN_AUTH_BROWSER") return { runId: "run_a", tenantId: "tenant_a", sessionId: "session_a", contextId: "context_a", pageId: "page_a", generation: 1, viewport: { width: 1, height: 1, deviceScaleFactor: 1 } };
      if (message.operation === "OBSERVE_PUBLIC_PAGE") return { url: `${origin}/news`, title: "News", pageRevision: "revision_a", visibleText: "News", controls: [], challengeState: "NO_CHALLENGE" };
      if (message.operation === "CLOSE_AUTH_BROWSER") return { closed: true };
      return { accepted: true };
    } };
    const browser = new ContainerPublicWebOperatorBrowser(env, "owner_a", "resource_a", `${origin}/news`, 10, transport);
    const scope = await browser.allocate({ runId: "run_a", tenantId: "tenant_a", generation: 1, allowedOrigins: [origin] });
    const observed = await browser.navigate(scope, `${origin}/news`);
    expect(observed.observationSource).toBe("CDP_DOM_SNAPSHOT");
    expect(observed.challengeState).toBe("NO_CHALLENGE");
    await expect(browser.navigate(scope, "https://foreign.example/news")).rejects.toThrow();
    await expect(browser.click()).rejects.toThrow();
    await browser.close(scope); await browser.close(scope);
    expect(operations).toEqual(["OPEN_AUTH_BROWSER", "NAVIGATE_PUBLIC_PAGE", "OBSERVE_PUBLIC_PAGE", "CLOSE_AUTH_BROWSER"]);
  });
});
