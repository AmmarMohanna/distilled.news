import {describe,expect,it} from 'vitest';
import {boundShortlist,UNREVIEWED_REVIEW_SLOTS} from './shortlist';
import {compareEditorialCandidates} from './editorial-ranking';
import {UNREVIEWED_RETENTION_DAYS} from './editorial-work';

interface C {targetVersionId:string;priority:number;protectedReasons:string[];unreviewed?:boolean;unreviewedSince?:string;ranking:any}
const mk=(id:string,score:number,since?:string):C=>({targetVersionId:id,priority:score,protectedReasons:[],unreviewed:since!==undefined,unreviewedSince:since,ranking:{score,relevance:score,freshness:1,semanticKey:id}});
const HOUR=3600000,WINDOWS=24*UNREVIEWED_RETENTION_DAYS;
/** The behaviour before this change: reserve slots purely by rank. */
function rankOnly(candidates:C[],limit:number){
 const sorted=[...candidates].sort(compareEditorialCandidates),selected=sorted.slice(0,limit),overflow=sorted.slice(limit),reserved=overflow.filter(c=>c.unreviewed).slice(0,UNREVIEWED_REVIEW_SLOTS),ids=new Set(reserved.map(c=>c.targetVersionId));
 return {selected:[...selected,...reserved],overflow:overflow.filter(c=>!ids.has(c.targetVersionId))};
}
/** Hourly windows with sustained arrivals that all outrank the watched candidate. Returns the window at which it was first reviewed, or undefined if retired unreviewed. */
function simulate(bound:typeof rankOnly|typeof boundShortlist,watchedArrivesAt:number,arrivals=24){
 let pool:C[]=[];
 for(let w=0;w<WINDOWS+watchedArrivesAt;w++){
  const at=new Date(Date.UTC(2026,9,1)+w*HOUR).toISOString();
  const fresh=Array.from({length:arrivals},(_,i)=>mk(`n${w}-${i}`,.9-i*.01));
  if(w===watchedArrivesAt)fresh.push(mk('WATCHED',.2));// arrives as ordinary news, ranked below everything else
  // Bounded retention: anything waiting longer than the retention bound is retired unreviewed.
  const retiredWatched=pool.some(c=>c.targetVersionId==='WATCHED'&&Date.parse(at)-Date.parse(c.unreviewedSince!)>UNREVIEWED_RETENTION_DAYS*24*HOUR);
  if(retiredWatched)return undefined;
  pool=pool.filter(c=>Date.parse(at)-Date.parse(c.unreviewedSince!)<=UNREVIEWED_RETENTION_DAYS*24*HOUR);
  const result=bound([...fresh,...pool],20),reviewed=result.selected;
  if(reviewed.some(c=>c.targetVersionId==='WATCHED'&&(c.unreviewed??false)))return w-watchedArrivesAt;
  // Candidates that did not get a slot become (or stay) never-reviewed overflow.
  pool=result.overflow.map(c=>c.unreviewed?c:{...c,unreviewed:true,unreviewedSince:at});
 }
 return undefined;
}
describe('sustained higher-ranked arrivals cannot keep an older candidate unreviewed until retirement',()=>{
 it('before: rank-only slots leave a lower-ranked old candidate unreviewed for the whole retention period',()=>{
  expect(simulate(rankOnly,0)).toBeUndefined();
  expect(simulate(rankOnly,100)).toBeUndefined();
 });
 it('after: age-aware slots review it, within the retention bound, whether it is the oldest or arrives behind a backlog',()=>{
  const first=simulate(boundShortlist,0),behind=simulate(boundShortlist,100);
  expect(first).toBeLessThanOrEqual(2);
  expect(behind).toBeDefined();expect(behind!).toBeLessThan(WINDOWS);
 });
 it('processing stays bounded: at most the ordinary limit plus the review slots, whatever the backlog',()=>{
  const pool=Array.from({length:500},(_,i)=>mk(`u${i}`,.3,new Date(Date.UTC(2026,9,1)+i*HOUR).toISOString()));
  const result=boundShortlist([...Array.from({length:50},(_,i)=>mk(`n${i}`,.9-i*.001)),...pool],20);
  expect(result.selected).toHaveLength(20+UNREVIEWED_REVIEW_SLOTS);
  expect(result.selected.filter(c=>c.unreviewed)).toHaveLength(UNREVIEWED_REVIEW_SLOTS);
 });
 it('the slots go to the best-ranked and the longest-waiting, never more than the bound',()=>{
  const u=[mk('best',.6,'2026-10-05T00:00:00Z'),mk('old1',.1,'2026-10-01T00:00:00Z'),mk('old2',.1,'2026-10-02T00:00:00Z'),mk('mid',.3,'2026-10-04T00:00:00Z')];
  const r=boundShortlist([...Array.from({length:25},(_,i)=>mk(`n${i}`,.95-i*.01)),...u],20);
  expect(r.selected.filter(c=>c.unreviewed).map(c=>c.targetVersionId).sort()).toEqual(['best','old1','old2']);
  expect(r.overflow.filter(c=>c.unreviewed).map(c=>c.targetVersionId)).toEqual(['mid']);
 });
});
