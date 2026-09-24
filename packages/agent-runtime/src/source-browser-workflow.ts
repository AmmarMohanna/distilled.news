import type { PublicBrowserObservation } from "./browser";
import {
  TemporalSourceAcquisition,
  type AcquiredSourceItem,
  type SourceAcquisitionAdapter,
  type SourceAcquisitionPage,
  type SourceAcquisitionRequest,
  type SourceAcquisitionResult
} from "./temporal-acquisition";

/** Validated, source-neutral instructions. Values are workflow data, never model-executable selectors. */
export interface SourceBrowserWorkflowPlan {
  version: 1;
  entryUrl: string;
  allowedOrigins: string[];
  articlePathPrefix: string;
  continuation:
    | { kind: "NEXT_LINK"; label: string; role?: "link" | "button"; terminalEvidence: "ABSENT_AFTER_VALIDATED_PAGINATION" | "UNPROVEN" }
    | { kind: "NONE"; terminalEvidence: "VALIDATED_SINGLE_PAGE" | "UNPROVEN" }
    | { kind: "SCROLL"; deltaY: number; terminalEvidence: "UNPROVEN" };
  /** Only a validator with chronological, non-sticky listing evidence may enable this. */
  lowerBoundary?: { kind: "VERIFIED_DESCENDING"; minimumConsecutiveOlderPages: number; evidenceObservationIds: string[] };
}

export interface SourceBrowserWorkflowPort {
  open(input: { sourceUrl: string; allowedOrigins: string[]; request: SourceAcquisitionRequest }): Promise<void>;
  navigateAndObserve(url: string): Promise<PublicBrowserObservation>;
  scrollAndObserve?(deltaY: number): Promise<PublicBrowserObservation>;
  close(): Promise<void>;
}

export interface SourceBrowserDiscoveryEvidence {
  sourceUrl: string;
  listing: PublicBrowserObservation;
  sampledArticles: PublicBrowserObservation[];
  afterScroll?: PublicBrowserObservation;
}

/** Compiles only trusted observed links and article metadata; model prose cannot supply identities or timestamps. */
export function compileSourceBrowserWorkflowPlan(evidence: SourceBrowserDiscoveryEvidence): SourceBrowserWorkflowPlan | undefined {
  const source = new URL(evidence.sourceUrl);
  if (source.protocol !== "https:" || new URL(evidence.listing.url).origin !== source.origin) return undefined;
  const articles = evidence.sampledArticles.map((observation) => observation.article).filter((article): article is NonNullable<PublicBrowserObservation["article"]> => Boolean(article));
  const canonicalUrls = [...new Set(articles.filter((article) =>
    article.body.trim().length > 0 && Number.isFinite(Date.parse(article.publisherTimestamp)) && sameAdmittedOrigin(article.canonicalUrl, [source.origin])
  ).map((article) => article.canonicalUrl))];
  if (canonicalUrls.length < 2) return undefined;
  const paths = canonicalUrls.map((url) => new URL(url).pathname.split("/").filter(Boolean));
  const common: string[] = [];
  for (let index = 0; index < Math.min(...paths.map((parts) => parts.length - 1)); index++) {
    if (!paths.every((parts) => parts[index] === paths[0][index])) break;
    common.push(paths[0][index]);
  }
  if (!common.length) return undefined;
  const next = evidence.listing.controls.find((control) => control.kind === "link" && control.destinationUrl &&
    /^(?:next|older)(?: page| stories| articles)?$/i.test(control.label.trim()) && sameAdmittedOrigin(control.destinationUrl, [source.origin]));
  const firstLinks = new Set(observedLinks(evidence.listing));
  const scrolledLinks = evidence.afterScroll ? observedLinks(evidence.afterScroll).filter((url) => !firstLinks.has(url)) : [];
  const continuation: SourceBrowserWorkflowPlan["continuation"] = next
    ? { kind: "NEXT_LINK", label: next.label, role: "link", terminalEvidence: "UNPROVEN" }
    : evidence.afterScroll && evidence.afterScroll.pageRevision !== evidence.listing.pageRevision && scrolledLinks.length > 0
      ? { kind: "SCROLL", deltaY: 1200, terminalEvidence: "UNPROVEN" }
      : { kind: "NONE", terminalEvidence: "UNPROVEN" };
  return { version: 1, entryUrl: source.href, allowedOrigins: [source.origin], articlePathPrefix: `/${common.join("/")}/`, continuation };
}

