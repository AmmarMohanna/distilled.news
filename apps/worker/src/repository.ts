import {
  personalNewsBriefing,
  type BriefingConfig,
  type BriefingEvidence,
  type BriefingItem,
  type MediaReference,
  type NormalizedMessage
} from "@lownoise/core";
import type { Env, HealthStatus, Repository, TelegramSourceRecord } from "./types";

type DbValue = string | number | null;

interface BriefingRow {
  id: string;
  slug: string;
  title: string;
  interest_profile: string;
  style_instruction: string | null;
  public_feed_enabled: number;
  paused?: number;
  language?: "en" | "ar" | null;
  retention_days: number;
}

interface SourceRow {
  id: string;
  briefing_id: string;
  title: string;
  type: "channel" | "group";
  username: string | null;
  enabled: number;
  last_seen_at: string;
}

interface RawMessageRow {
  id: string;
  source_id: string;
  message_id: string;
  text: string;
  links_json: string;
  media_json: string;
  posted_at: string;
  received_at: string;
  source_url: string | null;
  raw_payload_key: string | null;
  expires_at: string;
  title: string;
  type: "channel" | "group";
  username: string | null;
}

interface BriefingItemRow {
  id: string;
  cluster_id: string;
  summary: string;
  item_at: string;
  updated_at: string;
  expires_at: string;
  merged_update_count: number;
}

interface EvidenceRow {
  raw_message_id: string;
  source_id: string;
  source_title: string;
  source_type: "channel" | "group";
  source_url: string | null;
  posted_at: string;
  text: string;
  links_json: string;
  media_json: string;
}

export class D1Repository implements Repository {
  constructor(private readonly db: D1Database) {}

  async ensureDefaultBriefing(now = new Date()): Promise<BriefingConfig> {
    const existing = await this.getBriefingBySlug(personalNewsBriefing.slug);
    if (existing) return existing;
    return this.upsertBriefing(personalNewsBriefing, now);
  }

  async listBriefings(): Promise<BriefingConfig[]> {
    const rows = await all<BriefingRow>(
      this.db.prepare(
        "SELECT id, slug, title, interest_profile, style_instruction, public_feed_enabled, paused, language, retention_days FROM briefings ORDER BY created_at ASC"
      )
    );
    return rows.map(rowToBriefing);
  }

  async getBriefingById(id: string): Promise<BriefingConfig | null> {
    const row = await first<BriefingRow>(
      this.db
        .prepare(
          "SELECT id, slug, title, interest_profile, style_instruction, public_feed_enabled, paused, language, retention_days FROM briefings WHERE id = ?"
        )
        .bind(id)
    );
    return row ? rowToBriefing(row) : null;
  }

  async getBriefingBySlug(slug: string): Promise<BriefingConfig | null> {
    const row = await first<BriefingRow>(
      this.db
        .prepare(
          "SELECT id, slug, title, interest_profile, style_instruction, public_feed_enabled, paused, language, retention_days FROM briefings WHERE slug = ?"
        )
        .bind(slug)
    );
    return row ? rowToBriefing(row) : null;
  }

