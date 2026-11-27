import type { BriefingConfig } from '@distilled/core';

const day = 86_400_000;
const maxCatchUpDays = 60;
const legacyIntervals = { hourly: 60, daily: 1440, weekly: 10_080, monthly: 43_200 };

export interface EditionCursor {
  publishedAt: string;
  id: string;
}

export interface EditionWindow {
  since: string;
  until: string;
  limit: number;
  before?: EditionCursor;
  excludeOpenedBy?: string;
}

export async function readerInterval(feed: BriefingConfig, db?: D1Database): Promise<number> {
  const persisted = await db?.prepare(`SELECT json_extract(json,'$.briefingSchedule.durationMinutes') AS minutes
    FROM v1_feeds WHERE id=?`).bind(feed.id).first<{ minutes: number | null }>();
  return persisted?.minutes ?? feed.updateIntervalMinutes ?? legacyIntervals[feed.briefingCadence];
}

export function readerHistoryDays(minutes: number): number {
  if (minutes <= 60) return 1;
  return minutes <= 120 ? 2 : 3;
}

export function catchUpHistoryDays(minutes: number): number {
  return Math.min(maxCatchUpDays, Math.max(readerHistoryDays(minutes), Math.ceil(minutes * 2 / 1440)));
}

export function catchUpOpenExpiry(publishedAt:string):string {
  return new Date(Date.parse(publishedAt)+maxCatchUpDays*day).toISOString();
}

export async function expireCatchUpOpens(db:D1Database,now:Date) {
  await db.prepare(`DELETE FROM catch_up_opened_editions WHERE rowid IN (
    SELECT rowid FROM catch_up_opened_editions WHERE expires_at<? ORDER BY expires_at LIMIT 500
  )`).bind(now.toISOString()).run();
}

export function editionWindow(now: Date, days: number, limit: number, before?: EditionCursor): EditionWindow {
  return { since: new Date(now.getTime() - days * day).toISOString(), until: now.toISOString(), limit, before };
}
