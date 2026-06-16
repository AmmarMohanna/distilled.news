import type { BriefingConfig } from "@lownoise/core";
import {
  parsePublicTelegramChannelPage,
  parsePublicTelegramChannelUrl,
  publicTelegramSourceId
} from "@lownoise/connectors";
import type { ProcessingJobMessage, Repository, TelegramSourceRecord } from "./types";

export interface PublicTelegramIngestResult {
  sourceId: string;
  title?: string;
  url: string;
  fetched: number;
  imported: number;
  queued: number;
  skipped: number;
}

export interface PublicTelegramIngestInput {
  briefing: BriefingConfig;
  url: string;
  repo: Repository;
  bucket: { put(key: string, value: string, options?: unknown): Promise<unknown> };
  queue: { send(message: ProcessingJobMessage): Promise<unknown> };
  fetcher?: typeof fetch;
  now?: Date;
}

export async function ingestPublicTelegramChannel(input: PublicTelegramIngestInput): Promise<PublicTelegramIngestResult> {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();
  const channel = parsePublicTelegramChannelUrl(input.url);
  const response = await fetcher(channel.widgetUrl, {
    headers: {
      "user-agent": "LowNoise.news public Telegram source reader"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${channel.publicUrl}: ${response.status}`);
  }

  const html = await response.text();
  const rawPayloadKey = `telegram-public/${input.briefing.id}/${channel.username}/${now.getTime()}.html`;
  await input.bucket.put(rawPayloadKey, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" }
  });

  const messages = parsePublicTelegramChannelPage(html, {
    username: channel.username,
    receivedAt: now,
    retentionDays: input.briefing.retentionDays
  }).map((message) => ({ ...message, rawPayloadKey }));

  let source: TelegramSourceRecord | undefined;
  let imported = 0;
  let queued = 0;
  let skipped = 0;

  for (const message of messages) {
    source = await input.repo.upsertSourceFromMessage(input.briefing.id, message);
    const persistedMessage = {
      ...message,
      id: scopedRawMessageId(input.briefing.id, message.id),
      source: {
        ...message.source,
        id: source.id
      }
    };
    await input.repo.setSourceEnabled(source.id, true, now);

    const existing = await input.repo.getRawMessage(persistedMessage.id);
    if (existing) {
      skipped += 1;
      continue;
    }

    await input.repo.saveRawMessage(input.briefing.id, persistedMessage, now);
    const jobId = await input.repo.createProcessingJob(input.briefing.id, persistedMessage.id, now);
    await input.queue.send({ jobId, briefingId: input.briefing.id, rawMessageId: persistedMessage.id });
    imported += 1;
    queued += 1;
  }

  await input.repo.setSetting("last_telegram_event_at", now.toISOString(), now);
  await input.repo.setSetting(`last_telegram_event_at:${input.briefing.id}`, now.toISOString(), now);

  return {
    sourceId: source?.id ?? publicTelegramSourceId(channel.username),
    title: source?.title,
    url: channel.publicUrl,
    fetched: messages.length,
    imported,
    queued,
    skipped
  };
}

export async function refreshPublicTelegramSources(input: Omit<PublicTelegramIngestInput, "url">): Promise<PublicTelegramIngestResult[]> {
  if (input.briefing.paused) return [];

  const sources = (await input.repo.listSources(input.briefing.id)).filter((source) => source.enabled && source.url);
  const results: PublicTelegramIngestResult[] = [];
  for (const source of sources) {
    results.push(await ingestPublicTelegramChannel({ ...input, url: source.url! }));
  }
  return results;
}

function scopedRawMessageId(briefingId: string, rawMessageId: string): string {
  return `${briefingId}::${rawMessageId}`;
}
