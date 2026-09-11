import { z } from "zod";
import type {
  AcquiredContent,
  AgentPageState,
  AgentToolCall,
  AgentToolIntent,
  AgentToolResult,
  AgentTurn,
  BrowserContextRecord,
  BrowserSessionRecord,
  ChallengeRecord,
  ObservationEnvelope,
  PlannedAction,
  ProgressFacts,
  ToolName
} from "./contracts";
import { makeId } from "./contracts";
import type {
  BrowserAllocation,
  BrowserExecutorPort,
  StructuredBrowserUsePort,
  VisualComputerUsePort
} from "./browser";
import { BrowserScopeError, StaleObservationError } from "./browser";
import { BudgetExceededError, BudgetLedger } from "./budget";
import { CompletionVerifier } from "./completion";
import { createObservationEnvelope, diffPageState, projectPageState, sha256Text, type ArtifactStore } from "./observations";
import type { RuntimeStore } from "./persistence";
import { PolicyEngine } from "./policy";

const empty = z.object({}).strict();
const schemas: Record<ToolName, z.ZodTypeAny> = {
  "browser.navigate@1": z.object({ url: z.string().url() }).strict(),
  "browser.inspect_dom@1": empty,
  "browser.inspect_accessibility_tree@1": empty,
  "browser.follow_link@1": z.object({ handle: z.string(), observationRevision: z.string() }).strict(),
  "browser.extract@1": empty,
  "browser.query_page_state@1": empty,
  "browser.scroll@1": z.object({ deltaY: z.number().int().min(-2000).max(2000) }).strict(),
  "computer.screenshot@1": empty,
  "computer.move_pointer@1": z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    screenshotObservationId: z.string(),
    screenshotHash: z.string(),
    purpose: z.string()
  }).strict(),
  "computer.click@1": z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    screenshotObservationId: z.string(),
    screenshotHash: z.string(),
    purpose: z.string()
  }).strict(),
  "run.propose_completion@1": z.object({ citedObservationIds: z.array(z.string()).max(20) }).strict(),
  "fixture.publish@1": z.object({ articleId: z.string() }).strict()
};

export function validateToolArguments(action: PlannedAction) {
  return schemas[action.tool].safeParse(action.arguments);
}

export type FaultPoint =
  | "after_intent_before_dispatch"
  | "after_effect_before_result"
  | "after_content_acceptance_before_state"
  | "after_completion_before_ack";

export interface TestOnlyFaultInjector {
  readonly testOnly: true;
  hit(point: FaultPoint, context: { runId: string; toolCallId?: string }): void;
}

export class InjectedCrashError extends Error {
  constructor(readonly point: FaultPoint) {
    super(`test-only injected crash at ${point}`);
    this.name = "InjectedCrashError";
  }
}

export interface DispatchState {
  allocation: BrowserAllocation;
  pageState?: AgentPageState;
  latestObservation?: ObservationEnvelope;
  latestDelta?: ReturnType<typeof diffPageState>;
  latestScreenshot?: {
    observationId: string;
    token: string;
    pageRevision: string;
    hash: string;
  };
  challengeFingerprints: Map<string, number>;
  progress: ProgressFacts;
}

export interface DispatchOutcome {
  result: AgentToolResult;
  observation?: ObservationEnvelope;
  pageState?: AgentPageState;
  continuePlan: boolean;
  completionAccepted: boolean;
  completionDeficits?: string[];
  challenge?: ChallengeRecord;
  acquiredContent?: AcquiredContent;
}

export interface ToolDispatcherOptions {
  store: RuntimeStore;
  artifacts: ArtifactStore;
  browserExecutor: BrowserExecutorPort;
  structured: StructuredBrowserUsePort;
  visual: VisualComputerUsePort;
  policy: PolicyEngine;
  budget: BudgetLedger;
  completionVerifier: CompletionVerifier;
  faultInjector?: TestOnlyFaultInjector;
}

export class ToolDispatcher {
  constructor(private readonly options: ToolDispatcherOptions) {}

