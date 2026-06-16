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
