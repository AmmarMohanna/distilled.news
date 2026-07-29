import type { MediaReference, MessageSource, NormalizedMessage, SourceKind } from "@distilled/core";

export interface ApifyNormalizeOptions {
  sourceId: string;
  sourceTitle: string;
  kind: SourceKind;
  receivedAt?: Date;
  retentionDays?: number;
  rawPayloadKey?: string;
}

const MAX_DATASET_ITEMS = 50;
const MAX_MESSAGE_TEXT_LENGTH = 8_000;
const MAX_SOURCE_TITLE_LENGTH = 200;
const MAX_USERNAME_LENGTH = 100;
const MAX_ID_LENGTH = 512;
const MAX_URL_LENGTH = 2_048;
const MAX_LINKS = 8;
const MAX_MEDIA = 8;

export function normalizeApifyDatasetItems(items: unknown[], options: ApifyNormalizeOptions): NormalizedMessage[] {
  const boundedItems = items.slice(0, MAX_DATASET_ITEMS);
  if (options.kind === "google_news") return normalizeGoogleNewsItems(boundedItems, options);
  if (options.kind === "x_profile" || options.kind === "x_search") return normalizeXItems(boundedItems, options);
  if (options.kind === "linkedin_company" || options.kind === "linkedin_profile") {
    return normalizeLinkedInItems(boundedItems, options);
  }
  return normalizeGenericApifyItems(boundedItems, options);
}

export function normalizeGoogleNewsItems(items: unknown[], options: ApifyNormalizeOptions): NormalizedMessage[] {
  return items.flatMap((item) => {
    const record = asRecord(item);
    const title = stringValue(record.title, MAX_MESSAGE_TEXT_LENGTH);
    const description = stringValue(record.description, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.snippet, MAX_MESSAGE_TEXT_LENGTH);
    const url =
      publicHttpUrl(record.publisherUrl) ??
      publicHttpUrl(record.url) ??
      publicHttpUrl(record.link) ??
      publicHttpUrl(record.googleNewsUrl) ??
      publicHttpUrl(record.guid);
    const sourceTitle = stringValue(record.source, MAX_SOURCE_TITLE_LENGTH) ??
      boundedSourceTitle(options.sourceTitle);
    const postedAt = googleNewsPostedAt(record, options.receivedAt);
    if (!title || !postedAt || !url) return [];

    return [toMessage({
      options,
      sourceTitle,
      stableId: url,
      messageId: url,
      text: [title, description].filter(Boolean).join(". "),
      links: [url],
      media: imageMedia(record.image ?? record.imageUrl),
      postedAt,
      sourceUrl: url
    })];
  });
}

function googleNewsPostedAt(record: Record<string, unknown>, receivedAt?: Date): string | undefined {
  const direct = dateValue(record.publishedAt ?? record.published_at ?? record.publishedTimestamp ?? record.timestamp);
  if (direct) return direct;

  const date = dateValue(record.date);
  if (date) return date;

  const base = dateObject(record.fetchedAt ?? record.fetched_at ?? record.scrapedAt) ?? receivedAt ?? new Date();
  const relative = relativeDateValue(record.date, base);
  if (relative) return relative;

  return dateValue(record.fetchedAt ?? record.fetched_at ?? record.scrapedAt) ?? receivedAt?.toISOString();
}

export function normalizeXItems(items: unknown[], options: ApifyNormalizeOptions): NormalizedMessage[] {
  return items.flatMap((item) => {
    const record = asRecord(item);
    const text = stringValue(record.text, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.fullText, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.full_text, MAX_MESSAGE_TEXT_LENGTH);
    const url = publicHttpUrl(record.url) ?? publicHttpUrl(record.tweetUrl) ?? publicHttpUrl(record.twitterUrl);
    const id = stringValue(record.id, MAX_ID_LENGTH) ?? stringValue(record.tweetId, MAX_ID_LENGTH) ?? url;
    const postedAt = dateValue(record.createdAt ?? record.created_at ?? record.date ?? record.timestamp);
    if (!text || !postedAt || !id) return [];

    const author = asRecord(record.author ?? record.user);
    const username = stringValue(author.userName, MAX_USERNAME_LENGTH) ??
      stringValue(author.username, MAX_USERNAME_LENGTH) ??
      stringValue(record.username, MAX_USERNAME_LENGTH);
    const name = stringValue(author.name, MAX_SOURCE_TITLE_LENGTH) ??
      username ??
      boundedSourceTitle(options.sourceTitle);

    return [toMessage({
      options,
      sourceTitle: name,
      username,
      stableId: id,
      messageId: id,
      text,
      links: uniqueStrings([url, ...extractUrls(text)]),
      media: extractXMedia(record),
      postedAt,
      sourceUrl: url
    })];
  });
}

export function normalizeLinkedInItems(items: unknown[], options: ApifyNormalizeOptions): NormalizedMessage[] {
  return items.flatMap((item) => {
    const record = asRecord(item);
    const text = stringValue(record.text, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.content, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.commentary, MAX_MESSAGE_TEXT_LENGTH);
    const url = publicHttpUrl(record.url) ?? publicHttpUrl(record.postUrl) ?? publicHttpUrl(record.link);
    const postedAt = dateValue(record.postedAt ?? record.date ?? record.createdAt);
    if (!text || !postedAt || !url) return [];

    return [toMessage({
      options,
      sourceTitle: stringValue(record.authorName, MAX_SOURCE_TITLE_LENGTH) ??
        stringValue(record.companyName, MAX_SOURCE_TITLE_LENGTH) ??
        boundedSourceTitle(options.sourceTitle),
      stableId: url,
      messageId: url,
      text,
      links: uniqueStrings([url, ...extractUrls(text)]),
      media: imageMedia(record.image ?? record.imageUrl),
      postedAt,
      sourceUrl: url
    })];
  });
}

