import type { SourceAcquisitionRequest } from "./temporal-acquisition";
import type { CandidateWorkflowHandle } from "./source-acquisition-orchestrator";
import type { PublicAcquisitionCapability, WebOperatorDiscoveryPort } from "./production-web-operator-adapter";
import type { SourceBrowserWorkflowPort, SourceBrowserWorkflowPlan } from "./source-browser-workflow";
import { compileSourceBrowserWorkflowPlan } from "./source-browser-workflow";
import type { PublicBrowserObservation } from "./browser";

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
  modelCalls?: number;
  browserActions?: number;
  agentBrowserActions?: number;
  challengeObserved: boolean;
}

export interface BrowserUseDiscoveryTransport {
  discover(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }): Promise<BrowserUseDiscoveryProposal>;
}

export interface BrowserUseProposalCompiler {
  compile(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability; proposal: BrowserUseDiscoveryProposal }): Promise<CandidateWorkflowHandle>;
}
export class BrowserUseTrustedChallengeError extends Error {
  constructor(readonly observation: PublicBrowserObservation) { super("browser_use_trusted_challenge_required"); }
}
export class BrowserUseEvidenceError extends Error {
  constructor(readonly counts: { proposalArticles: number; visitedPages: number; observedLinks: number; trustedArticles: number; scrollObservations: number; continuation: BrowserUseDiscoveryProposal["continuation"] }) {
    super("browser_use_trusted_evidence_insufficient");
    this.name = "BrowserUseEvidenceError";
  }
}

/** Plugs into the existing production adapter and its Distilled-owned lifecycle. */
export class BrowserUseDiscoveryBackend implements WebOperatorDiscoveryPort {
  constructor(private readonly transport: BrowserUseDiscoveryTransport, private readonly compiler?: BrowserUseProposalCompiler) {}

  async propose(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }): Promise<BrowserUseDiscoveryProposal> {
    const proposal = await this.transport.discover(input);
    assertBoundedProposal(proposal, input.capability);
    return proposal;
  }

  async discover(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }) {
    const proposal = await this.propose(input);
    if (proposal.challengeObserved) throw new Error("browser_use_challenge_requires_distilled_challenge_handling");
    if (!this.compiler) throw new Error("browser_use_compiler_unconfigured");
    const candidate = await this.compiler.compile({ ...input, proposal });
    return { candidate, runId: proposal.runId, modelCalls: proposal.modelCalls ?? proposal.steps, browserOperations: proposal.browserActions ?? proposal.steps };
  }
}

export function assertBoundedProposal(proposal: BrowserUseDiscoveryProposal, capability: PublicAcquisitionCapability): void {
  if (!proposal || proposal.protocol !== "distilled.browser-use.discovery.v1" || proposal.runId !== capability.runId || !Number.isInteger(proposal.steps) || proposal.steps < 0 || proposal.steps > 32 || !Array.isArray(proposal.visitedUrls) || !Array.isArray(proposal.listingUrls) || !Array.isArray(proposal.articleUrls) || !Array.isArray(proposal.timestampHints)) throw new Error("invalid_browser_use_proposal");
  for (const [value, maximum] of [[proposal.modelCalls, 32], [proposal.browserActions, 64], [proposal.agentBrowserActions, 32]] as const)
    if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > maximum)) throw new Error("invalid_browser_use_proposal");
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

/** Re-observes agent hints through Distilled's fenced CDP port; never trusts model article data. */
export async function verifyBrowserUseProposal(input: {
  request: SourceAcquisitionRequest;
  capability: PublicAcquisitionCapability;
  proposal: BrowserUseDiscoveryProposal;
  port: SourceBrowserWorkflowPort;
}): Promise<{ plan: SourceBrowserWorkflowPlan; listing: PublicBrowserObservation; articles: PublicBrowserObservation[]; afterScroll?: PublicBrowserObservation }> {
  const { request, capability, proposal, port } = input;
  assertBoundedProposal(proposal, capability);
  const sourceUrl = request.source.canonicalSourceUrl ?? request.source.resourceLocator;
  if (!sourceUrl || !capability.allowedOrigins.includes(new URL(sourceUrl).origin)) throw new Error("browser_use_source_denied");
  const listingUrl = proposal.listingUrls[0] ?? sourceUrl;
  await port.open({ sourceUrl, allowedOrigins: capability.allowedOrigins, request });
  try {
    const listing = await port.navigateAndObserve(listingUrl);
    assertTrustedObservation(listing, listingUrl, capability);
    let afterScroll: PublicBrowserObservation | undefined;
    let scrollObservations = 0;
    const observedLinks = new Set<string>();
    const addLinks = (observation: PublicBrowserObservation) => {
      for (const value of [...(observation.listingLinks ?? []), ...observation.controls.map(control => control.destinationUrl)])
        if (typeof value === "string") observedLinks.add(value);
    };
    addLinks(listing);
    // The continuation label is a model hypothesis. Re-observe when its
    // claimed article links are absent from the trusted initial listing.
    if (port.scrollAndObserve && (proposal.continuation === "scroll" || proposal.articleUrls.filter(url => observedLinks.has(url)).length < 2)) {
      for (let index = 0; index < Math.min(request.limits.maxScrolls, 3); index++) {
        afterScroll = await port.scrollAndObserve(1200);
        scrollObservations++;
        assertTrustedObservation(afterScroll, listingUrl, capability);
        addLinks(afterScroll);
        if (proposal.articleUrls.filter(url => observedLinks.has(url)).length >= 2) break;
      }
    }
    const articles: PublicBrowserObservation[] = [];
    for (const url of proposal.articleUrls.slice(0, Math.min(8, request.limits.maxPhysicalAttempts - 1))) {
      if (!observedLinks.has(url)) continue;
      const observation = await port.navigateAndObserve(url);
      assertTrustedObservation(observation, url, capability);
      if (observation.article?.body && Number.isFinite(Date.parse(observation.article.publisherTimestamp)) &&
        capability.allowedOrigins.includes(new URL(observation.article.canonicalUrl).origin)) articles.push(observation);
      if (articles.length >= 2) break;
    }
    const plan = compileSourceBrowserWorkflowPlan({ sourceUrl: listingUrl, listing, sampledArticles: articles, afterScroll });
    if (!plan) throw new BrowserUseEvidenceError({ proposalArticles: proposal.articleUrls.length, visitedPages: proposal.visitedUrls.length, observedLinks: observedLinks.size, trustedArticles: articles.length, scrollObservations, continuation: proposal.continuation });
    return { plan, listing, articles, afterScroll };
  } finally { await port.close(); }
}

function assertTrustedObservation(observation: PublicBrowserObservation, expectedUrl: string, capability: PublicAcquisitionCapability): void {
  if (!capability.allowedOrigins.includes(new URL(observation.url).origin) ||
      !capability.allowedOrigins.includes(new URL(expectedUrl).origin)) throw new Error("browser_use_observation_origin_denied");
  if (observation.challengeState && observation.challengeState !== "NO_CHALLENGE") throw new BrowserUseTrustedChallengeError(observation);
}
