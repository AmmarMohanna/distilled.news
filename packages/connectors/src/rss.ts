import { XMLParser } from "fast-xml-parser";
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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  processEntities: true,
  isArray: (name) => ["item", "entry", "link", "enclosure", "content", "thumbnail"].includes(name)
});

export function parseRssFeed(xml: string, options: RssParseOptions): NormalizedMessage[] {
  return parseRssLikeFeed(xml, options, false);
}

export function parseGoogleNewsRssFeed(xml: string, options: RssParseOptions): NormalizedMessage[] {
  return parseRssLikeFeed(xml, { ...options, provider: "rss", kind: "google_news" }, true);
}

export function buildGoogleNewsRssUrl(query: string, options: { geo?: string; language?: string } = {}): string {
  const geo = normalizeRegion(options.geo);
  const language = normalizeLanguage(options.language);
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", `${language}-${geo}`);
  url.searchParams.set("gl", geo);
  url.searchParams.set("ceid", `${geo}:${language}`);
  return url.toString();
}

function parseRssLikeFeed(xml: string, options: RssParseOptions, googleNews: boolean): NormalizedMessage[] {
  let document: UnknownRecord;
  try {
    document = record(parser.parse(xml));
  } catch (error) {
    throw new Error(`Invalid RSS or Atom XML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const rss = record(document.rss);
  const rdf = record(document.RDF);
  const channel = record(rss.channel ?? rdf.channel);
  const feed = record(document.feed);
  const entries = [...array(channel.item), ...array(rdf.item), ...array(feed.entry)].map(record);
  if (entries.length === 0 && !document.rss && !document.RDF && !document.feed) {
    throw new Error("Response is not an RSS or Atom feed");
  }

  const receivedAt = options.receivedAt ?? new Date();
  const retentionDays = options.retentionDays ?? 15;
  const feedTitle = text(channel.title ?? feed.title) || options.sourceTitle;
  const source: MessageSource = {
    id: options.sourceId,
    title: feedTitle,
    type: "channel",
    provider: options.provider ?? "rss",
    kind: options.kind ?? "rss_feed"
  };

  const messages = entries.flatMap((entry, index): NormalizedMessage[] => {
    const itemPublisher = googleNews ? text(record(entry.source)["#text"] ?? entry.source) : "";
    const itemTitle = text(entry.title);
    const title = googleNews ? stripGoogleNewsSourceFromTitle(itemTitle, itemPublisher) : itemTitle;
    const description = googleNews ? "" : htmlToText(text(entry.description ?? entry.summary ?? entry.encoded ?? entry.content));
    const body = [htmlToText(title), description].filter(Boolean).join(". ").trim();
    if (!body) return [];

    const link = resolveUrl(extractLink(entry), options.sourceUrl);
    const dateText = text(entry.pubDate ?? entry.published ?? entry.updated ?? entry.date);
    const postedAt = parseDate(dateText) ?? receivedAt.toISOString();
    const stableId = text(entry.guid ?? entry.id) || link || `${options.sourceUrl}#${stableHash(body)}`;
    const expiresAt = new Date(postedAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
    const mediaUrl = resolveUrl(extractMedia(entry), options.sourceUrl);
    const sourceTitle = itemPublisher || feedTitle;

    return [{
      id: `${googleNews ? "google_news" : "rss"}_${stableHash(`${options.sourceId}:${stableId}`)}`,
      source: { ...source, title: sourceTitle },
      messageId: stableHash(stableId),
      text: body,
      links: link ? [link] : [],
      media: mediaUrl ? [{ type: "photo", url: mediaUrl, label: "feed image" }] : [],
      postedAt,
      receivedAt: receivedAt.toISOString(),
      sourceUrl: link ?? options.sourceUrl,
      rawPayloadKey: options.rawPayloadKey,
      expiresAt: expiresAt.toISOString()
    }];
  });

  const seen = new Set<string>();
  return messages.filter((message) => !seen.has(message.id) && Boolean(seen.add(message.id)));
}

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]; }
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  const object = record(value);
  return typeof object["#text"] === "string" ? object["#text"].trim() : "";
}
function extractLink(entry: UnknownRecord): string | undefined {
  const candidates = array(entry.link);
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate.trim();
    const value = record(candidate);
    if ((!value.rel || value.rel === "alternate") && typeof value.href === "string") return value.href;
  }
  return undefined;
}
function extractMedia(entry: UnknownRecord): string | undefined {
  for (const key of ["content", "thumbnail", "enclosure"]) {
    for (const candidate of array(entry[key])) {
      const value = record(candidate);
      if (typeof value.url === "string" && (key !== "enclosure" || String(value.type ?? "").startsWith("image/"))) return value.url;
    }
  }
  return undefined;
}
function resolveUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value, base); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}
function parseDate(value: string): string | undefined { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined; }
function htmlToText(value: string): string { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function stripGoogleNewsSourceFromTitle(title: string, sourceTitle: string): string { const suffix = ` - ${sourceTitle}`; return sourceTitle && title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title; }
function normalizeRegion(value: string | undefined): string { return /^[A-Za-z]{2}$/.test(value ?? "") ? value!.toUpperCase() : "US"; }
function normalizeLanguage(value: string | undefined): string { const language = value?.match(/^[A-Za-z]{2}/)?.[0]; return language ? language.toLowerCase() : "en"; }
function stableHash(input: string): string { let hash = 5381; for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index); return (hash >>> 0).toString(36); }
