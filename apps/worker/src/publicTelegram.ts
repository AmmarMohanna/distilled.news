import type { BriefingConfig } from "@distilled/core";
import {
  parsePublicTelegramChannelPage,
  parsePublicTelegramChannelUrl,
  publicTelegramSourceId
} from "@distilled/connectors";
import type { ProcessingJobMessage, Repository, SourceRecord } from "./types";
import { isMessageWithinIngestHorizon } from "./sourceFreshness";

const TELEGRAM_FETCH_TIMEOUT_MS = 8_000;
const TELEGRAM_MAX_RESPONSE_BYTES = 2_000_000;
const TELEGRAM_MAX_REDIRECTS = 3;
const TELEGRAM_PUBLIC_HOSTS = new Set(["telegram.me", "telegram.dog", "t.me"]);

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
  const owner = await input.repo.getAccountById(input.briefing.ownerAccountId);
  if (!owner || owner.disabledAt || input.briefing.paused || !input.briefing.publicFeedEnabled) {
    return {
      sourceId: input.source?.id ?? publicTelegramSourceId("disabled"),
      url: input.url,
      fetched: 0,
      imported: 0,
      queued: 0,
      skipped: 0
    };
  }
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();
  const channel = parsePublicTelegramChannelUrl(input.url);
  const page = await fetchPublicChannelPage(fetcher, channel.username, input.briefing.id, input.repo, now);

  if (page.notModified) {
    await recordSuccessfulTelegramFetch(input, input.source ? [input.source] : [], new Set(), now);
    return {
      sourceId: input.source?.id ?? publicTelegramSourceId(channel.username),
      title: input.source?.title,
      url: channel.publicUrl,
      fetched: 0,
      imported: 0,
      queued: 0,
      skipped: 0
    };
  }

  const html = page.html;
  const rawPayloadKey = await archiveTelegramPageIfChanged(input, channel.username, html, now);

  const messages = parsePublicTelegramChannelPage(html, {
    username: channel.username,
    receivedAt: now,
    retentionDays: input.briefing.retentionDays
  }).map((message) => ({ ...message, rawPayloadKey }));
  if (page.hasMessageMarkup && messages.length === 0) {
    throw new Error(`Telegram public page for @${channel.username} contained messages that could not be parsed`);
  }

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
      if (!briefing || briefing.paused || !briefing.publicFeedEnabled || !target.enabled) continue;
      const targetOwner = await input.repo.getAccountById(briefing.ownerAccountId);
      if (!targetOwner || targetOwner.disabledAt) continue;
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

  const equivalentSources = source
    ? await input.repo.listEquivalentSources(source.id)
    : [];
  const successfulSources = equivalentSources.length > 0 ? equivalentSources : source ? [source] : [];
  await recordSuccessfulTelegramFetch(input, successfulSources, importedBriefingIds, now);

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

async function fetchPublicChannelPage(
  fetcher: typeof fetch,
  username: string,
  briefingId: string,
  repo: Repository,
  now: Date
): Promise<{ html: string; notModified: false; hasMessageMarkup: boolean } | { html: ""; notModified: true; hasMessageMarkup: false }> {
  const candidates = [
    `https://telegram.me/s/${username}`,
    `https://telegram.dog/s/${username}`,
    `https://t.me/s/${username}`
  ];
  const errors: string[] = [];
  for (const url of candidates) {
    const hostname = new URL(url).hostname;
    const etagKey = telegramValidatorSetting(briefingId, username, hostname, "etag");
    const modifiedKey = telegramValidatorSetting(briefingId, username, hostname, "last-modified");
    const etag = await repo.getSetting(etagKey);
    const lastModified = await repo.getSetting(modifiedKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchTelegramResponse(fetcher, url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; DistilledNewsBot/1.0; +https://distilled.news)",
          ...(etag ? { "if-none-match": etag } : {}),
          ...(lastModified ? { "if-modified-since": lastModified } : {})
        },
        signal: controller.signal
      });
      if (response.status === 304) {
        if (!etag && !lastModified) throw new Error(`${hostname}: unexpected 304 without a stored validator`);
        return { html: "", notModified: true, hasMessageMarkup: false };
      }
      if (!response.ok) throw new Error(`${hostname}: ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error(`${hostname}: returned non-HTML content`);
      }
      const html = await readBoundedText(response, TELEGRAM_MAX_RESPONSE_BYTES, controller.signal);
      const structure = validateTelegramPublicPage(html, username);
      const nextEtag = response.headers.get("etag");
      const nextLastModified = response.headers.get("last-modified");
      if (nextEtag) await repo.setSetting(etagKey, nextEtag, now);
      if (nextLastModified) await repo.setSetting(modifiedKey, nextLastModified, now);
      return { html, notModified: false, hasMessageMarkup: structure.hasMessageMarkup };
    } catch (error) {
      errors.push(error instanceof Error && error.name === "AbortError"
        ? `${hostname}: timed out`
        : error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Could not fetch public Telegram channel @${username} (${errors.join("; ")})`);
}

