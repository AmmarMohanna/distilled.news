import { describe, expect, it } from "vitest";
import { PublicSourceFetchFailure, PublicSourceStages, type PublicSourceFetchPort } from "../src/public-source-stages";
import type { SourceAcquisitionRequest } from "../src/temporal-acquisition";

const source = "https://publisher.example/news";
const request: SourceAcquisitionRequest = {
  source: { canonicalSourceUrl: source },
  window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" },
  acquisitionAsOf: "2026-09-23T00:00:00Z",
  limits: { maxItems: 10, maxPages: 3, maxScrolls: 3, maxPhysicalAttempts: 10, maxExecutionMs: 10_000 }
};
function fixture(pages: Record<string, { contentType: string; body: string }>) {
  const visits: string[] = [];
  const fetcher: PublicSourceFetchPort = { async get(url) {
    visits.push(url);
    const page = pages[url];
    return page ? { ...page, url, status: 200 } : { url, contentType: "text/plain", body: "", status: 404 };
  } };
  return { fetcher, visits };
}

describe("real public source capability stages", () => {
  it("does not invent a feed or HTTP article capability from a client-rendered shell", async () => {
    const { fetcher, visits } = fixture({ [source]: { contentType: "text/html", body: "<html><main id='app'></main></html>" } });
    const stages = new PublicSourceStages(fetcher);
    expect((await stages.structured(request)).status).toBe("UNSUPPORTED");
    expect((await stages.http(request)).status).toBe("INSUFFICIENT");
    expect(visits).toEqual([source]);
  });

  it("recognizes a native feed from actual response and runs the temporal kernel", async () => {
    const feed = "https://publisher.example/feed.xml";
    const { fetcher, visits } = fixture({
      [source]: { contentType: "text/html", body: `<link href="${feed}" rel="alternate" type="application/rss+xml">` },
      [feed]: { contentType: "application/rss+xml", body: `<rss><channel><item><title>A</title><description>Full A</description><link>https://publisher.example/a</link><pubDate>2026-09-21T00:00:00Z</pubDate></item><item><title>Old</title><description>Full old</description><link>https://publisher.example/old</link><pubDate>2026-09-19T00:00:00Z</pubDate></item></channel></rss>` }
    });
    const outcome = await new PublicSourceStages(fetcher).structured(request);
    expect(outcome.status).toBe("SUCCESS");
    expect(outcome.result?.items.map((item) => item.canonicalItemUrl)).toEqual(["https://publisher.example/a"]);
    expect(outcome.result?.coverage.rangeCovered).toBe(true);
    expect(visits).toEqual([source, feed]);
  });

  it("attempts HTML article extraction but escalates when pagination is unproven", async () => {
    const article = "https://publisher.example/article/a";
    const { fetcher, visits } = fixture({
      [source]: { contentType: "text/html", body: `<article><a href="${article}">A</a></article>` },
      [article]: { contentType: "text/html", body: `<link rel="canonical" href="${article}"><meta property="article:published_time" content="2026-09-21T00:00:00Z"><h1>A</h1><article>Full body A</article>` }
    });
    const outcome = await new PublicSourceStages(fetcher).http(request);
    expect(outcome.status).toBe("INSUFFICIENT");
    expect(visits).toEqual([source, source, article]);
  });

  it("distinguishes bounded HTTP insufficiency from transient network failure", async () => {
    const oversized = new PublicSourceStages({ async get() { throw new PublicSourceFetchFailure("BODY_BUDGET_EXCEEDED"); } });
    expect(await oversized.structured(request)).toMatchObject({ stage: "STRUCTURED", status: "INSUFFICIENT", reason: "source_body_budget_exceeded" });
    expect(await oversized.http(request)).toMatchObject({ stage: "HTTP", status: "INSUFFICIENT", reason: "source_body_budget_exceeded" });
    const network = new PublicSourceStages({ async get() { throw new PublicSourceFetchFailure("NETWORK_FAILURE"); } });
    expect(await network.structured(request)).toMatchObject({ status: "TRANSIENT_FAILURE", reason: "source_network_failure" });
  });
});