  async upsertBriefing(input: BriefingConfig, now = new Date()): Promise<BriefingConfig> {
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        `INSERT INTO briefings (
          id, slug, title, interest_profile, style_instruction, public_feed_enabled, paused, language, retention_days, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          interest_profile = excluded.interest_profile,
          style_instruction = excluded.style_instruction,
          public_feed_enabled = excluded.public_feed_enabled,
          paused = excluded.paused,
          language = excluded.language,
          retention_days = excluded.retention_days,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.id,
        input.slug,
        input.title,
        input.interestProfile,
        input.styleInstruction ?? null,
        input.publicFeedEnabled ? 1 : 0,
        input.paused ? 1 : 0,
        input.language,
        input.retentionDays,
        timestamp,
        timestamp
      )
      .run();
    return input;
  }

  async listSources(briefingId: string): Promise<TelegramSourceRecord[]> {
    const rows = await all<SourceRow>(
      this.db
        .prepare(
          "SELECT id, briefing_id, title, type, username, enabled, last_seen_at FROM telegram_sources WHERE briefing_id = ? ORDER BY last_seen_at DESC"
        )
        .bind(briefingId)
    );
    return rows.map(rowToSource);
  }

  async getSource(sourceId: string): Promise<TelegramSourceRecord | null> {
    const row = await first<SourceRow>(
      this.db
        .prepare(
          "SELECT id, briefing_id, title, type, username, enabled, last_seen_at FROM telegram_sources WHERE id = ?"
        )
        .bind(sourceId)
    );
    return row ? rowToSource(row) : null;
  }

  async setSourceEnabled(sourceId: string, enabled: boolean, now = new Date()): Promise<void> {
    await this.db
      .prepare("UPDATE telegram_sources SET enabled = ?, updated_at = ? WHERE id = ?")
      .bind(enabled ? 1 : 0, now.toISOString(), sourceId)
      .run();
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.db.prepare("DELETE FROM telegram_sources WHERE id = ?").bind(sourceId).run();
  }

  async upsertSourceFromMessage(
    briefingId: string,
    message: NormalizedMessage,
    now = new Date()
  ): Promise<TelegramSourceRecord> {
    const existingSourceId = await first<{ id: string }>(
      this.db
        .prepare(
          `SELECT id
          FROM telegram_sources
          WHERE briefing_id = ?
            AND ((username IS NOT NULL AND username = ?) OR title = ?)
          LIMIT 1`
        )
        .bind(briefingId, message.source.username ?? null, message.source.title)
    );
    const sourceId = existingSourceId?.id ?? scopedSourceId(briefingId, message.source.id);
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        `INSERT INTO telegram_sources (
          id, briefing_id, title, type, username, enabled, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          type = excluded.type,
          username = excluded.username,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        sourceId,
        briefingId,
        message.source.title,
        message.source.type,
        message.source.username ?? null,
        message.receivedAt,
        timestamp,
        timestamp
      )
      .run();

    const source = (await this.listSources(briefingId)).find((item) => item.id === message.source.id);
    if (!source) throw new Error("Failed to upsert source");
    return source;
  }

  async saveRawMessage(briefingId: string, message: NormalizedMessage, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO raw_messages (
          id, briefing_id, source_id, message_id, text, links_json, media_json, posted_at,
          received_at, source_url, raw_payload_key, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        message.id,
        briefingId,
        message.source.id,
        message.messageId,
        message.text,
        JSON.stringify(message.links),
        JSON.stringify(message.media),
        message.postedAt,
        message.receivedAt,
        message.sourceUrl ?? null,
        message.rawPayloadKey ?? null,
        message.expiresAt,
        now.toISOString()
      )
      .run();
  }

  async getRawMessage(id: string): Promise<NormalizedMessage | null> {
    const row = await first<RawMessageRow>(
      this.db
        .prepare(
          `SELECT raw_messages.*, telegram_sources.title, telegram_sources.type, telegram_sources.username
          FROM raw_messages
          JOIN telegram_sources ON telegram_sources.id = raw_messages.source_id
          WHERE raw_messages.id = ?`
        )
        .bind(id)
    );
    return row ? rowToRawMessage(row) : null;
  }

  async createProcessingJob(briefingId: string, rawMessageId: string, now = new Date()): Promise<string> {
    const id = `job_${crypto.randomUUID()}`;
    const timestamp = now.toISOString();
    await this.db
      .prepare(
        "INSERT INTO processing_jobs (id, briefing_id, raw_message_id, state, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)"
      )
      .bind(id, briefingId, rawMessageId, timestamp, timestamp)
      .run();
    return id;
  }

  async completeProcessingJob(jobId: string, now = new Date()): Promise<void> {
    await this.db
      .prepare("UPDATE processing_jobs SET state = 'completed', updated_at = ? WHERE id = ?")
      .bind(now.toISOString(), jobId)
      .run();
  }

