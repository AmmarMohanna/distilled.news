import type { BriefingConfig } from '@distilled/core';

const day = 86_400_000;
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
  return Math.min(60, Math.max(readerHistoryDays(minutes), Math.ceil(minutes * 2 / 1440)));
}

export function editionWindow(now: Date, days: number, limit: number, before?: EditionCursor): EditionWindow {
  return { since: new Date(now.getTime() - days * day).toISOString(), until: now.toISOString(), limit, before };
}
