import { describe, expect, it } from "vitest";
import { parseRssFeed } from "../src";

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
});