  async dispatch(input: {
    runId: string;
    tenantId: string;
    generation: number;
    turn: AgentTurn;
    modelCallId: string;
    planIndex: number;
    action: PlannedAction;
    state: DispatchState;
  }): Promise<DispatchOutcome> {
    const now = new Date().toISOString();
    const toolCallId = makeId("tool_call", input.runId, input.turn.id, input.modelCallId, input.planIndex);
    let resolvedAction = this.resolvePlanReferences(input.action, input.state);
    let call: AgentToolCall = {
      id: toolCallId,
      runId: input.runId,
      turnId: input.turn.id,
      modelCallId: input.modelCallId,
      planIndex: input.planIndex,
      tool: resolvedAction.tool,
      arguments: resolvedAction.arguments,
      state: "requested",
      createdAt: now
    };
    const existing = await this.options.store.getToolCall(toolCallId);
    if (existing) {
      const priorResult = await this.options.store.getToolResult(toolCallId);
      if (priorResult) return { result: priorResult, continuePlan: false, completionAccepted: false };
      call = existing;
      resolvedAction = { tool: existing.tool, arguments: existing.arguments };
      if (existing.state === "dispatching") {
        await this.options.store.transitionToolCall(toolCallId, "effect_unknown", input.generation);
        const result = await this.options.store.saveToolResult({
          id: makeId("tool_result", toolCallId),
          runId: input.runId,
          toolCallId,
          generation: input.generation,
          state: "effect_unknown",
          effectCertainty: "unknown",
          errorCode: "effect_unknown",
          errorMessage: "worker stopped after dispatch; a fresh context could not prove the prior effect",
          completedAt: now
        });
        return { result, continuePlan: false, completionAccepted: false };
      }
      if (existing.state !== "intent_persisted") {
        throw new Error(`cannot resume tool call ${toolCallId} from ${existing.state}`);
      }
      await this.options.store.assertGeneration(input.runId, input.generation);
      await this.options.store.transitionToolCall(toolCallId, "dispatching", input.generation);
      await this.options.store.appendEvent(input.runId, "agent.tool.intent_replayed", { toolCallId });
    } else {
      await this.options.store.saveToolCall(call);

      const parsed = validateToolArguments(resolvedAction);
      if (!parsed.success) {
        await this.options.store.transitionToolCall(toolCallId, "failed", input.generation);
        const result = await this.options.store.saveToolResult({
          id: makeId("tool_result", toolCallId),
          runId: input.runId,
          toolCallId,
          generation: input.generation,
          state: "failed",
          effectCertainty: "not_dispatched",
          errorCode: "invalid_tool_call",
          errorMessage: parsed.error.message,
          completedAt: now
        });
        return { result, continuePlan: false, completionAccepted: false };
      }
      resolvedAction.arguments = parsed.data;
      await this.options.store.transitionToolCall(toolCallId, "schema_validated", input.generation);

      const decision = this.options.policy.evaluate({
        runId: input.runId,
        toolCallId,
        action: resolvedAction,
        pageState: input.state.pageState,
        now
      });
      await this.options.store.savePolicyDecision(decision);
      if (!decision.allowed) {
        await this.options.store.transitionToolCall(toolCallId, "policy_denied", input.generation);
        const result = await this.options.store.saveToolResult({
          id: makeId("tool_result", toolCallId),
          runId: input.runId,
          toolCallId,
          generation: input.generation,
          state: "failed",
          effectCertainty: "not_dispatched",
          errorCode: "policy_denied",
          errorMessage: decision.reasonCode,
          completedAt: now
        });
        return { result, continuePlan: false, completionAccepted: false };
      }
      await this.options.store.transitionToolCall(toolCallId, "policy_allowed", input.generation);

      try {
        this.options.budget.reserveTool(resolvedAction.tool);
        await this.options.store.saveBudget(this.options.budget.snapshot());
      } catch (error) {
        await this.options.store.transitionToolCall(toolCallId, "failed", input.generation);
        const result = await this.options.store.saveToolResult({
          id: makeId("tool_result", toolCallId),
          runId: input.runId,
          toolCallId,
          generation: input.generation,
          state: "failed",
          effectCertainty: "not_dispatched",
          errorCode: error instanceof BudgetExceededError ? `budget_${error.dimension}` : "budget_error",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: now
        });
        return { result, continuePlan: false, completionAccepted: false };
      }
      await this.options.store.transitionToolCall(toolCallId, "budget_reserved", input.generation);

      const intent: AgentToolIntent = {
        id: makeId("tool_intent", toolCallId),
        runId: input.runId,
        toolCallId,
        idempotencyKey: makeId("effect", input.runId, toolCallId, JSON.stringify(resolvedAction.arguments)),
        generation: input.generation,
        tool: resolvedAction.tool,
        arguments: resolvedAction.arguments,
        persistedAt: now
      };
      await this.options.store.saveToolIntent(intent);
      await this.options.store.transitionToolCall(toolCallId, "intent_persisted", input.generation);
      this.options.faultInjector?.hit("after_intent_before_dispatch", { runId: input.runId, toolCallId });
      await this.options.store.assertGeneration(input.runId, input.generation);
      await this.options.store.transitionToolCall(toolCallId, "dispatching", input.generation);
    }

    try {
      if (resolvedAction.tool === "run.propose_completion@1") {
        return this.executeCompletion(input, resolvedAction, call, now);
      }
      if (resolvedAction.tool === "fixture.publish@1") throw new Error("forbidden executor must be unreachable");
      const browserOutput = await this.executeBrowser(resolvedAction, input.state);
      this.options.faultInjector?.hit("after_effect_before_result", { runId: input.runId, toolCallId });
      const observation = await this.envelopeBrowserOutput(input, call, browserOutput);
      await this.options.store.saveObservation(observation);
      if (browserOutput.watermarkObserved) input.state.progress.watermarkObserved = true;
      const pageState = projectPageState({
        url: browserOutput.url,
        title: browserOutput.title,
        pageRevision: browserOutput.pageRevision,
        controls: browserOutput.controls,
        article: browserOutput.article
          ? {
              title: browserOutput.article.title,
              canonicalUrl: browserOutput.article.canonicalUrl,
              publisherTimestamp: browserOutput.article.publisherTimestamp,
              contentHash: await sha256Text(browserOutput.article.body)
            }
          : undefined,
        watermarkObserved: browserOutput.watermarkObserved,
        exhausted: browserOutput.watermarkObserved,
        challengeState: browserOutput.challengeState,
        progress: input.state.progress,
        remainingBudget: this.options.budget.remaining(),
        policyVisibleCapabilities: this.options.policy.visibleCapabilities()
      });
      let acquiredContent: AcquiredContent | undefined;
      if (resolvedAction.tool === "browser.extract@1" && browserOutput.article) {
        const contentHash = await sha256Text(browserOutput.article.body);
        acquiredContent = {
          acceptanceId: makeId("acquired", input.runId, browserOutput.article.canonicalUrl, contentHash),
          runId: input.runId,
          generation: input.generation,
          turnId: input.turn.id,
          modelCallId: input.modelCallId,
          toolCallId,
          observationId: observation.id,
          rawArtifactRef: observation.raw.ref,
          canonicalUrl: browserOutput.article.canonicalUrl,
          finalUrl: browserOutput.finalUrl,
          publisherTimestamp: browserOutput.article.publisherTimestamp,
          title: browserOutput.article.title,
          excerpt: browserOutput.article.excerpt,
          body: browserOutput.article.body,
          contentHash,
          acceptedAt: now
        };
        acquiredContent = await this.options.store.acceptContent(acquiredContent);
        input.state.progress.articleExtracted = true;
        input.state.progress.acceptedContentId = acquiredContent.acceptanceId;
        pageState.progress = structuredClone(input.state.progress);
        this.options.faultInjector?.hit("after_content_acceptance_before_state", { runId: input.runId, toolCallId });
      }

      let challenge: ChallengeRecord | undefined;
      if (browserOutput.challengeState !== "NO_CHALLENGE") {
        const fingerprint = await sha256Text(`${browserOutput.challengeState}:${browserOutput.url}:${browserOutput.pageRevision}`);
        const persistedOccurrence = await this.options.store.getChallengeOccurrence(input.runId, fingerprint);
        const occurrence = Math.max(input.state.challengeFingerprints.get(fingerprint) ?? 0, persistedOccurrence) + 1;
        input.state.challengeFingerprints.set(fingerprint, occurrence);
        const state = occurrence > 1 ? "CHALLENGE_LOOP" : browserOutput.challengeState;
        this.options.budget.reserve({ challengeTransitions: 1 });
        await this.options.store.saveBudget(this.options.budget.snapshot());
        challenge = {
          id: makeId("challenge", input.runId, fingerprint, occurrence),
          runId: input.runId,
          observationId: observation.id,
          state,
          fingerprint,
          occurrence,
          disposition: "suspend",
          createdAt: now
        };
        await this.options.store.saveChallenge(challenge);
      }

      await this.options.store.transitionToolCall(toolCallId, "succeeded", input.generation);
      const result = await this.options.store.saveToolResult({
        id: makeId("tool_result", toolCallId),
        runId: input.runId,
        toolCallId,
        generation: input.generation,
        state: "succeeded",
        effectCertainty: "known_applied",
        output: { observationId: observation.id, pageState, acquiredContentId: acquiredContent?.acceptanceId },
        completedAt: now
      });
      if (input.state.latestObservation && input.state.pageState) {
        input.state.latestDelta = diffPageState(
          input.state.latestObservation.id,
          input.state.pageState,
          observation.id,
          pageState
        );
        await this.options.store.appendEvent(input.runId, "agent.observation.delta", input.state.latestDelta);
      }
      input.state.latestObservation = observation;
      input.state.pageState = pageState;
      const continuePlan = !challenge && this.expectedStateSatisfied(resolvedAction, pageState);
      return {
        result,
        observation,
        pageState,
        continuePlan,
        completionAccepted: false,
        challenge,
        acquiredContent
      };
    } catch (error) {
      if (error instanceof InjectedCrashError) throw error;
      const knownNotApplied = error instanceof StaleObservationError || error instanceof BrowserScopeError;
      const effectUnknown = error instanceof EffectUnknownError || !knownNotApplied;
      const state = effectUnknown ? "effect_unknown" : "failed";
      await this.options.store.transitionToolCall(toolCallId, state, input.generation);
      const result = await this.options.store.saveToolResult({
        id: makeId("tool_result", toolCallId),
        runId: input.runId,
        toolCallId,
        generation: input.generation,
        state,
        effectCertainty: effectUnknown ? "unknown" : "known_not_applied",
        errorCode: error instanceof StaleObservationError ? "stale_observation" : effectUnknown ? "effect_unknown" : "tool_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: now
      });
      return { result, continuePlan: false, completionAccepted: false };
    }
  }

