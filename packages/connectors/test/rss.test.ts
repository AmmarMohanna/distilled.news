import { describe, expect, it } from "vitest";
import { buildGoogleNewsRssUrl, parseGoogleNewsRssFeed, parseJsonNewsFeed, parseRssFeed } from "../src";

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

  it("parses Atom namespaces, relative links, CDATA, media, and missing dates", () => {
    const messages = parseRssFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <title>أخبار العلوم</title><entry><id>story-1</id><title><![CDATA[اكتشاف جديد]]></title>
      <link rel="alternate" href="/story/1"/><summary><![CDATA[<b>تفاصيل</b> مهمة]]></summary><media:thumbnail url="/image.jpg"/></entry></feed>`, {
      sourceId: "science", sourceTitle: "Science", sourceUrl: "https://example.com/feed.atom", receivedAt: new Date("2026-07-13T00:00:00Z")
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ postedAt: "2026-07-13T00:00:00.000Z", sourceUrl: "https://example.com/story/1", text: "اكتشاف جديد. تفاصيل مهمة" });
    expect(messages[0].media[0]?.url).toBe("https://example.com/image.jpg");
  });

  it("parses RSS 1.0 RDF feeds used by the Science launch source", () => {
    const messages = parseRssFeed(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel rdf:about="https://www.science.org/action/showFeed">
          <title>Science: Current Issue</title>
        </channel>
        <item rdf:about="https://www.science.org/doi/example">
          <title>Measured result from a controlled study</title>
          <link>https://www.science.org/doi/example</link>
          <dc:date>2026-07-27T19:00:40Z</dc:date>
          <description>Researchers report a reproducible result.</description>
        </item>
      </rdf:RDF>`, {
      sourceId: "science",
      sourceTitle: "Science",
      sourceUrl: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
      receivedAt: new Date("2026-07-29T09:24:36.000Z")
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: { id: "science", title: "Science: Current Issue" },
      postedAt: "2026-07-27T19:00:40.000Z",
      sourceUrl: "https://www.science.org/doi/example"
    });
  });

  it("rejects non-feed documents instead of reporting an empty healthy fetch", () => {
    expect(() => parseRssFeed("<html><body>challenge</body></html>", { sourceId: "x", sourceTitle: "X", sourceUrl: "https://example.com/rss" })).toThrow(/not an RSS or Atom feed/);
  });

  it("decodes numeric entities in feed titles", () => {
    const [message] = parseRssFeed(`<rss><channel><title>News &#8211; World</title><item><title>Update</title><guid>1</guid><pubDate>Sun, 13 Jul 2026 00:00:00 GMT</pubDate></item></channel></rss>`, { sourceId: "x", sourceTitle: "X", sourceUrl: "https://example.com/rss" });
    expect(message.source.title).toBe("News – World");
  });

  it("decodes supported entities once without collapsing double-encoded ampersands", () => {
    const [message] = parseRssFeed(
      `<rss><channel><title>Research &amp; Development</title><item><title>Markets &amp;amp; policy &amp; outlook &amp;quot;watch&amp;quot;</title><guid>1</guid></item></channel></rss>`,
      { sourceId: "x", sourceTitle: "X", sourceUrl: "https://example.com/rss" }
    );

    expect(message.source.title).toBe("Research & Development");
    expect(message.text).toBe("Markets &amp; policy & outlook &quot;watch&quot;");
  });

  it("rejects DTD entity declarations instead of expanding attacker-controlled entities", () => {
    expect(() => parseRssFeed(
      `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY repeat "amplified">]>
      <rss><channel><item><title>&repeat;</title></item></channel></rss>`,
      { sourceId: "x", sourceTitle: "X", sourceUrl: "https://example.com/rss" }
    )).toThrow(/entity declarations are not supported/);
  });

  it("bounds XML and JSON item counts and normalized text sizes", () => {
    const items = Array.from({ length: 80 }, (_, index) =>
      `<item><title>${"x".repeat(900)}</title><guid>${index}</guid></item>`
    ).join("");
    const messages = parseRssFeed(`<rss><channel>${items}</channel></rss>`, {
      sourceId: "x",
      sourceTitle: "X",
      sourceUrl: "https://example.com/rss"
    });
    expect(messages).toHaveLength(50);
    expect(messages[0].text.length).toBe(500);

    const jsonMessages = parseJsonNewsFeed(JSON.stringify(Array.from({ length: 80 }, (_, index) => ({
      id: index,
      title: "headline",
      description: "d".repeat(20_000)
    }))), {
      sourceId: "json",
      sourceTitle: "JSON",
      sourceUrl: "https://example.com/feed.json"
    });
    expect(jsonMessages).toHaveLength(50);
    expect(jsonMessages[0].text.length).toBeLessThanOrEqual(8_510);
  });

  it("rejects feed payloads larger than the normalization boundary", () => {
    expect(() => parseRssFeed("x".repeat(2 * 1024 * 1024 + 1), {
      sourceId: "x",
      sourceTitle: "X",
      sourceUrl: "https://example.com/rss"
    })).toThrow(/2 MiB normalization limit/);
  });

  it("normalizes direct publisher JSON articles without timezone or HTML artifacts", () => {
    const [message] = parseJsonNewsFeed(JSON.stringify([{
      articleid: 1717046,
      title: "تحديث من بيروت",
      publishDate: "2026-07-14T01:57:50.04",
      Url: "/news/local/1717046/update",
      MediaUrl: "https://images.example/update.jpg",
      SmallDescription: "",
      Text: "<p><strong>أعلنت الجهة الرسمية بدء التنفيذ.&nbsp;</strong></p>"
    }]), {
      sourceId: "mtv-lebanon",
      sourceTitle: "MTV Lebanon",
      sourceUrl: "https://www.mtv.com.lb/api/articles?start=0&end=20&type=&removeAds=true",
      receivedAt: new Date("2026-07-14T02:00:00.000Z"),
      publisherTimeZone: "Asia/Beirut"
    });

    expect(message).toMatchObject({
      source: { id: "mtv-lebanon", title: "MTV Lebanon", provider: "rss", kind: "rss_feed" },
      postedAt: "2026-07-13T22:57:50.040Z",
      sourceUrl: "https://www.mtv.com.lb/news/local/1717046/update",
      text: "تحديث من بيروت. أعلنت الجهة الرسمية بدء التنفيذ."
    });
    expect(message.media[0]?.url).toBe("https://images.example/update.jpg");
  });
});