  async failProcessingJob(jobId: string, error: string, now = new Date()): Promise<void> {
    await this.db
      .prepare("UPDATE processing_jobs SET state = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind(error, now.toISOString(), jobId)
      .run();
  }

  async getExistingItems(briefingId: string, now = new Date()): Promise<BriefingItem[]> {
    const rows = await all<BriefingItemRow>(
      this.db
        .prepare(
          "SELECT id, cluster_id, summary, item_at, updated_at, expires_at, merged_update_count FROM briefing_items WHERE briefing_id = ? AND expires_at > ? ORDER BY item_at DESC"
        )
        .bind(briefingId, now.toISOString())
    );
    const items: BriefingItem[] = [];
    for (const row of rows) {
      items.push({ ...rowToBriefingItem(row), evidence: await this.getEvidence(row.id) });
    }
    return items;
  }

  async saveBriefingItems(briefingId: string, items: BriefingItem[], now = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    for (const item of items) {
      await this.db
        .prepare(
          `INSERT INTO clusters (id, briefing_id, status, first_seen_at, last_updated_at, expires_at)
          VALUES (?, ?, 'published', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = 'published',
            last_updated_at = excluded.last_updated_at,
            expires_at = excluded.expires_at`
        )
        .bind(item.clusterId, briefingId, item.itemAt, item.updatedAt, item.expiresAt)
        .run();

      await this.db
        .prepare(
          `INSERT INTO briefing_items (
            id, briefing_id, cluster_id, summary, item_at, updated_at, expires_at, merged_update_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            summary = excluded.summary,
            updated_at = excluded.updated_at,
            expires_at = excluded.expires_at,
            merged_update_count = excluded.merged_update_count`
        )
        .bind(
          item.id,
          briefingId,
          item.clusterId,
          item.summary,
          item.itemAt,
          item.updatedAt,
          item.expiresAt,
          item.mergedUpdateCount
        )
        .run();

      for (const evidence of item.evidence) {
        await this.db
          .prepare(
            `INSERT OR IGNORE INTO briefing_item_evidence (
              id, briefing_item_id, raw_message_id, source_id, source_title, source_type,
              source_url, posted_at, text, links_json, media_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            `evidence_${item.id}_${evidence.messageId}`,
            item.id,
            evidence.messageId,
            evidence.sourceId,
            evidence.sourceTitle,
            evidence.sourceType,
            evidence.sourceUrl ?? null,
            evidence.postedAt,
            evidence.text,
            JSON.stringify(evidence.links),
            JSON.stringify(evidence.media)
          )
          .run();
      }
    }

    await this.db
      .prepare("UPDATE raw_messages SET processed_at = ? WHERE id IN (SELECT raw_message_id FROM briefing_item_evidence)")
      .bind(timestamp)
      .run();
  }

  async listFeedItems(slug: string, includePrivate: boolean, now = new Date()): Promise<BriefingItem[]> {
    const briefing = await this.getBriefingBySlug(slug);
    if (!briefing) return [];
    if (!includePrivate && !briefing.publicFeedEnabled) return [];
    return this.getExistingItems(briefing.id, now);
  }

  async getHealth(briefingId?: string): Promise<HealthStatus> {
    const lastTelegramEventAt =
      (briefingId
        ? await this.getSetting(`last_telegram_event_at:${briefingId}`)
        : null) ??
      (await this.getSetting("last_telegram_event_at")) ??
      undefined;
    const rows = briefingId
      ? await all<{ state: "queued" | "completed" | "failed"; count: number }>(
          this.db
            .prepare("SELECT state, COUNT(*) as count FROM processing_jobs WHERE briefing_id = ? GROUP BY state")
            .bind(briefingId)
        )
      : await all<{ state: "queued" | "completed" | "failed"; count: number }>(
          this.db.prepare("SELECT state, COUNT(*) as count FROM processing_jobs GROUP BY state")
        );
    const processing = { queued: 0, completed: 0, failed: 0 };
    for (const row of rows) processing[row.state] = row.count;
    return {
      lastTelegramEventAt,
      processing
    };
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await first<{ value: string }>(this.db.prepare("SELECT value FROM settings WHERE key = ?").bind(key));
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string, now = new Date()): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(key, value, now.toISOString())
      .run();
  }

  async deleteExpired(now = new Date()): Promise<number> {
    const timestamp = now.toISOString();
    const result = await this.db
      .prepare("DELETE FROM raw_messages WHERE expires_at <= ?")
      .bind(timestamp)
      .run();
    await this.db.prepare("DELETE FROM briefing_items WHERE expires_at <= ?").bind(timestamp).run();
    await this.db.prepare("DELETE FROM clusters WHERE expires_at <= ?").bind(timestamp).run();
    return Number(result.meta.changes ?? 0);
  }

  private async getEvidence(itemId: string): Promise<BriefingEvidence[]> {
    const rows = await all<EvidenceRow>(
      this.db
        .prepare(
          `SELECT raw_message_id, source_id, source_title, source_type, source_url, posted_at, text, links_json, media_json
          FROM briefing_item_evidence
          WHERE briefing_item_id = ?
          ORDER BY posted_at ASC`
        )
        .bind(itemId)
    );
    return rows.map(rowToEvidence);
  }
}

export class InMemoryRepository implements Repository {
  briefings = new Map<string, BriefingConfig>();
  sources = new Map<string, TelegramSourceRecord>();
  rawMessages = new Map<string, NormalizedMessage>();
  itemsByBriefing = new Map<string, Map<string, BriefingItem>>();
  jobs = new Map<string, { id: string; briefingId: string; rawMessageId: string; state: "queued" | "completed" | "failed"; error?: string }>();
  settings = new Map<string, string>();

  async ensureDefaultBriefing(): Promise<BriefingConfig> {
    const existing = await this.getBriefingBySlug(personalNewsBriefing.slug);
    if (existing) return existing;
    this.briefings.set(personalNewsBriefing.id, { ...personalNewsBriefing });
    return { ...personalNewsBriefing };
  }

  async listBriefings(): Promise<BriefingConfig[]> {
    return Array.from(this.briefings.values()).map((briefing) => ({ ...briefing }));
  }

  async getBriefingById(id: string): Promise<BriefingConfig | null> {
    return this.briefings.get(id) ?? null;
  }

  async getBriefingBySlug(slug: string): Promise<BriefingConfig | null> {
    return Array.from(this.briefings.values()).find((briefing) => briefing.slug === slug) ?? null;
  }

  async upsertBriefing(input: BriefingConfig): Promise<BriefingConfig> {
    this.briefings.set(input.id, { ...input });
    return { ...input };
  }

  async listSources(briefingId: string): Promise<TelegramSourceRecord[]> {
    return Array.from(this.sources.values()).filter((source) => source.briefingId === briefingId);
  }

  async getSource(sourceId: string): Promise<TelegramSourceRecord | null> {
    const source = this.sources.get(sourceId);
    return source ? { ...source } : null;
  }

  async setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
    const source = this.sources.get(sourceId);
    if (source) source.enabled = enabled;
  }

  async deleteSource(sourceId: string): Promise<void> {
    this.sources.delete(sourceId);
    for (const [id, message] of this.rawMessages) {
      if (message.source.id === sourceId) this.rawMessages.delete(id);
    }
  }

  async upsertSourceFromMessage(briefingId: string, message: NormalizedMessage): Promise<TelegramSourceRecord> {
    const existing = Array.from(this.sources.values()).find(
      (source) =>
        source.briefingId === briefingId &&
        ((source.username && source.username === message.source.username) || source.title === message.source.title)
    );
    const source: TelegramSourceRecord = {
      id: existing?.id ?? scopedSourceId(briefingId, message.source.id),
      briefingId,
      title: message.source.title,
      type: message.source.type,
      username: message.source.username,
      url: message.source.username ? `https://t.me/${message.source.username}` : undefined,
      enabled: existing?.enabled ?? false,
      lastSeenAt: message.receivedAt
    };
    this.sources.set(source.id, source);
    return source;
  }

  async saveRawMessage(_briefingId: string, message: NormalizedMessage): Promise<void> {
    this.rawMessages.set(message.id, message);
  }

  async getRawMessage(id: string): Promise<NormalizedMessage | null> {
    return this.rawMessages.get(id) ?? null;
  }

  async createProcessingJob(briefingId: string, rawMessageId: string): Promise<string> {
    const id = `job_${this.jobs.size + 1}`;
    this.jobs.set(id, { id, briefingId, rawMessageId, state: "queued" });
    return id;
  }

  async completeProcessingJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) job.state = "completed";
  }

  async failProcessingJob(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = "failed";
      job.error = error;
    }
  }

