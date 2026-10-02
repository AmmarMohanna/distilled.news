import { describe, expect, it } from "vitest";
import { normalizeApifyDatasetItems } from "../src";

describe("normalizeApifyDatasetItems", () => {
  it("preserves HarvestAPI LinkedIn text, nested dates and the original author of a repost", () => {
    const [message] = normalizeApifyDatasetItems([{
      content: "An update from the original author. https://example.com/news",
      linkedinUrl: "https://www.linkedin.com/posts/original-123",
      postedAt: { date: "2026-09-24T16:30:01.883Z", timestamp: 1790267401883 },
      author: { name: "Original Author", publicIdentifier: "original" },
      repostedBy: { name: "Someone Else" },
      contentAttributes: [{ hyperlink: "https://example.com/mention" }, { hyperlink: "javascript:alert(1)" }]
    }], { sourceId: "li", sourceTitle: "Someone Else", kind: "linkedin_profile" });
    expect(message).toMatchObject({
      source: { title: "Original Author", username: "original" },
      postedAt: "2026-09-24T16:30:01.883Z",
      sourceUrl: "https://www.linkedin.com/posts/original-123",
      text: "An update from the original author. https://example.com/news",
      links: ["https://www.linkedin.com/posts/original-123", "https://example.com/news", "https://example.com/mention"]
    });
  });

  it("accepts LinkedIn nested timestamps and legacy dates but rejects undated records", () => {
    const base = { content: "Company update", linkedinUrl: "https://www.linkedin.com/posts/company-123", author: { name: "Company", universalName: "company" } };
    const messages = normalizeApifyDatasetItems([
      { ...base, postedAt: { timestamp: 1790267401883 } },
      { ...base, postedAt: "2026-09-24T16:30:01.883Z" },
      { ...base, postedAt: { date: "invalid" } }
    ], { sourceId: "li", sourceTitle: "Fallback", kind: "linkedin_company" });
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message.postedAt).toBe("2026-09-24T16:30:01.883Z");
      expect(message.source).toMatchObject({ title: "Company", username: "company" });
    }
  });

  const xMessage = (fields: Record<string, unknown>) => normalizeApifyDatasetItems([{
    id: "123", text: "News https://t.co/short", url: "https://x.com/NASA/status/123",
    createdAt: "2026-09-24T12:00:00Z", ...fields
  }], { sourceId: "x", sourceTitle: "NASA", kind: "x_profile" })[0];

  it("preserves nested X photos and chooses the highest-bitrate MP4 rather than the thumbnail", () => {
    const message = xMessage({ extendedEntities: { media: [
      { type: "photo", url: "https://t.co/photo", media_url_https: "https://pbs.twimg.com/photo.jpg" },
      { type: "video", media_url_https: "https://pbs.twimg.com/thumbnail.jpg", video_info: { variants: [
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/video.m3u8" },
        { content_type: "video/mp4", bitrate: 100, url: "https://video.twimg.com/low.mp4" },
        { content_type: "video/mp4", bitrate: 200, url: "https://video.twimg.com/high.mp4" }
      ] } }
    ] } });
    expect(message.media).toEqual([
      { type: "photo", url: "https://pbs.twimg.com/photo.jpg", label: "X media" },
      { type: "video", url: "https://video.twimg.com/high.mp4", label: "X media" }
    ]);
  });

  it("retains expanded X destinations without removing short links or accepting unsafe schemes", () => {
    const message = xMessage({ entities: { urls: [
      { expanded_url: "https://example.com/article" }, { expanded_url: "https://example.com/article" },
      { expanded_url: "javascript:alert(1)" }, { expanded_url: "file:///private" }
    ] } });
    expect(message.links).toEqual(["https://x.com/NASA/status/123", "https://t.co/short", "https://example.com/article"]);
  });

  it("deduplicates array media and preserves animation and unresolved video identity", () => {
    const photo = { mediaUrl: "https://example.com/photo.jpg" };
    const message = xMessage({ media: [photo], extendedEntities: [photo,
      { type: "animated_gif", url: "https://example.com/animation.mp4" },
      { type: "video", id_str: "video-id", media_url_https: "https://example.com/thumb.jpg", url: "https://t.co/video" },
      { type: "photo", url: "javascript:alert(1)" }
    ] });
    expect(message.media).toEqual([
      { type: "photo", url: "https://example.com/photo.jpg", label: "X media" },
      { type: "animation", url: "https://example.com/animation.mp4", label: "X media" },
      { type: "video", fileId: "video-id", label: "X media" }
    ]);
  });

  it.each([
    ["Energy plan - Reuters", "Energy plan    Reuters", "Reuters", "Energy plan"],
    ["Energy plan - Reuters", "Energy plan - Reuters", "Reuters", "Energy plan"],
    ["Energy plan", "Energy\u00a0plan", "Reuters", "Energy plan"],
    ["Energy plan - Reuters", "Energy plan expands access to electricity.", "Reuters", "Energy plan. Energy plan expands access to electricity."],
    ["Energy plan - Other", "A separate summary.", "Reuters", "Energy plan - Other. A separate summary."],
    ["Energy plan - Google News", undefined, undefined, "Energy plan - Google News"]
  ])("cleans Google News text conservatively: %s / %s", (title, snippet, source, expected) => {
    const [message] = normalizeApifyDatasetItems([{
      title, snippet, source, googleNewsUrl: "https://news.google.com/read/example",
      publishedAt: "2026-09-24T12:00:00Z"
    }], { sourceId: "test", sourceTitle: "Google News", kind: "google_news" });
    expect(message.text).toBe(expected);
  });

  it("normalizes Google News actor items", () => {
    const messages = normalizeApifyDatasetItems(
      [
        {
          title: "Central bank announces new circular",
          source: "Reuters",
          googleNewsUrl: "https://news.google.com/read/example",
          snippet: "The circular changes bank reporting rules.",
          publishedAt: "2026-06-16T08:30:00.000Z",
          imageUrl: "https://reuters.com/image.jpg",
          fetchedAt: "2026-06-16T10:30:00.000Z"
        }
      ],
      {
        sourceId: "source_google_news",
        sourceTitle: "Google News: banks",
        kind: "google_news",
        receivedAt: new Date("2026-06-16T08:31:00.000Z")
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: {
        id: "source_google_news",
        title: "Reuters",
        provider: "apify",
        kind: "google_news"
      },
      sourceUrl: "https://news.google.com/read/example"
    });
    expect(messages[0].text).toContain("Central bank announces");
    expect(messages[0].postedAt).toBe("2026-06-16T08:30:00.000Z");
  });

  it("normalizes relative Google News dates when actors return them", () => {
    const messages = normalizeApifyDatasetItems(
      [
        {
          title: "Port authority publishes new inspection notice",
          source: "Daily News",
          link: "https://example.com/port",
          date: "2 hours ago",
          fetchedAt: "2026-06-16T10:30:00.000Z"
        }
      ],
      {
        sourceId: "source_google_news",
        sourceTitle: "Google News: port",
        kind: "google_news",
        receivedAt: new Date("2026-06-16T10:31:00.000Z")
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].postedAt).toBe("2026-06-16T08:30:00.000Z");
  });

  it("normalizes X actor items", () => {
    const messages = normalizeApifyDatasetItems(
      [
        {
          id: "1900",
          text: "Agency announced a road closure for two hours. https://example.com",
          url: "https://x.com/agency/status/1900",
          createdAt: "2026-06-16T09:00:00.000Z",
          author: { userName: "agency", name: "Road Agency" }
        }
      ],
      {
        sourceId: "source_x",
        sourceTitle: "@agency",
        kind: "x_profile",
        receivedAt: new Date("2026-06-16T09:01:00.000Z")
      }
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: {
        id: "source_x",
        title: "Road Agency",
        provider: "apify",
        kind: "x_profile",
        username: "agency"
      },
      sourceUrl: "https://x.com/agency/status/1900"
    });
    expect(messages[0].links).toContain("https://example.com");
  });
});
