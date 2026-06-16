import type { MediaReference, MessageSource, NormalizedMessage, SourceType } from "@lownoise/core";

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
  photo?: Array<{ file_id: string; file_unique_id?: string; width?: number; height?: number }>;
  video?: { file_id: string; file_name?: string; mime_type?: string };
  document?: { file_id: string; file_name?: string; mime_type?: string };
  animation?: { file_id: string; file_name?: string; mime_type?: string };
  audio?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; mime_type?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface NormalizationOptions {
  receivedAt?: Date;
  retentionDays?: number;
  rawPayloadKey?: string;
}

export interface TelegramRegisterWebhookInput {
  botToken: string;
  webhookUrl: string;
  secretToken: string;
}

export interface TelegramRegisterWebhookResult {
  ok: boolean;
  description?: string;
}

export interface PublicTelegramChannel {
  username: string;
  publicUrl: string;
  widgetUrl: string;
}

export interface PublicTelegramParseOptions {
  username: string;
  receivedAt?: Date;
  retentionDays?: number;
}

export function normalizeTelegramUpdate(
  update: TelegramUpdate,
  options: NormalizationOptions = {}
): NormalizedMessage | null {
  const message =
    update.channel_post ?? update.message ?? update.edited_channel_post ?? update.edited_message;

  if (!message) return null;
  if (!isSupportedChat(message.chat)) return null;

  const text = (message.text ?? message.caption ?? "").trim();
  const media = extractMedia(message);
  if (!text && media.length === 0) return null;

  const receivedAt = options.receivedAt ?? new Date();
  const postedAt = new Date(message.date * 1000);
  const retentionDays = options.retentionDays ?? 15;
  const expiresAt = new Date(postedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);

  const source = toMessageSource(message.chat);
  const links = extractLinks(text, [...(message.entities ?? []), ...(message.caption_entities ?? [])]);

  return {
    id: `telegram_${update.update_id}_${message.chat.id}_${message.message_id}`,
    source,
    messageId: String(message.message_id),
    text,
    links,
    media,
    postedAt: postedAt.toISOString(),
    receivedAt: receivedAt.toISOString(),
    sourceUrl: buildTelegramMessageUrl(message.chat, message.message_id),
    rawPayloadKey: options.rawPayloadKey,
    expiresAt: expiresAt.toISOString()
  };
}

