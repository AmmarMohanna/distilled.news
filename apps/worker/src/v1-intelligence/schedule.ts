import {HandoffError} from '@distilled/contracts';
import {Temporal} from '@js-temporal/polyfill';
import {z} from 'zod';
import type {PublicationWindow} from './scoring';

export const LIVE_INTERVALS=[30,60,120,360,720,1440] as const;
export type LiveInterval=typeof LIVE_INTERVALS[number];
export interface LiveSchedule {durationMinutes:LiveInterval;timezone:string;deliveryAnchor?:string;originAt?:string}
export const LIVE_SCHEDULE_POLICY='local-calendar-anchors-v1';
export const RELATIVE_SCHEDULE_POLICY='creation-relative-v1';
export const liveScheduleSchema=z.object({
 durationMinutes:z.union([z.literal(30),z.literal(60),z.literal(120),z.literal(360),z.literal(720),z.literal(1440)]),
 timezone:z.string().min(1).refine(zone=>{
  if(/^[+-]/.test(zone)) return false;
  try {Temporal.Instant.from('2000-01-01T00:00:00Z').toZonedDateTimeISO(zone);return true}catch{return false}
 }),
 deliveryAnchor:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
 originAt:z.string().datetime().optional()
}).strict();

/** Opted-in subdaily intervals use elapsed time from the persisted origin.
 * Legacy intervals use a local daily anchor. Calendar-day windows can span 23/25
 * elapsed hours at DST. Short intervals advance by elapsed minutes; a remaining
 * fragment closes at the next local anchor, so adjacent windows never leave a
 * hole or double-cover evidence when a local day has an unusual length.
 * Gap/overlap anchors use Temporal's explicit compatible disambiguation. */
export function livePublicationWindow(raw:LiveSchedule,now:Date):PublicationWindow {
 const parsed=liveScheduleSchema.safeParse(raw);
 if(!parsed.success || !Number.isFinite(now.getTime())) throw new HandoffError('INVALID_REQUEST');
 const schedule=parsed.data,instant=Temporal.Instant.fromEpochMilliseconds(now.getTime());
 if(schedule.originAt&&schedule.durationMinutes!==1440){
  const step=schedule.durationMinutes*60000,origin=Date.parse(schedule.originAt);
  const end=origin+Math.floor((now.getTime()-origin)/step)*step;
  return {start:new Date(end-step).toISOString(),end:new Date(end).toISOString(),kind:schedule.durationMinutes===30?'30M':'HOURLY',...schedule,schedulePolicy:RELATIVE_SCHEDULE_POLICY};
 }
 const day=instant.toZonedDateTimeISO(schedule.timezone).toPlainDate(),time=Temporal.PlainTime.from(schedule.deliveryAnchor??'00:00');
 const anchor=(date:Temporal.PlainDate)=>date.toPlainDateTime(time).toZonedDateTime(schedule.timezone,{disambiguation:'compatible'});
 const points=new Map<string,Temporal.Instant>();
 for(let offset=-2;offset<=0;offset++) {
  const start=anchor(day.add({days:offset})),end=anchor(day.add({days:offset+1}));
  points.set(start.epochNanoseconds.toString(),start.toInstant());points.set(end.epochNanoseconds.toString(),end.toInstant());
  if(schedule.durationMinutes===1440) continue;
  for(let step=1;step<=100;step++) {
   const point=start.add({minutes:step*schedule.durationMinutes});
   if(Temporal.ZonedDateTime.compare(point,end)>=0) break;
   points.set(point.epochNanoseconds.toString(),point.toInstant());
  }
 }
 const boundaries=[...points.values()].sort(Temporal.Instant.compare);
 let index=boundaries.length-1;
 while(index>=0 && Temporal.Instant.compare(boundaries[index],instant)>0) index--;
 if(index<1) throw new HandoffError('INVALID_REQUEST');
 return {start:new Date(boundaries[index-1].epochMilliseconds).toISOString(),end:new Date(boundaries[index].epochMilliseconds).toISOString(),kind:schedule.durationMinutes===30?'30M':schedule.durationMinutes===1440?'DAILY':'HOURLY',...schedule,schedulePolicy:LIVE_SCHEDULE_POLICY};
}

