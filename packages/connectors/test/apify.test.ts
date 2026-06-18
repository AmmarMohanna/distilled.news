import { describe, expect, it } from "vitest";
import { normalizeApifyDatasetItems } from "../src";

describe("normalizeApifyDatasetItems", () => {
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
