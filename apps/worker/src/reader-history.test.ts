import { expect, it } from 'vitest';
import type { BriefingConfig } from '@distilled/core';
import { catchUpHistoryDays, editionWindow, readerHistoryDays, readerInterval } from './reader-history';

it.each([[30, 1], [60, 1], [120, 2], [360, 3], [720, 3], [1440, 3]])(
  'uses a %i-minute persisted interval and %i days of timeline history', async (minutes, days) => {
    const feed = { id: 'feed', briefingCadence: 'hourly', updateIntervalMinutes: 60 } as BriefingConfig;
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ minutes }) }) }) } as unknown as D1Database;
    const interval = await readerInterval(feed, db);
    expect(interval).toBe(minutes);
    expect(readerHistoryDays(interval)).toBe(days);
    expect(editionWindow(new Date('2026-11-26T12:00:00Z'), days, 9).since).toBe(`2026-11-${26-days}T12:00:00.000Z`);
  }
);

it('allows a bounded longer catch-up window for retained weekly and monthly schedules', async () => {
  for (const [briefingCadence, days] of [['weekly', 14], ['monthly', 60]] as const) {
    const minutes = await readerInterval({ briefingCadence } as BriefingConfig);
    expect(readerHistoryDays(minutes)).toBe(3);
    expect(catchUpHistoryDays(minutes)).toBe(days);
  }
});