/** Read-only next boundary under the feed's persisted interval policy. */
export function nextLiveBriefingAt(raw:LiveSchedule, now:Date):string {
 const schedule=liveScheduleSchema.parse(raw);
 if(schedule.originAt&&schedule.durationMinutes!==1440){
  const step=schedule.durationMinutes*60000,origin=Date.parse(schedule.originAt);
  return new Date(origin+Math.max(1,Math.floor((now.getTime()-origin)/step)+1)*step).toISOString();
 }
 const instant=Temporal.Instant.fromEpochMilliseconds(now.getTime());
 const day=instant.toZonedDateTimeISO(schedule.timezone).toPlainDate();
 const time=Temporal.PlainTime.from(schedule.deliveryAnchor??'00:00');
 let anchor=day.toPlainDateTime(time).toZonedDateTime(schedule.timezone,{disambiguation:'compatible'});
 if(anchor.epochMilliseconds<=now.getTime()) anchor=day.add({days:1}).toPlainDateTime(time).toZonedDateTime(schedule.timezone,{disambiguation:'compatible'});
 if(schedule.durationMinutes===1440) return new Date(anchor.epochMilliseconds).toISOString();
 const end=Date.parse(livePublicationWindow(schedule,now).end)+schedule.durationMinutes*60000;
 return new Date(Math.min(end,anchor.epochMilliseconds)).toISOString();
}

/** First close whose entire interval follows feed creation. Equality at an
 * opening boundary is eligible; creation inside an interval skips that one. */
export function firstFullLiveBriefingAt(schedule:LiveSchedule,created:Date):string {
 const next=nextLiveBriefingAt(schedule,created);
 const window=livePublicationWindow(schedule,new Date(next));
 return Date.parse(window.start)>=created.getTime()?next:nextLiveBriefingAt(schedule,new Date(next));
}

/** Warm mechanical planning only; final selection and writing await close. */
export function preparingLiveWindow(schedule:LiveSchedule,now:Date):PublicationWindow|undefined {
 const end=nextLiveBriefingAt(schedule,now),lead=Math.min(5,schedule.durationMinutes/6)*60000;
 return Date.parse(end)-now.getTime()<=lead?livePublicationWindow(schedule,new Date(end)):undefined;
}

export const publicationWindowSchema=z.object({
 start:z.string().datetime(),end:z.string().datetime(),kind:z.enum(['30M','HOURLY','DAILY','WEEKLY']),
 durationMinutes:liveScheduleSchema.shape.durationMinutes.optional(),
 timezone:liveScheduleSchema.shape.timezone.optional(),deliveryAnchor:liveScheduleSchema.shape.deliveryAnchor,
 originAt:liveScheduleSchema.shape.originAt,
 schedulePolicy:z.enum([LIVE_SCHEDULE_POLICY,RELATIVE_SCHEDULE_POLICY]).optional()
}).strict().superRefine((window,ctx)=>{
 if(Date.parse(window.start)>=Date.parse(window.end)) ctx.addIssue({code:'custom',message:'Window must increase'});
 if(window.durationMinutes===undefined) {
  if(window.timezone || window.deliveryAnchor || window.originAt || window.schedulePolicy) ctx.addIssue({code:'custom',message:'Live metadata requires a live duration'});
  return;
 }
 const relative=window.durationMinutes!==1440&&Boolean(window.originAt);
 if(!window.timezone || window.schedulePolicy!==(relative?RELATIVE_SCHEDULE_POLICY:LIVE_SCHEDULE_POLICY)) {ctx.addIssue({code:'custom',message:'Live timezone and policy required'});return}
 if(relative&&Date.parse(window.start)<Date.parse(window.originAt!))ctx.addIssue({code:'custom',message:'Window precedes schedule origin'});
 try {
  const expected=livePublicationWindow({durationMinutes:window.durationMinutes,timezone:window.timezone,deliveryAnchor:window.deliveryAnchor,originAt:window.originAt},new Date(window.end));
  if(expected.kind!==window.kind || Date.parse(expected.start)!==Date.parse(window.start) || Date.parse(expected.end)!==Date.parse(window.end)) ctx.addIssue({code:'custom',message:'Not a canonical live window'});
 }catch {ctx.addIssue({code:'custom',message:'Invalid live window'})}
});