  async getExistingItems(briefingId: string, now = new Date()): Promise<BriefingItem[]> {
    return Array.from(this.itemsByBriefing.get(briefingId)?.values() ?? []).filter(
      (item) => new Date(item.expiresAt).getTime() > now.getTime()
    );
  }

  async saveBriefingItems(briefingId: string, items: BriefingItem[]): Promise<void> {
    const scoped = this.itemsByBriefing.get(briefingId) ?? new Map<string, BriefingItem>();
    for (const item of items) scoped.set(item.id, structuredClone(item));
    this.itemsByBriefing.set(briefingId, scoped);
  }

  async listFeedItems(slug: string, includePrivate: boolean, now = new Date()): Promise<BriefingItem[]> {
    const briefing = await this.getBriefingBySlug(slug);
    if (!briefing) return [];
    if (!includePrivate && !briefing.publicFeedEnabled) return [];
    return this.getExistingItems(briefing.id, now);
  }

  async getHealth(briefingId?: string): Promise<HealthStatus> {
    const processing = { queued: 0, completed: 0, failed: 0 };
    for (const job of this.jobs.values()) {
      if (!briefingId || job.briefingId === briefingId) processing[job.state] += 1;
    }
    return {
      lastTelegramEventAt:
        (briefingId ? this.settings.get(`last_telegram_event_at:${briefingId}`) : undefined) ??
        this.settings.get("last_telegram_event_at"),
      processing
    };
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async deleteExpired(now = new Date()): Promise<number> {
    let deleted = 0;
    for (const [id, message] of this.rawMessages) {
      if (new Date(message.expiresAt).getTime() <= now.getTime()) {
        this.rawMessages.delete(id);
        deleted += 1;
      }
    }
    for (const items of this.itemsByBriefing.values()) {
      for (const [id, item] of items) {
        if (new Date(item.expiresAt).getTime() <= now.getTime()) items.delete(id);
      }
    }
    return deleted;
  }
}

function scopedSourceId(briefingId: string, sourceId: string): string {
  return `${briefingId}::${sourceId}`;
}

function rowToBriefing(row: BriefingRow): BriefingConfig {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    interestProfile: row.interest_profile,
    styleInstruction: row.style_instruction ?? undefined,
    publicFeedEnabled: row.public_feed_enabled === 1,
    paused: row.paused === 1,
    language: row.language === "ar" ? "ar" : "en",
    retentionDays: row.retention_days
  };
}

