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
  /**
   * Some publisher APIs emit ISO-looking timestamps without an offset. Keep
   * their wall-clock time explicit rather than silently treating it as UTC.
   */
  publisherTimeZone?: string;
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

/** Parse a small, conservative subset shared by JSON Feed and publisher APIs. */
export function parseJsonNewsFeed(json: string, options: RssParseOptions): NormalizedMessage[] {
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid JSON news feed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const payloadRecord = record(payload);
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : Array.isArray(payloadRecord.results)
        ? payloadRecord.results
        : [];
  if (entries.length === 0) throw new Error("Response is not a supported JSON news feed");

  const receivedAt = options.receivedAt ?? new Date();
  const retentionDays = options.retentionDays ?? 15;
  const source: MessageSource = {
    id: options.sourceId,
    title: options.sourceTitle,
    type: "channel",
    provider: options.provider ?? "rss",
    kind: options.kind ?? "rss_feed"
  };
  const messages = entries.flatMap((value, index): NormalizedMessage[] => {
    const entry = record(value);
    const title = htmlToText(text(entry.title ?? entry.headline ?? entry.name));
    const description = htmlToText(
      text(entry.description) || text(entry.summary) || text(entry.content_text) ||
      text(entry.SmallDescription) || text(entry.Text)
    ).slice(0, 1_200);
    const body = [title, description && description !== title ? description : ""].filter(Boolean).join(". ").trim();
    if (!body) return [];

    const link = resolveUrl(text(entry.url ?? entry.external_url ?? entry.Url ?? entry.SharingUrl), options.sourceUrl);
    const dateText = text(
      entry.date_published ?? entry.date_modified ?? entry.publishDate ?? entry.published_at ?? entry.publishedAt
    );
    const postedAt = parseDate(dateText, options.publisherTimeZone) ?? receivedAt.toISOString();
    const stableId = text(entry.id ?? entry.articleid ?? entry.articleId ?? entry.guid) || link || `${index}:${stableHash(body)}`;
    const mediaUrl = resolveUrl(text(entry.image ?? entry.imageUrl ?? entry.MediaUrl), options.sourceUrl);
    const expiresAt = new Date(postedAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
    return [{
      id: `json_feed_${stableHash(`${options.sourceId}:${stableId}`)}`,
      source,
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
  const feedTitle = htmlToText(text(channel.title ?? feed.title)) || options.sourceTitle;
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
function parseDate(value: string, publisherTimeZone?: string): string | undefined {
  if (isNaiveIsoDateTime(value)) {
    if (publisherTimeZone) return parseNaiveDateInTimeZone(value, publisherTimeZone);
    value = `${value}Z`;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function isNaiveIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
}

function parseNaiveDateInTimeZone(value: string, timeZone: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = "0", fraction = ""] = match;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const wallClockAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), milliseconds);
  if (!Number.isFinite(wallClockAsUtc)) return undefined;

  try {
    // Re-evaluate after applying the offset so this remains correct around DST
    // transitions rather than hard-coding a regional UTC offset.
    let instant = wallClockAsUtc - offsetForTimeZone(new Date(wallClockAsUtc), timeZone);
    instant = wallClockAsUtc - offsetForTimeZone(new Date(instant), timeZone);
    return new Date(instant).toISOString();
  } catch {
    return undefined;
  }
}

function offsetForTimeZone(date: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((candidate) => candidate.type === "timeZoneName")?.value;
  const match = part?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) throw new Error(`Could not determine offset for ${timeZone}`);
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? "0");
  return match[1] === "+" ? minutes * 60_000 : -minutes * 60_000;
}
function htmlToText(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10))).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}
function stripGoogleNewsSourceFromTitle(title: string, sourceTitle: string): string { const suffix = ` - ${sourceTitle}`; return sourceTitle && title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title; }
function normalizeRegion(value: string | undefined): string { return /^[A-Za-z]{2}$/.test(value ?? "") ? value!.toUpperCase() : "US"; }
function normalizeLanguage(value: string | undefined): string { const language = value?.match(/^[A-Za-z]{2}/)?.[0]; return language ? language.toLowerCase() : "en"; }
function stableHash(input: string): string { let hash = 5381; for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index); return (hash >>> 0).toString(36); }
