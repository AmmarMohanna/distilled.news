import { describe, expect, it } from "vitest";
import {
  OpenRouterGateway,
  type ModelCapability,
  type ModelRequest
} from "../src";

const runLive = process.env.DISTILLED_LIVE_OPENROUTER_SMOKE === "true";
const maybeDescribe = runLive ? describe : describe.skip;

maybeDescribe("live OpenRouter smoke test", () => {
  it("requires explicit spending opt-in and validates returned model/provider identity", async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.DISTILLED_LIVE_OPENROUTER_MODEL;
    const provider = process.env.DISTILLED_LIVE_OPENROUTER_PROVIDER;
    if (!apiKey || !model || !provider) throw new Error("OPENROUTER_API_KEY, DISTILLED_LIVE_OPENROUTER_MODEL, and DISTILLED_LIVE_OPENROUTER_PROVIDER are required");
    const capability: ModelCapability = {
      modelRef: model,
      provider,
      toolCalling: true,
      vision: false,
      structuredOutput: true,
      reasoningClass: "fast",
      enabled: true,
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
      deployment: "api",
      externallyHosted: true,
      privacyEligibility: ["public"],
      retentionClass: "zero_data_retention"
    };
    const request: ModelRequest = {
      callId: "live-smoke",
      role: "NAVIGATION_FAST",
      route: {
        role: "NAVIGATION_FAST",
        routingReason: "explicit live smoke test",
        requiredCapabilities: ["toolCalling", "structuredOutput"],
        configuredChain: [model],
        configuredTargets: [{ deployment: "api", model }],
        deployment: "api",
        gateway: "openrouter",
        selectedModel: model,
        selectedProvider: provider,
        selectedCapability: capability,
        appliedPolicyConstraints: ["explicit_live_smoke"]
      },
      stable: {
        version: "live-smoke-v1",
        toolSchemaVersion: "web-operator-tools-v1",
        system: "Return a bounded action plan with exactly one browser.query_page_state@1 action."
      },
      dynamic: {
        runId: "live-smoke",
        objective: "Smoke test only.",
        pageState: {
          url: "about:blank",
          title: "",
          pageType: "unknown",
          pageRevision: "initial",
          relevantControls: [],
          pagination: { watermarkObserved: false, exhausted: false },
          challengeState: "NO_CHALLENGE",
          progress: { watermarkObserved: false, validatedListingBoundaryReached: false, articleExtracted: false },
          remainingBudget: {
            modelCalls: 1,
            inputTokens: 1000,
            outputTokens: 200,
            modelCostUsd: 0.05,
            strongModelCalls: 0,
            visionCalls: 0,
            browserActions: 0,
            navigations: 0,
            downloads: 0,
            retries: 0,
            challengeTransitions: 0,
            pages: 0,
            childAgents: 0,
            wallClockMs: 10000
          },
          policyVisibleCapabilities: ["browser.query_page_state@1"]
        },
        observationIds: [],
        completionDeficits: []
      },
      contextManifestHash: "live-smoke-context",
      allowExactReuse: false,
      maxOutputTokens: 200,
      timeoutMs: 15_000
    };
    const result = await new OpenRouterGateway({ apiKey }).complete(request);
    expect(result.gateway).toBe("openrouter");
    expect(result.model.toLowerCase()).toBe(model.toLowerCase());
    expect(result.provider.toLowerCase()).toBe(provider.toLowerCase());
    expect(result.plan.actions.length).toBeGreaterThan(0);
  }, 30_000);
});