/** The temporal kernel owns budgets, deduplication, [start,end), coverage, and cleanup. */
export class DeterministicSourceBrowserWorkflowExecutor {
  constructor(private readonly port: SourceBrowserWorkflowPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(request: SourceAcquisitionRequest, plan: SourceBrowserWorkflowPlan): Promise<SourceAcquisitionResult> {
    validateSourceBrowserWorkflowPlan(plan, request);
    const adapter = new BrowserWorkflowPageAdapter(plan, this.port);
    const result = await new TemporalSourceAcquisition(this.clock).acquire(request, adapter);
    return { ...result, provenance: { mechanism: "deterministic_browser" } };
  }
}

/** Never promotes an unproven source end or a lone old/sticky item to coverage. */
class BrowserWorkflowPageAdapter implements SourceAcquisitionAdapter {
  readonly authentication = "PUBLIC" as const;
  private nextUrl?: string;
  private seenListings = new Set<string>();
  private seenArticles = new Set<string>();
  private consecutiveOlderPages = 0;
  private exhausted = false;
  private physicalAttempts = 0;
  private scrollDepth = 0;

  constructor(private readonly plan: SourceBrowserWorkflowPlan, private readonly port: SourceBrowserWorkflowPort) {}

  async open(request: SourceAcquisitionRequest): Promise<void> {
    this.nextUrl = this.plan.entryUrl;
    this.seenListings.clear();
    this.seenArticles.clear();
    this.consecutiveOlderPages = 0;
    this.exhausted = false;
    this.physicalAttempts = 0;
    this.scrollDepth = 0;
    await this.port.open({ sourceUrl: this.plan.entryUrl, allowedOrigins: this.plan.allowedOrigins, request });
  }

  async next(request: SourceAcquisitionRequest): Promise<SourceAcquisitionPage> {
    const listingUrl = this.nextUrl;
    if (!listingUrl) return { items: [], sourceExhausted: this.exhausted, paginationExhausted: !this.exhausted };
    if (this.physicalAttempts >= request.limits.maxPhysicalAttempts) return { items: [], stopReason: "EXECUTION_BUDGET_REACHED" };
    if (this.seenListings.has(listingUrl) && this.plan.continuation.kind !== "SCROLL") return { items: [], paginationExhausted: true };
    this.seenListings.add(listingUrl);
    this.physicalAttempts++;
    let pageAttempts = 1;
    let listing = await this.port.navigateAndObserve(listingUrl);
    let scrolls = 0;
    if (this.plan.continuation.kind === "SCROLL") {
      if (!this.port.scrollAndObserve) return { items: [], physicalAttempts: pageAttempts, stopReason: "STRUCTURAL_FAILURE" };
      for (let index = 0; index < this.scrollDepth; index++) {
        if (this.physicalAttempts >= request.limits.maxPhysicalAttempts) return { items: [], physicalAttempts: pageAttempts, scrolls, stopReason: "EXECUTION_BUDGET_REACHED" };
        listing = await this.port.scrollAndObserve(this.plan.continuation.deltaY);
        this.physicalAttempts++; pageAttempts++; scrolls++;
      }
    }
    if (listing.challengeState && listing.challengeState !== "NO_CHALLENGE") return { items: [], physicalAttempts: 1, stopReason: listing.challengeState === "LOGIN_REQUIRED" ? "AUTH_REQUIRED" : "CHALLENGE_REQUIRED" };
    if (!sameAdmittedOrigin(listing.url, this.plan.allowedOrigins)) throw new Error("source workflow listing origin denied");
    const articleUrls = [...new Set(observedLinks(listing)
      .filter((url): url is string => Boolean(url && isArticleUrl(url, this.plan))))]
      .filter((url) => !this.seenArticles.has(url));
    const items: AcquiredSourceItem[] = [];
    for (const url of articleUrls) {
      if (this.physicalAttempts >= request.limits.maxPhysicalAttempts) return { items, physicalAttempts: pageAttempts, stopReason: "EXECUTION_BUDGET_REACHED" };
      this.seenArticles.add(url);
      this.physicalAttempts++; pageAttempts++;
      const article = await this.port.navigateAndObserve(url);
      if (article.challengeState && article.challengeState !== "NO_CHALLENGE") return { items, physicalAttempts: pageAttempts, stopReason: article.challengeState === "LOGIN_REQUIRED" ? "AUTH_REQUIRED" : "CHALLENGE_REQUIRED" };
      if (!sameAdmittedOrigin(article.url, this.plan.allowedOrigins)) throw new Error("source workflow article origin denied");
      const item = trustedArticle(article, request, url);
      if (item) items.push(item);
    }
    const continuation = this.plan.continuation;
    const next = continuation.kind === "NEXT_LINK"
      ? listing.controls.find((control) => control.destinationUrl && control.label === continuation.label &&
          (!continuation.role || control.role === continuation.role) && sameAdmittedOrigin(control.destinationUrl, this.plan.allowedOrigins))?.destinationUrl
      : undefined;
    if (continuation.kind === "SCROLL" && articleUrls.length > 0) this.scrollDepth++;
    this.nextUrl = continuation.kind === "SCROLL" && articleUrls.length > 0 ? listingUrl : next && !this.seenListings.has(next) ? next : undefined;
    const timestamps = items.map((item) => Date.parse(item.publishedAt ?? "")).filter(Number.isFinite);
    const allOlder = items.length > 0 && timestamps.length === items.length && timestamps.every((time) => time < Date.parse(request.window.startTime));
    this.consecutiveOlderPages = allOlder ? this.consecutiveOlderPages + 1 : 0;
    const lowerBoundaryReached = Boolean(this.plan.lowerBoundary && this.consecutiveOlderPages >= this.plan.lowerBoundary.minimumConsecutiveOlderPages);
    const terminalProven = continuation.kind === "NONE"
      ? continuation.terminalEvidence === "VALIDATED_SINGLE_PAGE"
      : continuation.kind === "NEXT_LINK" && continuation.terminalEvidence === "ABSENT_AFTER_VALIDATED_PAGINATION" && this.seenListings.size > 1;
    this.exhausted = !this.nextUrl && terminalProven;
    return { items, physicalAttempts: pageAttempts, scrolls, lowerBoundaryReached, sourceExhausted: this.exhausted, paginationExhausted: !this.nextUrl && !this.exhausted };
  }

