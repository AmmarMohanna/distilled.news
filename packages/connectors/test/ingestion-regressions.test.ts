import { describe, expect, it } from "vitest";
import { normalizeApifyDatasetItems, parseGoogleNewsRssFeed, parsePublicTelegramChannelPage, parseRssFeed } from "../src";

const receivedAt = new Date("2026-09-01T12:00:00.000Z");
const options = { sourceId: "regression", sourceTitle: "News", sourceUrl: "https://example.com/feed", receivedAt };

function rssItem(text: string, id: number): string {
  return `<item><title>${text}</title><guid>${id}</guid><pubDate>Tue, 01 Sep 2026 09:00:00 GMT</pubDate></item>`;
}

function telegramItem(text: string, id: number): string {
  return `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="news_channel/${id}">
    <div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>
    <time datetime="2026-09-01T09:00:00Z"></time></div></div>`;
}

describe.each([
  ["RSS", (text: string) => parseRssFeed(`<rss><channel>${rssItem(text, 1)}${rssItem("Healthy", 2)}</channel></rss>`, options)],
  ["Telegram", (text: string) => parsePublicTelegramChannelPage(`<main>${telegramItem(text, 1)}${telegramItem("Healthy", 2)}</main>`, { username: "news_channel", receivedAt })]
] as const)("%s numeric entities", (_name, parse) => {
  it.each(["&#99999999;", "&#x110000;", "&#55296;", "&#xDFFF;", "&#0;", `&#${"9".repeat(400)};`])(
    "replaces invalid entity %s and preserves both posts", (entity) => {
      const messages = parse(`Update ${entity}`);
      expect(messages.map((message) => message.text)).toEqual(["Update \uFFFD", "Healthy"]);
    }
  );

  it("preserves valid Arabic, accented, and supplementary Unicode characters", () => {
    expect(parse("&#x627; &#233; &#x1F4F0; &amp;")[0].text).toBe("\u0627 \u00e9 \u{1f4f0} &");
  });
});

describe.each([["RSS", parseRssFeed], ["Google News RSS", parseGoogleNewsRssFeed]] as const)("%s document validation", (_name, parse) => {
  it.each([
    "", "{\"error\":\"blocked\"}", "<html>Access denied</html>",
    "<html><body>Consent required<!-- <rss></rss> --></body></html>",
    "<html><body><rss><channel/></rss></body></html>", "<error>Feed unavailable</error>",
    "<!DOCTYPE html><html><body><rss><channel/></rss></body></html>",
    "<!DOCTYPE rss><html>Access denied</html>"
  ])("rejects a non-feed response: %s", (body) => {
    expect(() => parse(body, options)).toThrow("not an RSS or Atom feed");
  });

  it.each([
    '<rss version="2.0"><channel><title>Quiet feed</title></channel></rss>',
    '\uFEFF<?xml version="1.0"?>\n<!-- generated -->\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Quiet feed</title></feed>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel><title>Quiet feed</title></channel></rdf:RDF>'
  ])("accepts a valid empty feed", (body) => {
    expect(parse(body, options)).toEqual([]);
  });

  it.each([
    '<!DOCTYPE rss>',
    '<!DOCTYPE rss PUBLIC "-//Netscape//DTD RSS 0.91//EN" "https://example.invalid/rss.dtd">',
    "<!DOCTYPE rss SYSTEM\n'https://example.invalid/rss.dtd'>",
    '<!DOCTYPE rss [<!ELEMENT rss ANY>]>',
    '<!DOCTYPE rss PUBLIC "-//Example//DTD A > B//EN" "https://example.invalid/rss.dtd">'
  ])("accepts a DOCTYPE feed without resolving a DTD: %s", (declaration) => {
    const feed = `<rss version="2.0"><channel>${rssItem("Legacy feed item", 1)}</channel></rss>`;
    const messages = parse(`\uFEFF<?xml version="1.0"?>\n<!-- legacy feed -->\n${declaration}\n${feed}`, options);
    expect(messages).toEqual(parse(feed, options));
    expect(messages).toHaveLength(1);
  });
});

describe("Google News publication evidence", () => {
  it.each([
    {}, { fetchedAt: receivedAt.toISOString() }, { fetched_at: receivedAt.toISOString() },
    { scrapedAt: receivedAt.toISOString() }, { date: "unknown", fetchedAt: receivedAt.toISOString() },
    { publishedAt: "invalid" }, { date: `${"9".repeat(100)} years ago` }
  ])("skips undated or invalid items while keeping dated items", (fields) => {
    const messages = normalizeApifyDatasetItems([
      { title: "Undated", url: "https://example.com/undated", ...fields },
      { title: "Dated", url: "https://example.com/dated", publishedAt: "2026-09-01T09:00:00Z" }
    ], { ...options, kind: "google_news" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ text: "Dated", postedAt: "2026-09-01T09:00:00.000Z", receivedAt: receivedAt.toISOString() });
  });

  it("uses a valid publication alias when another date field is invalid", () => {
    const [message] = normalizeApifyDatasetItems([{ title: "News", url: "https://example.com/news", publishedAt: "invalid", published_at: "2026-09-01T09:00:00Z" }], { ...options, kind: "google_news" });
    expect(message.postedAt).toBe("2026-09-01T09:00:00.000Z");
  });

  it("uses collection time only to interpret an explicit relative publication date", () => {
    const [message] = normalizeApifyDatasetItems([{ title: "News", url: "https://example.com/news", date: "2 hours ago" }], { ...options, kind: "google_news" });
    expect(message.postedAt).toBe("2026-09-01T10:00:00.000Z");
  });
});
