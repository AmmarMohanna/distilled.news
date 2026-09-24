import { HttpHtmlSourceAcquisitionAdapter, type HttpHtmlSourceWorkflow } from "./http-html-acquisition";
import { RssFeedSourceAcquisitionAdapter } from "./rss-acquisition";
import { TemporalSourceAcquisition, type AcquiredSourceItem, type SourceAcquisitionRequest } from "./temporal-acquisition";
import type { AcquisitionStageOutcome } from "./source-acquisition-orchestrator";

export interface PublicSourceFetchPort { get(url: string): Promise<{ url: string; contentType: string; body: string; status: number }> }
export class PublicSourcePolicyError extends Error { constructor() { super("public source policy denied"); } }
export class PublicSourceFetchFailure extends Error {
  constructor(readonly category: "BODY_BUDGET_EXCEEDED" | "FETCH_REJECTED" | "FETCH_TIMEOUT" | "BODY_STREAM_FAILURE") { super(category); }
}

/** Actual, bounded capability assessment: a stage never reports an invented outcome. */
export class PublicSourceStages {
  private document?: Promise<Awaited<ReturnType<PublicSourceFetchPort["get"]>>>;
  constructor(private readonly fetcher: PublicSourceFetchPort, private readonly clock: () => Date = () => new Date()) {}

  async structured(request: SourceAcquisitionRequest): Promise<AcquisitionStageOutcome> {
    const source = sourceUrl(request);
    let document: Awaited<ReturnType<PublicSourceFetchPort["get"]>>;
    try { document = await this.load(source); }
    catch (error) { return fetchFailure("STRUCTURED", error); }
    const feed = directFeed(document) ? source : discoveredFeed(document.body, source);
    if (!feed) return { stage: "STRUCTURED", status: "UNSUPPORTED", reason: "no native feed discovered" };
    try {
      const result = await new TemporalSourceAcquisition(this.clock).acquire({ ...request, source: { ...request.source, resourceLocator: feed } }, new RssFeedSourceAcquisitionAdapter(this.feedFetch));
      return result.coverage.rangeCovered && result.items.every((item) => Boolean(item.text && item.publishedAt))
        ? { stage: "STRUCTURED", status: "SUCCESS", result }
        : { stage: "STRUCTURED", status: "INSUFFICIENT", reason: "feed does not prove the requested range or full content" };
    } catch (error) { return fetchFailure("STRUCTURED", error); }
  }

  async http(request: SourceAcquisitionRequest): Promise<AcquisitionStageOutcome> {
    const source = sourceUrl(request);
    let document: Awaited<ReturnType<PublicSourceFetchPort["get"]>>;
    try { document = await this.load(source); }
    catch (error) { return fetchFailure("HTTP", error); }
    if (!document.contentType.toLowerCase().includes("html")) return { stage: "HTTP", status: "UNSUPPORTED", reason: "source is not HTML" };
    if (!articleLinks(document.body, source).length) return { stage: "HTTP", status: "INSUFFICIENT", reason: "no deterministic listing article links" };
    const workflow: HttpHtmlSourceWorkflow = {
      listingUrl: (_request, page) => page === 1 ? source : source,
      parseListing: (html, url) => {
        const nextUrl = nextPage(html, url);
        return { articleUrls: articleLinks(html, url), nextUrl, paginationExhausted: !nextUrl };
      },
      parseArticle: (html, url) => parseStructuredHtmlArticle(html, url, source)
    };
    try {
      const result = await new TemporalSourceAcquisition(this.clock).acquire(request, new HttpHtmlSourceAcquisitionAdapter(workflow, this.httpFetch, Math.min(25, request.limits.maxItems)));
      return result.coverage.rangeCovered && result.items.every((item) => Boolean(item.text && item.publishedAt))
        ? { stage: "HTTP", status: "SUCCESS", result }
        : { stage: "HTTP", status: "INSUFFICIENT", reason: "HTML listing could not prove complete dated content" };
    } catch (error) { return fetchFailure("HTTP", error); }
  }

