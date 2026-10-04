import {expect,it} from 'vitest';
import {freezeRssCorpus,canaryWindows,mechanicalRepeatMetrics,assertFrozenArm} from './rss-canary';
import {publicationWindowSchema} from './schedule';
const item=(id:string,publishedAt?:string)=>({upstreamId:id,operation:'upsert' as const,text:id,url:`https://www.bbc.co.uk/news/${id}`,publishedAt,timestampKind:'published' as const,representation:'feed_text' as const,contentCompleteness:'unknown' as const});
it('freezes a chronological bounded corpus and explains every excluded row',async()=>{
 const rows=[item('late','2026-10-04T11:00:00Z'),item('early','2026-10-03T13:00:00Z'),item('old','2026-10-03T11:00:00Z'),item('missing'),item('future','2026-10-04T13:00:00Z')];
 const a=await freezeRssCorpus(rows,'2026-10-04T12:00:00Z',1),b=await freezeRssCorpus(rows,'2026-10-04T12:00:00Z',1);
 expect(a).toEqual(b);expect(a.items.map(i=>i.upstreamId)).toEqual(['early']);expect(a.excluded.map(e=>e.reason).sort()).toEqual(['ITEM_CAP','MISSING_PUBLISHED_TIME','OUTSIDE_WINDOW','OUTSIDE_WINDOW']);
 expect(a.hash).toMatch(/^[a-f0-9]{64}$/);expect(a.coverage).toBe('PARTIAL');
});
it('uses half-open contiguous windows without future evidence for all four cadences',()=>{
 for(const duration of [30,120,360,1440] as const){const windows=canaryWindows('2026-10-03T12:00:00Z','2026-10-04T12:00:00Z',duration);expect(Date.parse(windows[0].start)).toBeLessThanOrEqual(Date.parse('2026-10-03T12:00:00Z'));expect(Date.parse(windows.at(-1)!.end)).toBeGreaterThanOrEqual(Date.parse('2026-10-04T12:00:00Z'));expect(windows.every((w,i)=>i===0||w.start===windows[i-1].end)).toBe(true);expect(windows.every(w=>publicationWindowSchema.safeParse(w).success)).toBe(true)}
});
it('reports mechanical recurrence separately from human unnecessary repetition',()=>{
 expect(mechanicalRepeatMetrics([['A new fact.'],['A new fact.','A different fact.']])).toMatchObject({claimCount:3,exactRepeatedClaims:1,exactRepeatRate:1/3,humanUnnecessaryRepeatRate:null});
 expect(mechanicalRepeatMetrics([]).exactRepeatRate).toBeNull();
});
it('rejects a same-sized stale scorer cache and duplicate or missing target identities',()=>{
 expect(()=>assertFrozenArm('frozen',['a','b'],'stale',['a','b'])).toThrow('SCORER_INPUT_MISMATCH');
 expect(()=>assertFrozenArm('frozen',['a','b'],'frozen',['a','a'])).toThrow('SCORER_INPUT_MISMATCH');
 expect(()=>assertFrozenArm('frozen',['a','b'],'frozen',['a','foreign'])).toThrow('SCORER_INPUT_MISMATCH');
 expect(()=>assertFrozenArm('frozen',['a','b'],'frozen',['b','a'])).not.toThrow();
});
