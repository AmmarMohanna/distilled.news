import type { BriefingConfig } from "@distilled/core";
import {
  parsePublicTelegramChannelPage,
  parsePublicTelegramChannelUrl,
  publicTelegramSourceId
} from "@distilled/connectors";
import type { ProcessingJobMessage, Repository, SourceRecord } from "./types";
import { isMessageWithinIngestHorizon } from "./sourceFreshness";

const TELEGRAM_FETCH_TIMEOUT_MS = 8_000;

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
  source?: SourceRecord;
  repo: Repository;
  bucket: { put(key: string, value: string, options?: unknown): Promise<unknown> };
  queue: { send(message: ProcessingJobMessage): Promise<unknown> };
  activateSource?: boolean;
  fetcher?: typeof fetch;
  now?: Date;
}

export async function ingestPublicTelegramChannel(input: PublicTelegramIngestInput): Promise<PublicTelegramIngestResult> {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();
  const channel = parsePublicTelegramChannelUrl(input.url);
  const response = await fetchPublicChannelPage(fetcher, channel.username);

  const html = await response.text();
  const rawPayloadKey = await archiveTelegramPageIfChanged(input, channel.username, html, now);

  const messages = parsePublicTelegramChannelPage(html, {
    username: channel.username,
    receivedAt: now,
    retentionDays: input.briefing.retentionDays
  }).map((message) => ({ ...message, rawPayloadKey }));

  let source: SourceRecord | undefined = input.source;
  let imported = 0;
  let queued = 0;
  let skipped = 0;
  const importedBriefingIds = new Set<string>();

  for (const message of messages) {
    source = await input.repo.upsertSourceFromMessage(input.briefing.id, message);
    if (input.activateSource) {
      await input.repo.setSourceEnabled(source.id, true, now);
      source = { ...source, enabled: true };
    }
    const equivalents = await input.repo.listEquivalentSources(source.id);
    const targets = equivalents.length > 0 ? equivalents : [source];
    const canonicalMessageId = `telegram_${channel.username.toLowerCase()}_${message.messageId}`;
    for (const target of targets) {
      const briefing = await input.repo.getBriefingById(target.briefingId);
      if (!briefing || briefing.paused || !target.enabled) continue;
      if (!isMessageWithinIngestHorizon(briefing, message.postedAt, now)) {
        skipped += 1;
        continue;
      }
      const persistedMessage = {
        ...message,
        id: scopedRawMessageId(target.briefingId, canonicalMessageId),
        source: {
          ...message.source,
          id: target.id,
          title: target.title,
          type: target.type,
          provider: target.provider,
          kind: target.kind,
          username: target.username
        }
      };
      const existing = await input.repo.getRawMessage(persistedMessage.id);
      if (existing) {
        skipped += 1;
        continue;
      }

      const jobId = await input.repo.saveRawMessageAndCreateProcessingJob(target.briefingId, persistedMessage, now);
      await input.queue.send({ jobId, briefingId: target.briefingId, rawMessageId: persistedMessage.id });
      await input.repo.markProcessingJobEnqueued(jobId, now);
      importedBriefingIds.add(target.briefingId);
      imported += 1;
      queued += 1;
    }
  }

  await markSourceFetch(input.repo, input.briefing.id, now);
  if (imported > 0) {
    for (const briefingId of importedBriefingIds) await markImportedMessage(input.repo, briefingId, now);
    await input.repo.setSetting("last_telegram_event_at", now.toISOString(), now);
    await input.repo.setSetting(`last_telegram_event_at:${input.briefing.id}`, now.toISOString(), now);
  }
  if (source) {
    await input.repo.updateSourceState({
      sourceId: source.id,
      lastCheckedAt: now.toISOString()
    }, now);
    await input.repo.recordSourceSuccess(source.id, imported > 0 ? now.toISOString() : undefined, now);
  }

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

async function fetchPublicChannelPage(fetcher: typeof fetch, username: string): Promise<Response> {
  const candidates = [
    `https://telegram.me/s/${username}`,
    `https://telegram.dog/s/${username}`,
    `https://t.me/s/${username}`
  ];
  try {
    return await Promise.any(candidates.map(async (url) => {
      const response = await fetchWithTimeout(fetcher, url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; DistilledNewsBot/1.0; +https://distilled.news)"
        },
        redirect: "follow"
      }, TELEGRAM_FETCH_TIMEOUT_MS);
      if (response.ok) return response;
      throw new Error(`${new URL(url).hostname}: ${response.status}`);
    }));
  } catch (error) {
    const errors = error instanceof AggregateError
      ? error.errors.map((entry) => entry instanceof Error ? entry.message : String(entry))
      : [error instanceof Error ? error.message : String(error)];
    throw new Error(`Could not fetch public Telegram channel @${username} (${errors.join("; ")})`);
  }
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`Timed out fetching ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshPublicTelegramSources(input: Omit<PublicTelegramIngestInput, "url">): Promise<PublicTelegramIngestResult[]> {
  if (input.briefing.paused) return [];

  const sources = (await input.repo.listSources(input.briefing.id)).filter(
    (source) => source.enabled && source.provider === "telegram" && source.url
  );
  const results: PublicTelegramIngestResult[] = [];
  for (const source of sources) {
    results.push(await ingestPublicTelegramChannel({ ...input, url: source.url! }));
  }
  return results;
}

async function archiveTelegramPageIfChanged(
  input: PublicTelegramIngestInput,
  username: string,
  html: string,
  now: Date
): Promise<string | undefined> {
  const hash = await sha256Hex(html);
  const hashSetting = `raw_archive_hash:telegram:${input.briefing.id}:${username}`;
  const keySetting = `raw_archive_key:telegram:${input.briefing.id}:${username}`;
  const existingHash = await input.repo.getSetting(hashSetting);
  const existingKey = await input.repo.getSetting(keySetting);
  if (existingHash === hash && existingKey) return existingKey;

  const rawPayloadKey = `telegram-public/${input.briefing.id}/${username}/${now.getTime()}.html`;
  await input.bucket.put(rawPayloadKey, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" }
  });
  await input.repo.setSetting(hashSetting, hash, now);
  await input.repo.setSetting(keySetting, rawPayloadKey, now);
  return rawPayloadKey;
}

async function markSourceFetch(repo: Repository, briefingId: string, now: Date): Promise<void> {
  await repo.setSetting("last_source_fetch_at", now.toISOString(), now);
  await repo.setSetting(`last_source_fetch_at:${briefingId}`, now.toISOString(), now);
}

async function markImportedMessage(repo: Repository, briefingId: string, now: Date): Promise<void> {
  await repo.setSetting("last_imported_message_at", now.toISOString(), now);
  await repo.setSetting(`last_imported_message_at:${briefingId}`, now.toISOString(), now);
  await repo.setSetting("last_source_event_at", now.toISOString(), now);
  await repo.setSetting(`last_source_event_at:${briefingId}`, now.toISOString(), now);
}

function scopedRawMessageId(briefingId: string, rawMessageId: string): string {
  return `${briefingId}::${rawMessageId}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