  private load(url: string) { return this.document ??= this.fetcher.get(url); }
  private readonly feedFetch: typeof fetch = async (input) => {
    const result = await this.fetcher.get(String(input));
    return new Response(result.body, { status: result.status, headers: { "content-type": result.contentType } });
  };
  private readonly httpFetch: typeof fetch = async (input) => {
    const result = await this.fetcher.get(String(input));
    return new Response(result.body, { status: result.status, headers: { "content-type": result.contentType } });
  };
}

function fetchFailure(stage: "STRUCTURED" | "HTTP", error: unknown): AcquisitionStageOutcome {
  if (error instanceof PublicSourcePolicyError) return { stage, status: "POLICY_DENIED", reason: "source_policy_denied" };
  if (error instanceof PublicSourceFetchFailure && error.category === "BODY_BUDGET_EXCEEDED") return { stage, status: "INSUFFICIENT", reason: "source_body_budget_exceeded" };
  return { stage, status: "TRANSIENT_FAILURE", reason: error instanceof PublicSourceFetchFailure ? `source_${error.category.toLowerCase()}` : "source_http_extraction_failure" };
}

function sourceUrl(request: SourceAcquisitionRequest): string {
  const source = request.source.canonicalSourceUrl ?? request.source.resourceLocator;
  if (!source) throw new Error("public source URL is required");
  return new URL(source).href;
}
function directFeed(value: { contentType: string; body: string }): boolean {
  return /(?:rss|atom|xml)/i.test(value.contentType) && /^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed)\b/i.test(value.body);
}
function discoveredFeed(html: string, base: string): string | undefined {
  for (const match of html.matchAll(/<link\b[^>]{0,1200}>/gi)) {
    const attrs = attributes(match[0]);
    if (!/\balternate\b/i.test(attrs.rel ?? "") || !/(?:rss|atom|xml)/i.test(attrs.type ?? "") || !attrs.href) continue;
    const url = new URL(attrs.href, base);
    if (url.protocol === "https:" && url.origin === new URL(base).origin) return url.href;
  }
  return undefined;
}
function articleLinks(html: string, base: string): string[] {
  const links: string[] = [];
  for (const block of html.matchAll(/<article\b[^>]*>[\s\S]{0,20000}?<\/article>/gi)) {
    for (const anchor of block[0].matchAll(/<a\b[^>]{0,1200}>/gi)) {
      const href = attributes(anchor[0]).href;
      if (!href) continue;
      try { const url = new URL(href, base); if (url.protocol === "https:" && url.origin === new URL(base).origin) links.push(url.href); } catch { /* ignore malformed link */ }
    }
  }
  return [...new Set(links)];
}
function nextPage(html: string, base: string): string | undefined {
  for (const match of html.matchAll(/<(?:link|a)\b[^>]{0,1200}>/gi)) {
    const attrs = attributes(match[0]);
    if (!/\bnext\b/i.test(attrs.rel ?? "") || !attrs.href) continue;
    try { const url = new URL(attrs.href, base); if (url.protocol === "https:" && url.origin === new URL(base).origin) return url.href; } catch { /* ignore malformed next */ }
  }
  return undefined;
}
function parseStructuredHtmlArticle(html: string, url: string, source: string): AcquiredSourceItem | undefined {
  const canonical = [...html.matchAll(/<link\b[^>]{0,1200}>/gi)].map((match) => attributes(match[0])).find((attrs) => /\bcanonical\b/i.test(attrs.rel ?? ""))?.href;
  const date = [...html.matchAll(/<meta\b[^>]{0,1200}>/gi)].map((match) => attributes(match[0])).find((attrs) => ["article:published_time", "datepublished"].includes((attrs.property ?? attrs.name ?? "").toLowerCase()))?.content;
  const article = html.match(/<article\b[^>]*>([\s\S]{0,200000}?)<\/article>/i)?.[1];
  if (!article || !date || !Number.isFinite(Date.parse(date))) return undefined;
  const canonicalUrl = new URL(canonical ?? url, url);
  if (canonicalUrl.origin !== new URL(source).origin) return undefined;
  const title = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const text = article.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return { sourceResource: source, canonicalItemUrl: canonicalUrl.href, title, text, publishedAt: new Date(date).toISOString(), originalSourceReference: url, acquisitionEvidence: { mechanism: "deterministic_http_html", timestampSource: "article_published_meta" } };
}
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) result[match[1].toLowerCase()] = match[3];
  return result;
}