function rowToSource(row: SourceRow): TelegramSourceRecord {
  return {
    id: row.id,
    briefingId: row.briefing_id,
    title: row.title,
    type: row.type,
    username: row.username ?? undefined,
    url: row.username ? `https://t.me/${row.username}` : undefined,
    enabled: row.enabled === 1,
    lastSeenAt: row.last_seen_at
  };
}

function rowToRawMessage(row: RawMessageRow): NormalizedMessage {
  return {
    id: row.id,
    source: {
      id: row.source_id,
      title: row.title,
      type: row.type,
      username: row.username ?? undefined
    },
    messageId: row.message_id,
    text: row.text,
    links: parseJson<string[]>(row.links_json, []),
    media: parseJson<MediaReference[]>(row.media_json, []),
    postedAt: row.posted_at,
    receivedAt: row.received_at,
    sourceUrl: row.source_url ?? undefined,
    rawPayloadKey: row.raw_payload_key ?? undefined,
    expiresAt: row.expires_at
  };
}

function rowToBriefingItem(row: BriefingItemRow): Omit<BriefingItem, "evidence"> {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    summary: row.summary,
    itemAt: row.item_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    mergedUpdateCount: row.merged_update_count
  };
}

function rowToEvidence(row: EvidenceRow): BriefingEvidence {
  return {
    messageId: row.raw_message_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    postedAt: row.posted_at,
    text: row.text,
    links: parseJson<string[]>(row.links_json, []),
    media: parseJson<MediaReference[]>(row.media_json, [])
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  return (await statement.first<T>()) ?? null;
}

async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}
