import { describe, expect, it } from "vitest";
import { SourceAcquisitionOrchestrator, type AcquisitionStageOutcome, type ActiveWorkflowHandle } from "../src/source-acquisition-orchestrator";
import type { SourceAcquisitionRequest, SourceAcquisitionResult } from "../src/temporal-acquisition";

const request: SourceAcquisitionRequest = { source: { canonicalSourceUrl: "https://source.example.test/section" }, window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" }, limits: { maxItems: 10, maxPages: 3, maxScrolls: 2, maxPhysicalAttempts: 2, maxExecutionMs: 10_000 }, authentication: "PUBLIC", acquisitionAsOf: "2026-09-23T00:00:00Z" };
const result = {} as SourceAcquisitionResult;
const success = (stage: AcquisitionStageOutcome["stage"]): AcquisitionStageOutcome => ({ stage, status: "SUCCESS", result });
const failure = (stage: AcquisitionStageOutcome["stage"], status: AcquisitionStageOutcome["status"]): AcquisitionStageOutcome => ({ stage, status });
function workflow(id: string, version: number, outcome: AcquisitionStageOutcome): ActiveWorkflowHandle { return { id, version, execute: async () => outcome }; }

describe("generic source acquisition orchestrator", () => {
  it("accepts verifier-owned Web Operator content without claiming workflow promotion", async () => {
    const out = await new SourceAcquisitionOrchestrator({ http: async () => failure("HTTP", "INSUFFICIENT"), webOperator: async () => success("WEB_OPERATOR") }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.result).toBe(result);
    expect(out.webOperatorCalls).toBe(1); expect(out.candidateWorkflow).toBeUndefined();
    expect(out.stages.map(s => s.stage)).toEqual(["HTTP", "WEB_OPERATOR"]);
  });
  it("does not accept a Web Operator success without acquired content", async () => {
    const out = await new SourceAcquisitionOrchestrator({ webOperator: async () => ({ stage: "WEB_OPERATOR", status: "SUCCESS" }) }).acquire(request);
    expect(out.status).toBe("STOPPED"); expect(out.result).toBeUndefined();
  });
  it("uses structured acquisition and never invokes later stages", async () => {
    let later = 0;
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => success("STRUCTURED"), http: async () => { later++; return success("HTTP"); }, webOperator: async () => { later++; throw new Error("must not run"); } }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.stages.map((s) => s.stage)).toEqual(["STRUCTURED"]); expect(later).toBe(0);
  });
  it("escalates unsupported structured discovery to deterministic HTTP", async () => {
    let agent = 0;
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => failure("STRUCTURED", "UNSUPPORTED"), http: async () => success("HTTP"), webOperator: async () => { agent++; throw new Error(); } }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.stages.map((s) => s.stage)).toEqual(["STRUCTURED", "HTTP"]); expect(agent).toBe(0);
  });
  it("reuses an ACTIVE browser workflow without Web Operator", async () => {
    let agent = 0; let browser = 0;
    const active = workflow("wf-1", 1, success("BROWSER_WORKFLOW"));
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => failure("STRUCTURED", "UNSUPPORTED"), http: async () => failure("HTTP", "INSUFFICIENT"), lookupActiveWorkflow: async () => active, browserWorkflow: async () => { browser++; return active.execute(request).then((x) => x); }, webOperator: async () => { agent++; throw new Error(); } }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.activeWorkflow).toEqual({ id: "wf-1", version: 1 }); expect(browser).toBe(1); expect(agent).toBe(0);
  });
  it("discovers, validates, promotes, and acquires through a workflow when no active workflow exists", async () => {
    let calls = 0; let validated = false; let promoted = false;
    const candidate = workflow("wf-candidate", 1, success("BROWSER_WORKFLOW"));
    const active = workflow("wf-active", 1, success("BROWSER_WORKFLOW"));
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => failure("STRUCTURED", "UNSUPPORTED"), http: async () => failure("HTTP", "INSUFFICIENT"), webOperator: async () => { calls++; return { candidate: { ...candidate, state: "CANDIDATE" }, validate: async (c) => { validated = true; return { ...c, state: "VALIDATED" }; }, activate: async () => { promoted = true; return active; } }; } }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.candidateWorkflow?.promoted).toBe(true); expect(calls).toBe(1); expect(validated).toBe(true); expect(promoted).toBe(true);
  });
  it("repairs an active structural failure through a versioned candidate", async () => {
    const active = workflow("wf-1", 1, failure("BROWSER_WORKFLOW", "STRUCTURAL_FAILURE"));
    const repaired = workflow("wf-2", 2, success("BROWSER_WORKFLOW")); let agent = 0;
    const out = await new SourceAcquisitionOrchestrator({ lookupActiveWorkflow: async () => active, browserWorkflow: async () => active.execute(request), webOperator: async () => { agent++; return { candidate: { ...repaired, state: "CANDIDATE" }, validate: async (c) => ({ ...c, state: "VALIDATED" }), activate: async () => repaired }; } }).acquire(request);
    expect(out.status).toBe("SUCCESS"); expect(out.activeWorkflow).toEqual({ id: "wf-2", version: 2 }); expect(agent).toBe(1);
  });
  it("stops on policy denial and never invokes Web Operator", async () => {
    let agent = 0;
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => failure("STRUCTURED", "UNSUPPORTED"), http: async () => failure("HTTP", "POLICY_DENIED"), webOperator: async () => { agent++; throw new Error(); } }).acquire(request);
    expect(out.status).toBe("STOPPED"); expect(out.stopReason).toBe("POLICY_DENIED"); expect(agent).toBe(0);
  });
  it("keeps bounded network-policy evidence on a stopped stage", async () => {
    const out = await new SourceAcquisitionOrchestrator({ structured: async () => failure("STRUCTURED", "UNSUPPORTED"), http: async () => failure("HTTP", "INSUFFICIENT"), webOperator: async () => ({ stage: "WEB_OPERATOR", status: "POLICY_DENIED", reason: "browser network policy denied", details: { operation: "NAVIGATE_PUBLIC_PAGE", policy: { rule: "ORIGIN_NOT_ADMITTED", deniedHostname: "static.source.example.test", redirectHop: false, topLevelNavigation: false } } }) }).acquire(request);
    expect(out.stages.at(-1)?.operation).toBe("NAVIGATE_PUBLIC_PAGE");
    expect(out.stages.at(-1)?.policy).toEqual({ rule: "ORIGIN_NOT_ADMITTED", deniedHostname: "static.source.example.test", redirectHop: false, topLevelNavigation: false });
  });
});