  private async executeCompletion(
    input: Parameters<ToolDispatcher["dispatch"]>[0],
    action: PlannedAction,
    call: AgentToolCall,
    now: string
  ): Promise<DispatchOutcome> {
    const args = action.arguments as { citedObservationIds: string[] };
    const verification = this.options.completionVerifier.verify({
      runId: input.runId,
      toolCallId: call.id,
      citedObservationIds: args.citedObservationIds,
      progress: input.state.progress,
      now
    });
    await this.options.store.saveCompletionProposal(verification.proposal);
    await this.options.store.saveCompletionAcceptance(verification.acceptance);
    await this.options.store.transitionToolCall(call.id, "succeeded", input.generation);
    const result = await this.options.store.saveToolResult({
      id: makeId("tool_result", call.id),
      runId: input.runId,
      toolCallId: call.id,
      generation: input.generation,
      state: "succeeded",
      effectCertainty: "known_not_applied",
      output: verification.acceptance,
      completedAt: now
    });
    return {
      result,
      continuePlan: false,
      completionAccepted: verification.acceptance.outcome === "accepted",
      completionDeficits: verification.acceptance.deficits
    };
  }

  private resolvePlanReferences(action: PlannedAction, state: DispatchState): PlannedAction {
    if (action.tool !== "computer.move_pointer@1" && action.tool !== "computer.click@1") return structuredClone(action);
    const args = structuredClone(action.arguments) as Record<string, unknown>;
    if (args.screenshotObservationId === "$latestScreenshot") {
      args.screenshotObservationId = state.latestScreenshot?.observationId ?? "";
    }
    if (args.screenshotHash === "$latestScreenshotHash") args.screenshotHash = state.latestScreenshot?.hash ?? "";
    return { ...structuredClone(action), arguments: args };
  }

