import { describe, expect, it } from "vitest";
import { buildGoogleNewsRssUrl, parseGoogleNewsRssFeed, parseRssFeed } from "../src";

describe("parseRssFeed", () => {
  it("normalizes RSS items with publisher evidence links", () => {
    const messages = parseRssFeed(
      `<?xml version="1.0"?>
      <rss><channel>
        <title>Example Wire</title>
        <item>
          <title>Power grid repaired in Beirut</title>
          <link>https://example.com/power</link>
          <guid>power-1</guid>
          <pubDate>Tue, 16 Jun 2026 10:00:00 GMT</pubDate>
          <description><![CDATA[Officials said service resumed after repairs.]]></description>
          <media:thumbnail url="https://example.com/power.jpg" />
        </item>
      </channel></rss>`,
      {
        sourceId: "source_rss",
        sourceTitle: "Example",
        sourceUrl: "https://example.com/feed.xml",
        receivedAt: new Date("2026-06-16T10:05:00.000Z")
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: {
        id: "source_rss",
        title: "Example Wire",
        provider: "rss",
        kind: "rss_feed"
      },
      sourceUrl: "https://example.com/power"
    });
    expect(messages[0].text).toContain("Power grid repaired");
    expect(messages[0].links).toEqual(["https://example.com/power"]);
    expect(messages[0].media).toEqual([{ type: "photo", url: "https://example.com/power.jpg", label: "feed image" }]);
  });

  it("normalizes Google News RSS items with publisher attribution", () => {
    const messages = parseGoogleNewsRssFeed(
      `<?xml version="1.0"?>
      <rss><channel>
        <title>"central bank lebanon" - Google News</title>
        <item>
          <title>Central bank announces a new circular - Reuters</title>
          <link>https://news.google.com/rss/articles/example?oc=5</link>
          <guid isPermaLink="false">google-news-1</guid>
          <pubDate>Tue, 16 Jun 2026 08:01:00 GMT</pubDate>
          <description>&lt;a href="https://news.google.com/rss/articles/example?oc=5"&gt;Central bank announces a new circular&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font&gt;Reuters&lt;/font&gt;</description>
          <source url="https://www.reuters.com">Reuters</source>
        </item>
      </channel></rss>`,
      {
        sourceId: "source_google_news",
        sourceTitle: "Google News: central bank lebanon",
        sourceUrl: "https://news.google.com/rss/search?q=central+bank+lebanon",
        receivedAt: new Date("2026-06-16T08:05:00.000Z")
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: {
        id: "source_google_news",
        title: "Reuters",
        provider: "rss",
        kind: "google_news"
      },
      text: "Central bank announces a new circular",
      sourceUrl: "https://news.google.com/rss/articles/example?oc=5"
    });
  });

  it("builds Google News RSS URLs from a query", () => {
    expect(buildGoogleNewsRssUrl("lebanon power")).toBe(
      "https://news.google.com/rss/search?q=lebanon+power&hl=en-US&gl=US&ceid=US%3Aen"
    );
  });
});