  async close(): Promise<void> { await this.port.close(); }
}

export function validateSourceBrowserWorkflowPlan(plan: SourceBrowserWorkflowPlan, request: SourceAcquisitionRequest): void {
  const entry = new URL(plan.entryUrl);
  const source = new URL(request.source.canonicalSourceUrl ?? request.source.resourceLocator ?? "");
  if (request.authentication !== undefined && request.authentication !== "PUBLIC") throw new Error("source workflow requires PUBLIC acquisition");
  if (entry.protocol !== "https:" || entry.origin !== source.origin || !plan.allowedOrigins.includes(entry.origin)) throw new Error("source workflow origin mismatch");
  if (!plan.articlePathPrefix.startsWith("/") || plan.articlePathPrefix.length > 256) throw new Error("invalid source workflow article prefix");
  if (plan.continuation.kind === "NEXT_LINK" && (!plan.continuation.label || plan.continuation.label.length > 120)) throw new Error("invalid source workflow continuation");
  if (plan.continuation.kind === "SCROLL" && (!Number.isInteger(plan.continuation.deltaY) || plan.continuation.deltaY < 1 || plan.continuation.deltaY > 2000)) throw new Error("invalid source workflow scroll");
  if (plan.lowerBoundary && (plan.lowerBoundary.minimumConsecutiveOlderPages < 2 || plan.lowerBoundary.evidenceObservationIds.length < 2)) throw new Error("unproven source workflow chronology");
  if (plan.allowedOrigins.some((origin) => new URL(origin).protocol !== "https:")) throw new Error("non-HTTPS source workflow origin");
}

function isArticleUrl(value: string, plan: SourceBrowserWorkflowPlan): boolean {
  try { const url = new URL(value); return sameAdmittedOrigin(value, plan.allowedOrigins) && url.pathname.startsWith(plan.articlePathPrefix) && url.href !== plan.entryUrl; }
  catch { return false; }
}

function observedLinks(observation: PublicBrowserObservation): string[] {
  return [...(observation.listingLinks ?? []), ...observation.controls.map((control) => control.destinationUrl).filter((url): url is string => Boolean(url))];
}

function sameAdmittedOrigin(value: string, allowed: string[]): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && allowed.includes(url.origin); }
  catch { return false; }
}

function trustedArticle(observation: PublicBrowserObservation, request: SourceAcquisitionRequest, originalUrl: string): AcquiredSourceItem | undefined {
  const article = observation.article;
  if (!article || !sameAdmittedOrigin(article.canonicalUrl, [new URL(originalUrl).origin])) return undefined;
  const publishedAt = Number.isFinite(Date.parse(article.publisherTimestamp)) ? new Date(article.publisherTimestamp).toISOString() : undefined;
  return {
    sourceResource: request.source.canonicalSourceUrl ?? request.source.resourceLocator ?? originalUrl,
    canonicalItemUrl: article.canonicalUrl,
    title: article.title,
    text: article.body,
    publishedAt,
    originalSourceReference: originalUrl,
    acquisitionEvidence: { mechanism: "trusted_browser_observation", pageRevision: observation.pageRevision, timestampSource: publishedAt ? "article_metadata" : "unavailable" }
  };
}
