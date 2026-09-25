import {
  TemporalSourceAcquisition,
  type AcquiredSourceItem,
  type SourceAcquisitionAdapter,
  type SourceAcquisitionPage,
  type SourceAcquisitionRequest,
  type SourceAcquisitionResult
} from "./temporal-acquisition";

/**
 * Persisted, source-neutral instructions for replaying an authenticated
 * listing/timeline.  Site adapters provide trusted observations; the executor
 * never asks a model to interpret a page during replay.
 */
export interface AuthenticatedSourceWorkflowPlan {
  version: 1;
  entryUrl: string;
  allowedOrigins: string[];
  continuation:
    | { kind: "SCROLL"; deltaY: number; terminalEvidence: "START_BOUNDARY_OR_EXHAUSTION" | "UNPROVEN" }
    | { kind: "NEXT_LINK"; label: string; terminalEvidence: "ABSENT_AFTER_VALIDATED_PAGINATION" | "UNPROVEN" }
    | { kind: "NONE"; terminalEvidence: "VALIDATED_SINGLE_PAGE" | "UNPROVEN" };
  readOnly: true;
}

export interface AuthenticatedSourceTimelineObservation {
  url: string;
  pageRevision: string;
  items: AcquiredSourceItem[];
  continuation?: { label: string; destinationUrl?: string };
  sourceExhausted?: boolean;
  lowerBoundaryReached?: boolean;
  challengeState?: "NO_CHALLENGE" | "LOGIN_REQUIRED" | "CHALLENGE_REQUIRED";
}

/** The authenticated browser bridge owns session restore and never receives secrets here. */
export interface AuthenticatedSourceWorkflowPort {
  open(input: { sourceUrl: string; allowedOrigins: string[]; request: SourceAcquisitionRequest }): Promise<void>;
  observe(): Promise<AuthenticatedSourceTimelineObservation>;
  scrollAndObserve?(deltaY: number): Promise<AuthenticatedSourceTimelineObservation>;
  followContinuation?(destinationUrl: string): Promise<AuthenticatedSourceTimelineObservation>;
  close(): Promise<void>;
}

export class DeterministicAuthenticatedSourceWorkflowExecutor {
  constructor(private readonly port: AuthenticatedSourceWorkflowPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(request: SourceAcquisitionRequest, plan: AuthenticatedSourceWorkflowPlan): Promise<SourceAcquisitionResult> {
    validateAuthenticatedSourceWorkflowPlan(plan, request);
    const result = await new TemporalSourceAcquisition(this.clock).acquire(request, new AuthenticatedWorkflowPageAdapter(plan, this.port));
    return { ...result, provenance: { ...(result.provenance ?? {}), mechanism: "deterministic_authenticated_browser" } };
  }
}

class AuthenticatedWorkflowPageAdapter implements SourceAcquisitionAdapter {
  readonly authentication = "AUTH_REQUIRED" as const;
  private observation?: AuthenticatedSourceTimelineObservation;
  private done = false;
  private scrolls = 0;

  constructor(private readonly plan: AuthenticatedSourceWorkflowPlan, private readonly port: AuthenticatedSourceWorkflowPort) {}

  async open(request: SourceAcquisitionRequest): Promise<void> {
    this.observation = undefined;
    this.done = false;
    this.scrolls = 0;
    await this.port.open({ sourceUrl: this.plan.entryUrl, allowedOrigins: this.plan.allowedOrigins, request });
  }

  async next(request: SourceAcquisitionRequest): Promise<SourceAcquisitionPage> {
    if (this.done) return { items: [], sourceExhausted: true };
    let current = this.observation ? await this.advance() : await this.port.observe();
    this.observation = current;
    if (!sameOrigin(current.url, this.plan.allowedOrigins)) return { items: [], stopReason: "STRUCTURAL_FAILURE" };
    if (current.challengeState === "LOGIN_REQUIRED" || current.challengeState === "CHALLENGE_REQUIRED") {
      return { items: [], stopReason: current.challengeState === "LOGIN_REQUIRED" ? "AUTH_REQUIRED" : "CHALLENGE_REQUIRED" };
    }
    if (current.sourceExhausted || current.lowerBoundaryReached) this.done = true;
    const result: SourceAcquisitionPage = {
      items: current.items,
      lowerBoundaryReached: current.lowerBoundaryReached,
      sourceExhausted: current.sourceExhausted,
      scrolls: this.scrolls
    };
    this.scrolls = 0;
    if (this.plan.continuation.kind === "NONE" && !current.sourceExhausted && !current.lowerBoundaryReached) {
      result.paginationExhausted = true;
      this.done = true;
    }
    return result;
  }

  private async advance(): Promise<AuthenticatedSourceTimelineObservation> {
    const continuation = this.plan.continuation;
    if (continuation.kind === "SCROLL") {
      if (!this.port.scrollAndObserve || this.scrolls >= 100) {
        this.done = true;
        return { ...this.observation!, items: [], sourceExhausted: false };
      }
      this.scrolls++;
      return this.port.scrollAndObserve(continuation.deltaY);
    }
    if (continuation.kind === "NEXT_LINK") {
      const next = this.observation?.continuation;
      if (!next || next.label !== continuation.label || !next.destinationUrl || !this.port.followContinuation) {
        this.done = true;
        return { ...this.observation!, items: [], sourceExhausted: continuation.terminalEvidence === "ABSENT_AFTER_VALIDATED_PAGINATION" };
      }
      return this.port.followContinuation(next.destinationUrl);
    }
    this.done = true;
    return { ...this.observation!, items: [], sourceExhausted: continuation.terminalEvidence === "VALIDATED_SINGLE_PAGE" };
  }

  async close(): Promise<void> { await this.port.close(); }
}

export function validateAuthenticatedSourceWorkflowPlan(plan: AuthenticatedSourceWorkflowPlan, request: SourceAcquisitionRequest): void {
  if (request.authentication !== "AUTH_REQUIRED") throw new Error("authenticated workflow requires AUTH_REQUIRED acquisition");
  const source = new URL(request.source.canonicalSourceUrl ?? request.source.resourceLocator ?? "");
  const entry = new URL(plan.entryUrl);
  if (entry.protocol !== "https:" || entry.origin !== source.origin || !plan.allowedOrigins.includes(entry.origin)) throw new Error("authenticated workflow origin mismatch");
  if (plan.readOnly !== true || plan.allowedOrigins.some((origin) => new URL(origin).protocol !== "https:")) throw new Error("authenticated workflow must be HTTPS read-only");
  if (plan.continuation.kind === "SCROLL" && (!Number.isInteger(plan.continuation.deltaY) || plan.continuation.deltaY < 1 || plan.continuation.deltaY > 2000)) throw new Error("invalid authenticated workflow scroll");
  if (plan.continuation.kind === "NEXT_LINK" && (!plan.continuation.label || plan.continuation.label.length > 120)) throw new Error("invalid authenticated workflow continuation");
}

function sameOrigin(value: string, allowed: string[]): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && allowed.includes(url.origin); } catch { return false; }
}
