import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLICE_BUDGET,
  MemoryArtifactStore,
  MemoryRuntimeStore,
  admitPublicCandidateAcquisition,
  createWebOperatorRuntimeHandler,
  type ModelCapability,
  type ModelRoutingConfig
} from "../src";

const runLive = process.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE === "true";
const maybeDescribe = runLive ? describe : describe.skip;

maybeDescribe("live public candidate acquisition smoke test with local browser", () => {
  it("acquires an explicitly configured public candidate through the real runtime loop using local Playwright", async () => {
    const articleUrl = requiredEnv("DISTILLED_LIVE_PUBLIC_CANDIDATE_URL");
    const model = requiredEnv("DISTILLED_LIVE_OPENROUTER_MODEL");
    const provider = requiredEnv("DISTILLED_LIVE_OPENROUTER_PROVIDER");
    requiredEnv("OPENROUTER_API_KEY");
    const origin = new URL(articleUrl).origin;
    const store = new MemoryRuntimeStore();
    const artifacts = new MemoryArtifactStore();
    const modelCapabilities: ModelCapability[] = [{
      modelRef: model,
      provider,
      toolCalling: true,
      vision: true,
      structuredOutput: true,
      reasoningClass: "fast",
      enabled: true,
      inputCostPerMillion: Number(process.env.DISTILLED_LIVE_OPENROUTER_INPUT_COST_PER_MILLION ?? 0),
      outputCostPerMillion: Number(process.env.DISTILLED_LIVE_OPENROUTER_OUTPUT_COST_PER_MILLION ?? 0),
      deployment: "api",
      externallyHosted: true,
      privacyEligibility: ["public"],
      retentionClass: "zero_data_retention"
    }];
    const modelRouting: ModelRoutingConfig = {
      mode: "api",
      apiGateway: "openrouter",
      selfHostedGateway: "openai_compatible",
      roles: {
        NAVIGATION_FAST: { primary: { deployment: "api", model }, fallbacks: [] },
        VISION_FAST: { primary: { deployment: "api", model }, fallbacks: [] }
      }
    };
    const admitted = await admitPublicCandidateAcquisition({
      store,
      enabled: true,
      request: {
        tenantId: "live-smoke",
        resourceId: "live-public-candidate",
        idempotencyKey: `live-public-candidate:${articleUrl}`,
        objective: `Acquire the public article at ${articleUrl} and cite the accepted observation when complete.`,
        candidate: {
          candidateId: `live:${articleUrl}`,
          canonicalUrl: articleUrl,
          publisherId: new URL(articleUrl).hostname,
          acquisitionAttempt: "live-public-smoke"
        },
        policy: {
          id: "live-public-read-policy",
          allowedOrigins: [origin],
          allowLoopback: false,
          allowedTools: [
            "browser.navigate@1",
            "browser.inspect_dom@1",
            "browser.inspect_accessibility_tree@1",
            "browser.query_page_state@1",
            "browser.follow_link@1",
            "browser.extract@1",
            "computer.screenshot@1",
            "run.propose_completion@1"
          ],
          visualReadPurposes: ["read-navigation"],
          modelPolicy: {
            allowedProviders: [provider],
            allowedDeployments: ["api"],
            requiredPrivacyEligibility: ["public"],
            allowedRetentionClasses: ["zero_data_retention"]
          }
        },
        modelCapabilities,
        baseModelRouting: modelRouting
      }
    });
    const handler = createWebOperatorRuntimeHandler({
      store,
      artifacts,
      runtimeToken: "live-smoke-runtime-token",
      environment: {
        ...process.env,
        DISTILLED_BROWSER_BACKEND: "local",
        DISTILLED_LLM_MODE: "api",
        DISTILLED_LLM_API_GATEWAY: "openrouter"
      },
      workerIdFactory: () => "live-public-smoke-worker",
      leaseTtlMs: 30_000
    });
    const response = await handler(new Request("https://runtime.test/v1/agent-runs/process", {
      method: "POST",
      headers: { authorization: "Bearer live-smoke-runtime-token" },
      body: JSON.stringify(admitted.wake)
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string };
    expect(body.status).toBe("completed");
    const accepted = await store.getAcceptedContent(admitted.run.runId);
    expect(accepted[0]?.canonicalUrl).toBe(articleUrl);
    expect(accepted[0]?.body.length).toBeGreaterThan(0);
  }, 120_000);
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live public acquisition smoke testing`);
  return value;
}