function normalizeGenericApifyItems(items: unknown[], options: ApifyNormalizeOptions): NormalizedMessage[] {
  return items.flatMap((item, index) => {
    const record = asRecord(item);
    const text = stringValue(record.text, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.title, MAX_MESSAGE_TEXT_LENGTH) ??
      stringValue(record.description, MAX_MESSAGE_TEXT_LENGTH);
    const url = publicHttpUrl(record.url) ?? publicHttpUrl(record.link);
    const postedAt = dateValue(record.publishedAt ?? record.date ?? record.createdAt);
    if (!text || !postedAt) return [];
    return [toMessage({
      options,
      sourceTitle: stringValue(record.source, MAX_SOURCE_TITLE_LENGTH) ??
        boundedSourceTitle(options.sourceTitle),
      stableId: url ?? `${options.sourceId}:${index}:${text}`,
      messageId: url ?? `${index}`,
      text,
      links: uniqueStrings([url, ...extractUrls(text)]),
      media: imageMedia(record.image ?? record.imageUrl),
      postedAt,
      sourceUrl: url
    })];
  });
}

function toMessage(input: {
  options: ApifyNormalizeOptions;
  sourceTitle: string;
  username?: string;
  stableId: string;
  messageId: string;
  text: string;
  links: string[];
  media: MediaReference[];
  postedAt: string;
  sourceUrl?: string;
}): NormalizedMessage {
  const receivedAt = input.options.receivedAt ?? new Date();
  const retentionDays = input.options.retentionDays ?? 15;
  const expiresAt = new Date(input.postedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  const source: MessageSource = {
    id: input.options.sourceId,
    title: input.sourceTitle.slice(0, MAX_SOURCE_TITLE_LENGTH),
    type: "channel",
    provider: "apify",
    kind: input.options.kind,
    username: input.username?.slice(0, MAX_USERNAME_LENGTH)
  };

  return {
    id: `apify_${stableHash(`${input.options.sourceId}:${input.stableId}`)}`,
    source,
    messageId: input.messageId.slice(0, MAX_ID_LENGTH),
    text: input.text.trim().slice(0, MAX_MESSAGE_TEXT_LENGTH),
    links: uniqueStrings(input.links.map(publicHttpUrl)).slice(0, MAX_LINKS),
    media: input.media
      .flatMap((entry) => {
        const url = publicHttpUrl(entry.url);
        return url ? [{ ...entry, url }] : [];
      })
      .slice(0, MAX_MEDIA),
    postedAt: input.postedAt,
    receivedAt: receivedAt.toISOString(),
    sourceUrl: publicHttpUrl(input.sourceUrl),
    rawPayloadKey: input.options.rawPayloadKey,
    expiresAt: expiresAt.toISOString()
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, maxLength = MAX_MESSAGE_TEXT_LENGTH): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function boundedSourceTitle(value: string): string {
  return value.trim().slice(0, MAX_SOURCE_TITLE_LENGTH) || "Source";
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
  }
  return undefined;
}

function dateObject(value: unknown): Date | undefined {
  const iso = dateValue(value);
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function relativeDateValue(value: unknown, base: Date): string | undefined {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return undefined;
  if (/^(just now|now)$/.test(text)) return base.toISOString();
  if (text === "yesterday") return new Date(base.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const match = text.match(/^(?:about\s+)?(?:(\d+)|an?|one)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s+ago$/);
  if (!match) return undefined;

  const amount = match[1] ? Number(match[1]) : 1;
  const unit = match[2];
  const multipliers: Record<string, number> = {
    minute: 60 * 1000,
    minutes: 60 * 1000,
    min: 60 * 1000,
    mins: 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hrs: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  };
  const multiplier = multipliers[unit];
  if (!Number.isFinite(amount) || !multiplier) return undefined;
  return new Date(base.getTime() - amount * multiplier).toISOString();
}

function imageMedia(value: unknown): MediaReference[] {
  const url = publicHttpUrl(value);
  return url ? [{ type: "photo", url, label: "source image" }] : [];
}

function extractXMedia(record: Record<string, unknown>): MediaReference[] {
  const media = Array.isArray(record.media) ? record.media : Array.isArray(record.extendedEntities) ? record.extendedEntities : [];
  return media.slice(0, MAX_MEDIA).flatMap((entry) => {
    const item = asRecord(entry);
    const url = publicHttpUrl(item.url) ?? publicHttpUrl(item.media_url_https) ?? publicHttpUrl(item.mediaUrl);
    if (!url) return [];
    return [{ type: "photo" as const, url, label: "X media" }];
  });
}

function extractUrls(text: string): string[] {
  return Array.from(text.slice(0, MAX_MESSAGE_TEXT_LENGTH).matchAll(/https?:\/\/[^\s)]+/g))
    .map((match) => publicHttpUrl(match[0]))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_LINKS);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function publicHttpUrl(value: unknown): string | undefined {
  const text = stringValue(value, MAX_URL_LENGTH + 1);
  if (!text || text.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(text);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
    if (isPrivateHostname(url.hostname)) return undefined;
    const serialized = url.toString();
    return serialized.length <= MAX_URL_LENGTH ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
