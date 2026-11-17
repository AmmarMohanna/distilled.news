import {expect,it} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {LIVE_INTERVALS,livePublicationWindow,liveScheduleSchema,publicationWindowSchema,nextLiveBriefingAt,firstClockBriefingAt,DELIVERY_LEAD_MS} from './schedule';
import {publicationWindow,isAutomaticReportingWindow} from './runtime';
it('one-off evaluation windows remain callable but are not automatic reporting intervals',()=>{
 expect(isAutomaticReportingWindow({start:'2026-10-18T17:29:22.206Z',end:'2026-10-19T17:29:22.206Z',kind:'DAILY'})).toBe(false);
 expect(isAutomaticReportingWindow(publicationWindow('HOURLY',new Date('2026-10-21T07:30:00Z')))).toBe(true);
 expect(isAutomaticReportingWindow(livePublicationWindow({durationMinutes:30,timezone:'Asia/Beirut'},new Date('2026-10-21T07:30:00Z')))).toBe(true);
});
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

it.each([30,60,120,360,720] as const)('creation-relative %i-minute windows keep the exact origin and consecutive coverage',durationMinutes=>{
 const originAt='2026-10-22T16:05:40.123Z',schedule={durationMinutes,timezone:'Asia/Beirut',originAt};
 let end=nextLiveBriefingAt(schedule,new Date(originAt)),previous=originAt;
 for(let i=1;i<=6;i++){
  expect(Date.parse(end)).toBe(Date.parse(originAt)+i*durationMinutes*60000);
  const window=livePublicationWindow(schedule,new Date(end));
  expect(window.start).toBe(previous);expect(window.end).toBe(end);
  expect(publicationWindowSchema.safeParse(window).success).toBe(true);expect(isAutomaticReportingWindow(window)).toBe(true);
  expect(publicationWindowSchema.safeParse({...window,start:new Date(Date.parse(window.start)+1).toISOString()}).success).toBe(false);
  previous=end;end=nextLiveBriefingAt(schedule,new Date(end));
 }
});
it('a 19:05 feed closes at 19:35, 20:05 and 20:35 rather than clock half-hours',()=>{
 const schedule={durationMinutes:30 as const,timezone:'Asia/Beirut',originAt:'2026-10-22T16:05:00.000Z'};
 let at=new Date(schedule.originAt);
 for(const local of ['19:35','20:05','20:35']){
  const end=nextLiveBriefingAt(schedule,at);expect(end).toBe(new Date(`2026-10-22T${local}:00+03:00`).toISOString());at=new Date(end);
 }
});
it.each(['2026-03-08T06:45:40.123Z','2026-11-01T05:45:40.123Z','2026-10-22T23:45:40.123Z'])('relative elapsed intervals cross midnight and DST without resetting at %s',originAt=>{
 const schedule={durationMinutes:30 as const,timezone:'America/New_York',originAt};
 const first=nextLiveBriefingAt(schedule,new Date(originAt)),second=nextLiveBriefingAt(schedule,new Date(first));
 expect(Date.parse(first)-Date.parse(originAt)).toBe(1800000);expect(Date.parse(second)-Date.parse(first)).toBe(1800000);
 expect(livePublicationWindow(schedule,new Date(second)).start).toBe(first);
});
it('relative windows require their original policy and cannot predate creation',()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',originAt:'2026-10-22T19:05:40.000Z'};
 const window=livePublicationWindow(schedule,new Date('2026-10-22T19:35:40Z'));
 expect(publicationWindowSchema.safeParse({...window,originAt:undefined}).success).toBe(false);
 expect(publicationWindowSchema.safeParse({...window,schedulePolicy:'local-calendar-anchors-v1'}).success).toBe(false);
 expect(publicationWindowSchema.safeParse(livePublicationWindow(schedule,new Date(schedule.originAt))).success).toBe(false);
});
it('an origin marker does not change daily local delivery or its DST behavior',()=>{
 const schedule={durationMinutes:1440 as const,timezone:'America/New_York',deliveryAnchor:'08:00'};
 const now=new Date('2026-03-08T12:00:00Z');
 const withOrigin={...schedule,originAt:'2026-03-01T19:05:40Z'};
 expect(nextLiveBriefingAt(withOrigin,now)).toBe(nextLiveBriefingAt(schedule,now));
 expect(livePublicationWindow(withOrigin,now)).toMatchObject(livePublicationWindow(schedule,now));
 expect(publicationWindowSchema.safeParse(livePublicationWindow(withOrigin,now)).success).toBe(true);
});

it('the existing collection-window helper starts the new feed scan at its precise origin',async()=>{
 const {initialCollectionStart}=await import('../connector-collection-window');
 const {feedFixture}=await import('./test-utils');
 const originAt='2026-10-22T16:05:40.123Z';
 expect(initialCollectionStart({...feedFixture,createdAt:originAt,briefingSchedule:{durationMinutes:30,timezone:'Asia/Beirut',originAt}},'2026-10-22T16:06:00Z')).toBe(originAt);
});