async function fetchTelegramResponse(
  fetcher: typeof fetch,
  initialUrl: string,
  init: RequestInit
): Promise<Response> {
  let current = assertSafeTelegramUrl(initialUrl);
  for (let redirects = 0; redirects <= TELEGRAM_MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Telegram redirected without a location");
    if (redirects >= TELEGRAM_MAX_REDIRECTS) throw new Error("Telegram redirected too many times");
    current = assertSafeTelegramUrl(new URL(location, current).toString());
  }
  throw new Error("Telegram redirected too many times");
}

function assertSafeTelegramUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || !TELEGRAM_PUBLIC_HOSTS.has(hostname)) {
    throw new Error("Telegram redirect left the approved public hosts");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

async function readBoundedText(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`Telegram response exceeds ${maxBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Telegram fetch timed out", "AbortError")), { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Telegram response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function validateTelegramPublicPage(html: string, username: string): { hasMessageMarkup: boolean } {
  const normalized = html.toLowerCase();
  if (
    normalized.includes("<title>just a moment") ||
    normalized.includes("cf-chl-") ||
    normalized.includes("challenge-platform") ||
    normalized.includes("captcha") ||
    normalized.includes("tgme_page_error") ||
    normalized.includes("login_form")
  ) {
    throw new Error(`Telegram public page for @${username} returned a challenge or error page`);
  }
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasMessageMarkup =
    /class=["'][^"']*\btgme_widget_message(?:_wrap)?\b/i.test(html) &&
    new RegExp(`data-post=["']${escapedUsername}/\\d+["']`, "i").test(html);
  const hasChannelShell =
    /property=["']og:title["']/i.test(html) &&
    /class=["'][^"']*\b(?:tgme_channel_info|tgme_page_title)\b/i.test(html);
  if (!hasMessageMarkup && !hasChannelShell) {
    throw new Error(`Telegram public page for @${username} did not contain a public channel structure`);
  }
  return { hasMessageMarkup };
}

function telegramValidatorSetting(
  briefingId: string,
  username: string,
  hostname: string,
  kind: "etag" | "last-modified"
): string {
  return `telegram_http:${briefingId}:${username.toLowerCase()}:${hostname}:${kind}`;
}

export async function refreshPublicTelegramSources(input: Omit<PublicTelegramIngestInput, "url">): Promise<PublicTelegramIngestResult[]> {
  if (input.briefing.paused || !input.briefing.publicFeedEnabled) return [];

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

async function recordSuccessfulTelegramFetch(
  input: PublicTelegramIngestInput,
  successfulSources: SourceRecord[],
  importedBriefingIds: Set<string>,
  now: Date
): Promise<void> {
  const successfulBriefingIds = new Set(successfulSources.map((candidate) => candidate.briefingId));
  if (successfulBriefingIds.size === 0) successfulBriefingIds.add(input.briefing.id);
  for (const briefingId of successfulBriefingIds) await markSourceFetch(input.repo, briefingId, now);
  if (importedBriefingIds.size > 0) {
    for (const briefingId of importedBriefingIds) await markImportedMessage(input.repo, briefingId, now);
    await input.repo.setSetting("last_telegram_event_at", now.toISOString(), now);
    for (const briefingId of importedBriefingIds) {
      await input.repo.setSetting(`last_telegram_event_at:${briefingId}`, now.toISOString(), now);
    }
  }
  for (const successfulSource of successfulSources) {
    await input.repo.updateSourceState({
      sourceId: successfulSource.id,
      lastCheckedAt: now.toISOString()
    }, now);
    await input.repo.recordSourceSuccess(
      successfulSource.id,
      importedBriefingIds.has(successfulSource.briefingId) ? now.toISOString() : undefined,
      now
    );
  }
}

function scopedRawMessageId(briefingId: string, rawMessageId: string): string {
  return `${briefingId}::${rawMessageId}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
