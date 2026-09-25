import type { SourceAcquisitionRequest } from "./temporal-acquisition";
import type { CandidateWorkflowHandle } from "./source-acquisition-orchestrator";
import type { PublicAcquisitionCapability, WebOperatorDiscoveryPort } from "./production-web-operator-adapter";

/** Agent proposals are untrusted. The compiler must verify each claim against Distilled observations. */
export interface BrowserUseDiscoveryProposal {
  protocol: "distilled.browser-use.discovery.v1";
  runId: string;
  visitedUrls: string[];
  listingUrls: string[];
  articleUrls: string[];
  continuation: "none" | "pagination" | "load_more" | "scroll";
  timestampHints: string[];
  steps: number;
  challengeObserved: boolean;
}

export interface BrowserUseDiscoveryTransport {
  discover(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }): Promise<BrowserUseDiscoveryProposal>;
}

export interface BrowserUseProposalCompiler {
  compile(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability; proposal: BrowserUseDiscoveryProposal }): Promise<CandidateWorkflowHandle>;
}

/** Plugs into the existing production adapter and its Distilled-owned lifecycle. */
export class BrowserUseDiscoveryBackend implements WebOperatorDiscoveryPort {
  constructor(private readonly transport: BrowserUseDiscoveryTransport, private readonly compiler: BrowserUseProposalCompiler) {}

  async discover(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }) {
    const proposal = await this.transport.discover(input);
    assertBoundedProposal(proposal, input.capability);
    if (proposal.challengeObserved) throw new Error("browser_use_challenge_requires_distilled_challenge_handling");
    const candidate = await this.compiler.compile({ ...input, proposal });
    return { candidate, runId: proposal.runId, modelCalls: proposal.steps, browserOperations: proposal.steps };
  }
}

export function assertBoundedProposal(proposal: BrowserUseDiscoveryProposal, capability: PublicAcquisitionCapability): void {
  if (!proposal || proposal.protocol !== "distilled.browser-use.discovery.v1" || proposal.runId !== capability.runId || !Number.isInteger(proposal.steps) || proposal.steps < 0 || proposal.steps > 32 || !Array.isArray(proposal.visitedUrls) || !Array.isArray(proposal.listingUrls) || !Array.isArray(proposal.articleUrls) || !Array.isArray(proposal.timestampHints)) throw new Error("invalid_browser_use_proposal");
  const urls = [...proposal.visitedUrls, ...proposal.listingUrls, ...proposal.articleUrls];
  if (urls.length > 96 || proposal.visitedUrls.length > 32 || proposal.timestampHints.length > 32 || proposal.timestampHints.some(value => typeof value !== "string" || value.length > 128) || !["none", "pagination", "load_more", "scroll"].includes(proposal.continuation)) throw new Error("invalid_browser_use_proposal");
  for (const value of urls) {
    let url: URL;
    if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_browser_use_proposal");
    try { url = new URL(value); } catch { throw new Error("invalid_browser_use_proposal"); }
    if (url.protocol !== "https:" || url.username || url.password || !capability.allowedOrigins.includes(url.origin)) throw new Error("browser_use_origin_denied");
  }
  if (proposal.listingUrls.some(url => !proposal.visitedUrls.includes(url)) || proposal.articleUrls.some(url => !proposal.visitedUrls.includes(url))) throw new Error("browser_use_unvisited_claim");
}
