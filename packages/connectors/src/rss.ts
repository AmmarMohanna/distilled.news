import type { MessageSource, NormalizedMessage, SourceKind, SourceProvider } from "@distilled/core";

export interface RssParseOptions {
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  provider?: SourceProvider;
  kind?: SourceKind;
  receivedAt?: Date;
  retentionDays?: number;
  rawPayloadKey?: string;
}

export function parseRssFeed(xml: string, options: RssParseOptions): NormalizedMessage[] {
  return parseRssLikeFeed(xml, options);
}

export function parseGoogleNewsRssFeed(xml: string, options: RssParseOptions): NormalizedMessage[] {
  return parseRssLikeFeed(xml, {
    ...options,
    provider: "rss",
    kind: "google_news"
  }, {
    idPrefix: "google_news",
    itemSourceTitle: (block) => htmlToText(tagValue(block, "source") ?? "") || undefined,
    itemText: (block, sourceTitle) => {
      const title = stripGoogleNewsSourceFromTitle(htmlToText(tagValue(block, "title") ?? ""), sourceTitle);
      return title || htmlToText(
        tagValue(block, "description") ??
          tagValue(block, "summary") ??
          tagValue(block, "content") ??
          tagValue(block, "content:encoded") ??
          ""
      );
    }
  });
}

export function buildGoogleNewsRssUrl(query: string, options: {
  geo?: string;
  language?: string;
} = {}): string {
  const geo = normalizeRegion(options.geo);
  const language = normalizeLanguage(options.language);
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", `${language}-${geo}`);
  url.searchParams.set("gl", geo);
  url.searchParams.set("ceid", `${geo}:${language}`);
  return url.toString();
}

function parseRssLikeFeed(
  xml: string,
  options: RssParseOptions,
  behavior: {
    idPrefix?: string;
    itemSourceTitle?: (block: string) => string | undefined;
    itemText?: (block: string, sourceTitle: string) => string;
  } = {}
): NormalizedMessage[] {
  const receivedAt = options.receivedAt ?? new Date();
  const retentionDays = options.retentionDays ?? 15;
  const source: MessageSource = {
    id: options.sourceId,
    title: extractFeedTitle(xml) ?? options.sourceTitle,
    type: "channel",
    provider: options.provider ?? "rss",
    kind: options.kind ?? "rss_feed"
  };

  const blocks = [...extractBlocks(xml, "item"), ...extractBlocks(xml, "entry")];
  return blocks.flatMap((block, index) => {
    const sourceTitle = behavior.itemSourceTitle?.(block) ?? source.title;
    const title = behavior.itemText?.(block, sourceTitle) ?? htmlToText(tagValue(block, "title") ?? "");
    const description = behavior.itemText
      ? ""
      : htmlToText(
        tagValue(block, "description") ??
          tagValue(block, "summary") ??
          tagValue(block, "content") ??
          tagValue(block, "content:encoded") ??
          ""
      );
    const text = [title, description].filter(Boolean).join(". ").trim();
    const link = extractItemLink(block);
    const postedAt = parseDate(
      tagValue(block, "pubDate") ??
        tagValue(block, "published") ??
        tagValue(block, "updated") ??
        tagValue(block, "dc:date") ??
        ""
    );
    if (!text || !postedAt) return [];

    const expiresAt = new Date(postedAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
    const stableId = tagValue(block, "guid") ?? tagValue(block, "id") ?? link ?? `${options.sourceUrl}#${index}`;
    const mediaUrl = extractMediaUrl(block);

    return [{
      id: `${behavior.idPrefix ?? "rss"}_${stableHash(`${options.sourceId}:${stableId}`)}`,
      source: { ...source, title: sourceTitle },
      messageId: String(stableHash(stableId)),
      text,
      links: link ? [link] : [],
      media: mediaUrl ? [{ type: "photo" as const, url: mediaUrl, label: "feed image" }] : [],
      postedAt,
      receivedAt: receivedAt.toISOString(),
      sourceUrl: link ?? options.sourceUrl,
      rawPayloadKey: options.rawPayloadKey,
      expiresAt: expiresAt.toISOString()
    }];
  });
}

function extractBlocks(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "gi")))
    .map((match) => match[1]);
}

function tagValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i"));
  return match?.[1]?.trim();
}

function extractFeedTitle(xml: string): string | undefined {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1] ?? xml;
  const title = tagValue(channel, "title");
  return title ? htmlToText(title) : undefined;
}

function extractItemLink(block: string): string | undefined {
  const rssLink = tagValue(block, "link");
  if (rssLink && /^https?:\/\//i.test(htmlToText(rssLink))) return htmlToText(rssLink);
  const atomHref = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  return atomHref ? decodeHtml(atomHref) : undefined;
}

function extractMediaUrl(block: string): string | undefined {
  return (
    block.match(/<media:content\b[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] ??
    block.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] ??
    block.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1]
  );
}

function parseDate(value: string): string | undefined {
  const time = Date.parse(htmlToText(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripGoogleNewsSourceFromTitle(title: string, sourceTitle: string): string {
  const suffix = ` - ${sourceTitle}`;
  return sourceTitle && title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function normalizeRegion(value: string | undefined): string {
  return /^[A-Za-z]{2}$/.test(value ?? "") ? value!.toUpperCase() : "US";
}

function normalizeLanguage(value: string | undefined): string {
  const language = value?.match(/^[A-Za-z]{2}/)?.[0];
  return language ? language.toLowerCase() : "en";
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
