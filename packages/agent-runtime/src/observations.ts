import type {
  AgentPageState,
  AgentRunBudgetLimits,
  ArtifactReference,
  ObservationDelta,
  ObservationEnvelope,
  SemanticControl,
  ToolName
} from "./contracts";

export interface ArtifactStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<ArtifactReference>;
  get(ref: string): Promise<Uint8Array | null>;
}

export class MemoryArtifactStore implements ArtifactStore {
  private readonly values = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<ArtifactReference> {
    const copy = bytes.slice();
    this.values.set(key, copy);
    return { ref: key, hash: await sha256Bytes(copy), size: copy.byteLength };
  }

  async get(ref: string): Promise<Uint8Array | null> {
    return this.values.get(ref)?.slice() ?? null;
  }
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

export interface EnvelopeInput {
  id: string;
  runId: string;
  turnId: string;
  toolCallId: string;
  browserSessionId: string;
  browserGeneration: number;
  pageId: string;
  pageRevision: string;
  originUrl: string;
  finalUrl?: string;
  contentType: string;
  representationType: ObservationEnvelope["representationType"];
  rawBytes: Uint8Array;
  modelRepresentation: unknown;
  maxPresentedBytes?: number;
  redactions?: string[];
  retrievedAt?: string;
}

export async function createObservationEnvelope(store: ArtifactStore, input: EnvelopeInput): Promise<ObservationEnvelope> {
  const max = input.maxPresentedBytes ?? 16_384;
  const raw = await store.put(`observations/${input.runId}/${input.id}/raw`, input.rawBytes, input.contentType);
  let presentedText = JSON.stringify(input.modelRepresentation);
  const originalPresentedSize = new TextEncoder().encode(presentedText).byteLength;
  const truncated = originalPresentedSize > max;
  if (truncated) {
    const excerpt = presentedText.slice(0, Math.max(0, max - 96));
    presentedText = JSON.stringify({ __truncated__: true, originalPresentedSize, excerpt });
  }
  const presentedBytes = new TextEncoder().encode(presentedText);
  const presented = await store.put(
    `observations/${input.runId}/${input.id}/presented`,
    presentedBytes,
    "application/json"
  );
  const url = new URL(input.originUrl);
  return {
    id: input.id,
    runId: input.runId,
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    browserSessionId: input.browserSessionId,
    browserGeneration: input.browserGeneration,
    pageId: input.pageId,
    pageRevision: input.pageRevision,
    originUrl: input.originUrl,
    originDomain: url.hostname,
    finalUrl: input.finalUrl,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    contentType: input.contentType,
    trustClassification: "UNTRUSTED_EXTERNAL",
    representationType: input.representationType,
    raw,
    presented,
    originalSize: input.rawBytes.byteLength,
    presentedSize: presentedBytes.byteLength,
    truncated,
    transformationVersion: "observation-sanitize-v1",
    redactions: [...(input.redactions ?? [])],
    modelRepresentation: JSON.parse(presentedText)
  };
}

export interface PageStateProjectionInput {
  url: string;
  title: string;
  pageRevision: string;
  controls?: SemanticControl[];
  article?: AgentPageState["article"];
  watermarkObserved?: boolean;
  exhausted?: boolean;
  challengeState: AgentPageState["challengeState"];
  progress: AgentPageState["progress"];
  remainingBudget: AgentRunBudgetLimits;
  policyVisibleCapabilities: ToolName[];
}

export function projectPageState(input: PageStateProjectionInput): AgentPageState {
  const pageType = input.challengeState !== "NO_CHALLENGE"
    ? "challenge"
    : input.article?.title
      ? "article"
      : (input.controls?.length ?? 0) > 0
        ? "listing"
        : "unknown";
  return {
    url: input.url,
    title: input.title,
    pageType,
    pageRevision: input.pageRevision,
    relevantControls: (input.controls ?? []).slice(0, 40),
    article: input.article,
    pagination: {
      watermarkObserved: input.watermarkObserved ?? false,
      exhausted: input.exhausted ?? false
    },
    challengeState: input.challengeState,
    progress: { ...input.progress },
    remainingBudget: { ...input.remainingBudget },
    policyVisibleCapabilities: [...input.policyVisibleCapabilities]
  };
}

export function diffPageState(
  priorObservationId: string,
  prior: AgentPageState,
  nextObservationId: string,
  next: AgentPageState
): ObservationDelta {
  const changed: Partial<AgentPageState> = {};
  for (const key of ["url", "title", "pageType", "pageRevision", "article", "pagination", "challengeState", "progress"] as const) {
    if (JSON.stringify(prior[key]) !== JSON.stringify(next[key])) (changed as Record<string, unknown>)[key] = next[key];
  }
  const priorHandles = new Set(prior.relevantControls.map((control) => control.handle));
  const nextHandles = new Set(next.relevantControls.map((control) => control.handle));
  return {
    fromObservationId: priorObservationId,
    toObservationId: nextObservationId,
    changed,
    removedControls: prior.relevantControls.filter((control) => !nextHandles.has(control.handle)).map((control) => control.handle),
    addedControls: next.relevantControls.filter((control) => !priorHandles.has(control.handle))
  };
}