  private async executeBrowser(action: PlannedAction, state: DispatchState) {
    const scope = state.allocation;
    switch (action.tool) {
      case "browser.navigate@1":
        return this.options.structured.navigate(scope, (action.arguments as { url: string }).url);
      case "browser.inspect_dom@1":
        return this.options.structured.inspectDom(scope);
      case "browser.inspect_accessibility_tree@1":
        return this.options.structured.inspectAccessibilityTree(scope);
      case "browser.follow_link@1": {
        const args = action.arguments as { handle: string; observationRevision: string };
        return this.options.structured.followLink(scope, args.handle, args.observationRevision);
      }
      case "browser.extract@1":
        return this.options.structured.extract(scope);
      case "browser.query_page_state@1":
        return this.options.structured.queryPageState(scope);
      case "browser.scroll@1":
        return this.options.structured.scroll(scope, (action.arguments as { deltaY: number }).deltaY);
      case "computer.screenshot@1": {
        const screenshot = await this.options.visual.screenshot(scope);
        return screenshot;
      }
      case "computer.move_pointer@1":
      case "computer.click@1": {
        const args = action.arguments as { x: number; y: number; screenshotObservationId: string; screenshotHash:string };
        const latest = state.latestScreenshot;
        if (!latest || latest.observationId !== args.screenshotObservationId || latest.hash !== args.screenshotHash) throw new StaleObservationError("screenshot");
        const input = { x: args.x, y: args.y, screenshotToken: latest.token, pageRevision: latest.pageRevision };
        return action.tool === "computer.move_pointer@1"
          ? this.options.visual.movePointer(scope, input)
          : this.options.visual.click(scope, input);
      }
      default:
        throw new Error(`not a browser action: ${action.tool}`);
    }
  }

