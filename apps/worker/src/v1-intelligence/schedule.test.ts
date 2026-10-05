import {expect,it} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {LIVE_INTERVALS,livePublicationWindow,liveScheduleSchema,publicationWindowSchema,nextLiveBriefingAt} from './schedule';
import {publicationWindow} from './runtime';
it('calculates the next live boundary and daily delivery in the inferred local zone',()=>{
 expect(nextLiveBriefingAt({durationMinutes:120,timezone:'Asia/Beirut'},new Date('2026-10-04T12:20:00Z'))).toBe('2026-10-04T13:00:00.000Z');
 expect(nextLiveBriefingAt({durationMinutes:1440,timezone:'Asia/Beirut',deliveryAnchor:'08:00'},new Date('2026-10-04T05:00:00Z'))).toBe('2026-10-05T05:00:00.000Z');
 expect(nextLiveBriefingAt({durationMinutes:1440,timezone:'America/New_York',deliveryAnchor:'08:00'},new Date('2026-03-07T14:00:00Z'))).toBe('2026-03-08T12:00:00.000Z');
});
it.each(LIVE_INTERVALS)('supports a closed %i-minute live window without separate ranking engines',durationMinutes=>{
 const window=livePublicationWindow({durationMinutes,timezone:'UTC'},new Date('2026-10-04T12:20:00Z'));
 expect(Date.parse(window.end)).toBeLessThanOrEqual(Date.parse('2026-10-04T12:20:00Z'));
 expect(Date.parse(window.end)-Date.parse(window.start)).toBe(durationMinutes*60000);
 expect(window).toMatchObject({durationMinutes,timezone:'UTC'});
 expect(window.kind).not.toBe('WEEKLY');
});
it('aligns 24h to 08:00 Beirut and never closes a future window',()=>{
 const schedule={durationMinutes:1440 as const,timezone:'Asia/Beirut',deliveryAnchor:'08:00'};
 const before=livePublicationWindow(schedule,new Date('2026-10-04T04:59:59Z'));
 const at=livePublicationWindow(schedule,new Date('2026-10-04T05:00:00Z'));
 expect(before.end).toBe('2026-10-03T05:00:00.000Z');expect(at.end).toBe('2026-10-04T05:00:00.000Z');
 expect(at.start).toBe(before.end);
});
it.each([['2026-03-08T12:00:00Z',23],['2026-11-01T13:00:00Z',25]] as const)('uses calendar daily anchors across DST at %s', (instant,hours)=>{
 const window=livePublicationWindow({durationMinutes:1440,timezone:'America/New_York',deliveryAnchor:'08:00'},new Date(instant));
 expect(Date.parse(window.end)-Date.parse(window.start)).toBe(hours*3600000);
 expect(Temporal.Instant.from(window.start).toZonedDateTimeISO('America/New_York').hour).toBe(8);
 expect(Temporal.Instant.from(window.end).toZonedDateTimeISO('America/New_York').hour).toBe(8);
});
it.each([30,60,120,360,720] as const)('has no DST gap or overlap between consecutive %i-minute windows',durationMinutes=>{
 const schedule={durationMinutes,timezone:'America/New_York',deliveryAnchor:'08:00'};
 for(const now of ['2026-03-08T12:00:00Z','2026-11-01T13:00:00Z']) {
  const last=livePublicationWindow(schedule,new Date(now));
  const previous=livePublicationWindow(schedule,new Date(last.start));
  expect(previous.end).toBe(last.start);
  expect(Date.parse(last.end)-Date.parse(last.start)).toBeGreaterThan(0);
  expect(Date.parse(last.end)-Date.parse(last.start)).toBeLessThanOrEqual(durationMinutes*60000);
 }
});
it('Beirut calendar anchors retain local 08:00 at its own DST boundary',()=>{
 const window=livePublicationWindow({durationMinutes:1440,timezone:'Asia/Beirut',deliveryAnchor:'08:00'},new Date('2026-03-29T05:00:00Z'));
 expect(Date.parse(window.end)-Date.parse(window.start)).toBe(23*3600000);
 expect(Temporal.Instant.from(window.start).toZonedDateTimeISO('Asia/Beirut').hour).toBe(8);
 expect(Temporal.Instant.from(window.end).toZonedDateTimeISO('Asia/Beirut').hour).toBe(8);
});
it('live wire validation rejects arbitrary bounds, mismatched kind, missing timezone and weekly duration',()=>{
 const live=livePublicationWindow({durationMinutes:120,timezone:'UTC'},new Date('2026-10-04T12:00:00Z'));
 expect(publicationWindowSchema.safeParse(live).success).toBe(true);
 expect(publicationWindowSchema.safeParse({...live,start:'2026-10-04T11:00:00Z'}).success).toBe(false);
 expect(publicationWindowSchema.safeParse({...live,kind:'WEEKLY'}).success).toBe(false);
 expect(publicationWindowSchema.safeParse({...live,timezone:undefined}).success).toBe(false);
 expect(publicationWindowSchema.safeParse({...live,durationMinutes:10080}).success).toBe(false);
 expect(publicationWindowSchema.safeParse(publicationWindow('HOURLY',new Date('2026-10-04T12:00:00Z'))).success).toBe(true);
});
it('resolves nonexistent and repeated local anchors through standard timezone disambiguation',()=>{
 const gap=livePublicationWindow({durationMinutes:1440,timezone:'America/New_York',deliveryAnchor:'02:30'},new Date('2026-03-08T07:30:00Z'));
 expect(gap.end).toBe('2026-03-08T07:30:00.000Z');
 const repeat=livePublicationWindow({durationMinutes:1440,timezone:'America/New_York',deliveryAnchor:'01:30'},new Date('2026-11-01T06:30:00Z'));
 expect(repeat.end).toBe('2026-11-01T05:30:00.000Z');
});
it('rejects weekly and fixed offsets in new live scheduling while historical UTC windows reproduce',()=>{
 expect(liveScheduleSchema.safeParse({durationMinutes:10080,timezone:'UTC'}).success).toBe(false);
 expect(liveScheduleSchema.safeParse({durationMinutes:60,timezone:'+03:00'}).success).toBe(false);
 expect(liveScheduleSchema.safeParse({durationMinutes:60,timezone:'invalid/timezone'}).success).toBe(false);
 expect(publicationWindow('WEEKLY',new Date('2026-10-04T12:00:00Z'))).toEqual({start:'2026-09-21T00:00:00.000Z',end:'2026-09-28T00:00:00.000Z',kind:'WEEKLY'});
});
