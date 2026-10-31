import {expect,it} from 'vitest';
import {DELIVERY_LEAD_MS,firstClockBriefingAt,livePublicationWindow,liveScheduleSchema,nextLiveBriefingAt,publicationWindowSchema,type LiveInterval} from './schedule';

const clockPolicy='clock-aligned-delivery-v2' as const;
it.each([
 [30,'03:00:00','03:30:00'],[30,'03:08:00','03:30:00'],
 [30,'03:15:00','03:30:00'],[30,'03:15:00.001','04:00:00'],
 [30,'03:16:00','04:00:00'],[30,'03:45:00','04:00:00'],[30,'03:48:00','04:30:00'],
 [60,'03:11:00','04:00:00'],[60,'03:45:00','04:00:00'],[60,'03:45:00.001','05:00:00'],
 [120,'03:44:00','04:00:00'],[120,'03:46:00','06:00:00'],
 [360,'05:40:00','06:00:00'],[360,'05:50:00','12:00:00'],
 [720,'11:40:00','12:00:00'],
 [1440,'07:00:00','08:00:00'],[1440,'07:40:00','08:00:00'],[1440,'07:45:00','08:00:00']
] as const)('%i-minute first delivery admits creation %s at %s',(durationMinutes,created,expected)=>{
 const clockStartAt=`2026-10-31T${created}Z`,schedule={durationMinutes,timezone:'UTC',clockStartAt,clockPolicy,deliveryAnchor:durationMinutes===1440?'08:00':'00:00'};
 const first=`2026-10-31T${expected}.000Z`;
 expect(firstClockBriefingAt(schedule)).toBe(first);
 expect(nextLiveBriefingAt(schedule,new Date(clockStartAt))).toBe(first);
 const window=livePublicationWindow(schedule,new Date(Date.parse(first)-DELIVERY_LEAD_MS));
 expect(window).toMatchObject({start:clockStartAt,end:new Date(Date.parse(first)-DELIVERY_LEAD_MS).toISOString(),scheduledFor:first,schedulePolicy:clockPolicy,clockPolicy});
 expect(Date.parse(window.end)-Date.parse(clockStartAt)).toBeGreaterThanOrEqual(10*60000);
 expect(publicationWindowSchema.safeParse(window).success).toBe(true);
});
it.each([
 [1440,'2026-10-31T07:45:00.001Z','08:00','2026-11-01T08:00:00.000Z'],
 [1440,'2026-10-31T07:50:00Z','08:00','2026-11-01T08:00:00.000Z'],
 [1440,'2026-10-31T08:11:00Z','08:00','2026-11-01T08:00:00.000Z'],
 [1440,'2026-10-31T10:00:00Z','08:00','2026-11-01T08:00:00.000Z'],
 [1440,'2026-10-31T08:15:00Z','08:30','2026-10-31T08:30:00.000Z'],
 [1440,'2026-10-31T08:15:00.001Z','08:30','2026-11-01T08:30:00.000Z'],
 [1440,'2026-10-31T23:45:00Z','00:00','2026-11-01T00:00:00.000Z'],
 [720,'2026-10-31T11:50:00Z','00:00','2026-11-01T00:00:00.000Z']
] as const)('retains the recurring %i-minute anchor from %s',(durationMinutes,clockStartAt,deliveryAnchor,expected)=>{
 expect(firstClockBriefingAt({durationMinutes,clockStartAt,deliveryAnchor,timezone:'UTC',clockPolicy})).toBe(expected);
});
it.each([
 ['2026-03-07T12:50:00Z','08:00','2026-03-08T12:00:00.000Z'],
 ['2026-10-31T11:50:00Z','08:00','2026-11-01T13:00:00.000Z'],
 ['2026-03-08T07:15:00Z','02:30','2026-03-08T07:30:00.000Z'],
 ['2026-11-01T05:20:00Z','01:30','2026-11-02T06:30:00.000Z']
])('retains local daily time and DST disambiguation from %s',(clockStartAt,deliveryAnchor,expected)=>{
 const schedule={durationMinutes:1440 as const,timezone:'America/New_York',clockStartAt,clockPolicy,deliveryAnchor};
 expect(firstClockBriefingAt(schedule)).toBe(expected);
 let delivery=expected,previous=clockStartAt;
 for(let i=0;i<3;i++){
  const window=livePublicationWindow(schedule,new Date(Date.parse(delivery)-DELIVERY_LEAD_MS));
  expect(window.start).toBe(previous);expect(window.scheduledFor).toBe(delivery);
  expect(publicationWindowSchema.safeParse(window).success).toBe(true);
  previous=window.end;delivery=nextLiveBriefingAt(schedule,new Date(delivery));
 }
});
it.each([30,60,120,360,720,1440] as LiveInterval[])('retains consecutive %i-minute evidence windows and rejects policy reinterpretation',durationMinutes=>{
 const schedule={durationMinutes,timezone:'Asia/Beirut',clockStartAt:'2026-10-31T01:11:40.123Z',clockPolicy,deliveryAnchor:durationMinutes===1440?'08:30':'00:00'};
 let delivery=firstClockBriefingAt(schedule),previous=schedule.clockStartAt;
 for(let i=0;i<4;i++){
  const window=livePublicationWindow(schedule,new Date(Date.parse(delivery)-DELIVERY_LEAD_MS));
  expect(window.start).toBe(previous);expect(window.scheduledFor).toBe(delivery);
  expect(publicationWindowSchema.safeParse(window).success).toBe(true);
  expect(publicationWindowSchema.safeParse({...window,clockPolicy:undefined}).success).toBe(false);
  expect(publicationWindowSchema.safeParse({...window,schedulePolicy:'clock-aligned-delivery-v1'}).success).toBe(false);
  previous=window.end;delivery=nextLiveBriefingAt(schedule,new Date(delivery));
 }
});
it('keeps unmarked retained clock feeds on their original admission rule and identity',()=>{
 const schedule={durationMinutes:60 as const,timezone:'UTC',clockStartAt:'2026-10-31T03:11:00Z'};
 expect(firstClockBriefingAt(schedule)).toBe('2026-10-31T05:00:00.000Z');
 const window=livePublicationWindow(schedule,new Date('2026-10-31T04:55:00Z'));
 expect(window.schedulePolicy).toBe('clock-aligned-delivery-v1');expect(window).not.toHaveProperty('clockPolicy');
 expect(publicationWindowSchema.safeParse(window).success).toBe(true);
});
it('rejects a preparation policy without a clock creation origin',()=>{
 expect(liveScheduleSchema.safeParse({durationMinutes:60,timezone:'UTC',clockPolicy}).success).toBe(false);
 expect(liveScheduleSchema.safeParse({durationMinutes:60,timezone:'UTC',clockPolicy,clockStartAt:'2026-10-31T03:00:00Z',originAt:'2026-10-31T03:00:00Z'}).success).toBe(false);
 expect(()=>livePublicationWindow({durationMinutes:60,timezone:'UTC',clockPolicy},new Date('2026-10-31T04:00:00Z'))).toThrow();
 expect(()=>nextLiveBriefingAt({durationMinutes:60,timezone:'UTC',clockPolicy},new Date('2026-10-31T04:00:00Z'))).toThrow();
});