  private async envelopeBrowserOutput(
    input: Parameters<ToolDispatcher["dispatch"]>[0],
    call: AgentToolCall,
    output: Awaited<ReturnType<ToolDispatcher["executeBrowser"]>>
  ) {
    const representationType = call.tool === "computer.screenshot@1"
      ? "screenshot"
      : call.tool === "browser.extract@1"
        ? "article"
        : call.tool === "browser.inspect_dom@1"
          ? "dom"
          : call.tool === "browser.inspect_accessibility_tree@1"
            ? "accessibility"
            : output.challengeState !== "NO_CHALLENGE"
              ? "challenge"
              : "page_state";
    const observation = await createObservationEnvelope(this.options.artifacts, {
      id: makeId("observation", input.runId, call.id, output.pageRevision),
      runId: input.runId,
      turnId: input.turn.id,
      toolCallId: call.id,
      browserSessionId: input.state.allocation.sessionId,
      browserGeneration: input.state.allocation.generation,
      pageId: output.pageId,
      pageRevision: output.pageRevision,
      originUrl: output.url,
      finalUrl: output.finalUrl,
      contentType: output.contentType,
      representationType,
      rawBytes: output.raw,
      modelRepresentation: output.representation,
      redactions: []
    });
    if (
      call.tool === "computer.screenshot@1" &&
      "screenshotObservationToken" in output &&
      typeof output.screenshotObservationToken === "string"
    ) {
      input.state.latestScreenshot = {
        observationId: observation.id,
        token: output.screenshotObservationToken,
        pageRevision: output.pageRevision,
        hash: observation.raw.hash
      };
    }
    return observation;
  }

  private expectedStateSatisfied(action: PlannedAction, state: AgentPageState): boolean {
    if (!action.expected) return true;
    if (action.expected.pageRevision && action.expected.pageRevision !== state.pageRevision) return false;
    if (action.expected.urlIncludes && !state.url.includes(action.expected.urlIncludes)) return false;
    if (action.expected.challengeState && action.expected.challengeState !== state.challengeState) return false;
    return true;
  }
}

export class EffectUnknownError extends Error {
  constructor(message = "external effect could not be reconciled") {
    super(message);
    this.name = "EffectUnknownError";
  }
}