export function parsePublicTelegramChannelUrl(input: string): PublicTelegramChannel {
  const trimmed = input.trim();
  const candidate = trimmed.startsWith("@")
    ? trimmed.slice(1)
    : trimmed.match(/^https?:\/\/t\.me\/(?:s\/)?([^/?#]+)(?:[/?#].*)?$/i)?.[1] ?? trimmed;

  const username = candidate.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error("Enter a public Telegram channel URL like https://t.me/LebUpdate");
  }

  return {
    username,
    publicUrl: `https://t.me/${username}`,
    widgetUrl: `https://t.me/s/${username}`
  };
}

export function parsePublicTelegramChannelPage(
  html: string,
  options: PublicTelegramParseOptions
): NormalizedMessage[] {
  const receivedAt = options.receivedAt ?? new Date();
  const retentionDays = options.retentionDays ?? 15;
  const sourceTitle = extractChannelTitle(html) ?? `@${options.username}`;
  const source: MessageSource = {
    id: publicTelegramSourceId(options.username),
    title: sourceTitle,
    type: "channel",
    username: options.username
  };
  const messages: NormalizedMessage[] = [];

  for (const block of html.matchAll(/<div class="tgme_widget_message[\s\S]*?data-post="([^"]+)"[\s\S]*?(?=<div class="tgme_widget_message_wrap|\s*<\/main>)/g)) {
    const post = block[1];
    const [, postUsername, messageId] = post.match(/^([^/]+)\/(\d+)$/) ?? [];
    if (!postUsername || !messageId || postUsername.toLowerCase() !== options.username.toLowerCase()) continue;

    const textHtml = block[0].match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const text = htmlToText(textHtml);
    const media = extractPublicTelegramMedia(block[0]);
    if (!text && media.length === 0) continue;

    const postedAt = block[0].match(/<time datetime="([^"]+)"/)?.[1];
    if (!postedAt) continue;

    const postedDate = new Date(postedAt);
    const expiresAt = new Date(postedDate);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);

    messages.push({
      id: `telegram_public_${options.username}_${messageId}`,
      source,
      messageId,
      text,
      links: extractPublicTelegramLinks(block[0], text),
      media,
      postedAt: postedDate.toISOString(),
      receivedAt: receivedAt.toISOString(),
      sourceUrl: `https://t.me/${options.username}/${messageId}`,
      expiresAt: expiresAt.toISOString()
    });
  }

  return messages;
}

export function publicTelegramSourceId(username: string): string {
  return `telegram_public_${username.toLowerCase()}`;
}

export function validateTelegramWebhookSecret(
  requestSecret: string | null | undefined,
  expectedSecret: string
): boolean {
  return Boolean(expectedSecret) && requestSecret === expectedSecret;
}

export async function registerTelegramWebhook(
  input: TelegramRegisterWebhookInput,
  fetcher: typeof fetch = fetch
): Promise<TelegramRegisterWebhookResult> {
  const response = await fetcher(`https://api.telegram.org/bot${input.botToken}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: input.webhookUrl,
      secret_token: input.secretToken,
      allowed_updates: ["message", "channel_post", "edited_message", "edited_channel_post"]
    })
  });

  const payload = (await response.json().catch(() => ({}))) as TelegramRegisterWebhookResult;
  return {
    ok: response.ok && payload.ok !== false,
    description: payload.description
  };
}

function isSupportedChat(chat: TelegramChat): boolean {
  return chat.type === "channel" || chat.type === "group" || chat.type === "supergroup";
}

function toMessageSource(chat: TelegramChat): MessageSource {
  const type: SourceType = chat.type === "channel" ? "channel" : "group";
  return {
    id: `telegram_${chat.id}`,
    title: chat.title ?? chat.username ?? String(chat.id),
    type,
    username: chat.username
  };
}

function buildTelegramMessageUrl(chat: TelegramChat, messageId: number): string | undefined {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  const internalId = String(chat.id).replace(/^-100/, "");
  if (chat.type === "channel" || chat.type === "supergroup") {
    return `https://t.me/c/${internalId}/${messageId}`;
  }
  return undefined;
}

function extractLinks(text: string, entities: TelegramEntity[]): string[] {
  const links = new Set<string>();

  for (const entity of entities) {
    if (entity.type === "text_link" && entity.url) {
      links.add(entity.url);
      continue;
    }

    if (entity.type === "url") {
      links.add(text.slice(entity.offset, entity.offset + entity.length));
    }
  }

  for (const match of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    links.add(match[0]);
  }

  return Array.from(links);
}

function extractMedia(message: TelegramMessage): MediaReference[] {
  const media: MediaReference[] = [];

  const largestPhoto = message.photo?.at(-1);
  if (largestPhoto) {
    media.push({ type: "photo", fileId: largestPhoto.file_id, label: "Telegram photo" });
  }

  if (message.video) media.push({ type: "video", fileId: message.video.file_id, label: message.video.file_name });
  if (message.document) {
    media.push({ type: "document", fileId: message.document.file_id, label: message.document.file_name });
  }
  if (message.animation) {
    media.push({ type: "animation", fileId: message.animation.file_id, label: message.animation.file_name });
  }
  if (message.audio) media.push({ type: "audio", fileId: message.audio.file_id, label: message.audio.file_name });
  if (message.voice) media.push({ type: "voice", fileId: message.voice.file_id, label: "Telegram voice" });

  return media;
}

function extractChannelTitle(html: string): string | undefined {
  const title =
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
    html.match(/<div class="tgme_channel_info_header_title"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1];
  return title ? htmlToText(title).replace(/\s+\(@[^)]+\)$/, "").trim() : undefined;
}

function extractPublicTelegramLinks(block: string, text: string): string[] {
  const links = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s)]+/g)) links.add(match[0]);
  for (const match of block.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"/g)) {
    const href = decodeHtml(match[1]);
    if (!href.includes("t.me/") && !href.includes("telegram.org/")) links.add(href);
  }
  return Array.from(links);
}

function extractPublicTelegramMedia(block: string): MediaReference[] {
  const media: MediaReference[] = [];
  const photoUrl = block.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/)?.[1];
  if (photoUrl) media.push({ type: "photo", url: absoluteTelegramAssetUrl(photoUrl), label: "Telegram photo" });
  return media;
}

function absoluteTelegramAssetUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
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