it.each([
 [30,'2026-10-29T03:08:40.123Z','2026-10-29T03:30:00.000Z'],
 [30,'2026-10-29T03:10:00Z','2026-10-29T03:30:00.000Z'],
 [30,'2026-10-29T03:10:00.001Z','2026-10-29T04:00:00.000Z'],
 [30,'2026-10-29T03:38:00Z','2026-10-29T04:00:00.000Z'],
 [60,'2026-10-29T03:08:00Z','2026-10-29T04:00:00.000Z'],
 [60,'2026-10-29T03:11:00Z','2026-10-29T05:00:00.000Z'],
 [120,'2026-10-29T02:08:00Z','2026-10-29T04:00:00.000Z'],
 [120,'2026-10-29T02:11:00Z','2026-10-29T06:00:00.000Z'],
 [360,'2026-10-29T18:08:00Z','2026-10-30T00:00:00.000Z'],
 [720,'2026-10-29T12:08:00Z','2026-10-30T00:00:00.000Z'],
 [1440,'2026-10-29T08:08:00Z','2026-10-30T08:00:00.000Z'],
] as const)('clock delivery %i created %s first closes for %s',(durationMinutes,clockStartAt,expected)=>{
 const schedule={durationMinutes,clockStartAt,timezone:'UTC',deliveryAnchor:durationMinutes===1440?'08:00':'00:00'};
 expect(firstClockBriefingAt(schedule)).toBe(expected);
 expect(nextLiveBriefingAt(schedule,new Date(clockStartAt))).toBe(expected);
 const first=livePublicationWindow(schedule,new Date(Date.parse(expected)-DELIVERY_LEAD_MS));
 expect(first).toMatchObject({start:clockStartAt,end:new Date(Date.parse(expected)-DELIVERY_LEAD_MS).toISOString(),scheduledFor:expected,schedulePolicy:'clock-aligned-delivery-v1'});
 expect(publicationWindowSchema.safeParse(first).success).toBe(true);expect(isAutomaticReportingWindow(first)).toBe(true);
 expect(publicationWindowSchema.safeParse({...first,scheduledFor:new Date(Date.parse(expected)+60000).toISOString()}).success).toBe(false);
 const secondDelivery=nextLiveBriefingAt(schedule,new Date(expected)),second=livePublicationWindow(schedule,new Date(Date.parse(secondDelivery)-DELIVERY_LEAD_MS));
 expect(second.start).toBe(first.end);
});
it.each(['2026-03-08T06:08:00Z','2026-11-01T05:08:00Z','2026-10-29T23:38:00Z'])('clock windows retain contiguous cutoffs across midnight and DST from %s',clockStartAt=>{
 const schedule={durationMinutes:30 as const,timezone:'America/New_York',clockStartAt};
 let delivery=firstClockBriefingAt(schedule),end=clockStartAt;
 for(let i=0;i<6;i++){
  const window=livePublicationWindow(schedule,new Date(Date.parse(delivery)-DELIVERY_LEAD_MS));
  expect(window.start).toBe(end);expect(Date.parse(window.end)).toBeGreaterThan(Date.parse(end));expect(publicationWindowSchema.safeParse(window).success).toBe(true);
  expect([0,30]).toContain(Temporal.Instant.from(delivery).toZonedDateTimeISO(schedule.timezone).minute);
  end=window.end;delivery=nextLiveBriefingAt(schedule,new Date(delivery));
 }
});
it('starts collection at actual creation rather than the future early cutoff',async()=>{
 const {initialCollectionStart}=await import('../connector-collection-window'),{feedFixture}=await import('./test-utils');
 const clockStartAt='2026-10-29T03:08:40.123Z';
 expect(initialCollectionStart({...feedFixture,createdAt:clockStartAt,briefingSchedule:{durationMinutes:30,timezone:'UTC',clockStartAt}},clockStartAt)).toBe(clockStartAt);
});
it('does not allow a new subdaily clock policy to shift deliveries to :15 or :45',()=>{
 expect(()=>nextLiveBriefingAt({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-29T03:08:00Z',deliveryAnchor:'00:15'},new Date('2026-10-29T03:08:00Z'))).toThrow();
 expect(()=>nextLiveBriefingAt({durationMinutes:1440,timezone:'UTC',clockStartAt:'2026-10-29T03:08:00Z',deliveryAnchor:'08:15'},new Date('2026-10-29T03:08:00Z'))).toThrow();
 expect(nextLiveBriefingAt({durationMinutes:1440,timezone:'UTC',clockStartAt:'2026-10-29T03:08:00Z',deliveryAnchor:'08:30'},new Date('2026-10-29T03:08:00Z'))).toContain('08:30:00');
 expect(nextLiveBriefingAt({durationMinutes:1440,timezone:'UTC',deliveryAnchor:'08:15'},new Date('2026-10-29T03:08:00Z'))).toBe('2026-10-29T08:15:00.000Z');
});
