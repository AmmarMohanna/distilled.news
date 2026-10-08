import {expect,it} from 'vitest';
import {fallbackEditorialPlan,normalizeEditorialPlan,validateEditorialPlan,planCapacityFailures} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import type {ShortlistRecord} from './shortlist';
import midnight from './fixtures/staging-midnight-missing-required.json';
const fixture=()=>structuredClone(midnight.shortlist) as unknown as ShortlistRecord;
it('reproduces the exact billed midnight failure and repairs its sole invalid constraint',()=>{
 const shortlist=fixture(),wire=compactEditorialInput(shortlist),raw=wire.decode(midnight.proposal as any),original=structuredClone(raw);
 expect(()=>validateEditorialPlan(raw,shortlist,{requireFeedFit:true,requirePublicationCorrection:true})).toThrow();
 const {value,normalization}=normalizeEditorialPlan(raw,shortlist,{requireFeedFit:true,requirePublicationCorrection:true});
 expect(raw).toEqual(original);expect(normalization.added).toHaveLength(1);
 const selected=value.stories.find(s=>s.decision==='SELECT')!;
 expect(selected.newUnderstandingFactIds).toHaveLength(2);expect(selected.mustIncludeFactIds).toEqual(selected.newUnderstandingFactIds);
 expect(planCapacityFailures(value,shortlist,DEFAULT_BRIEFING_BUDGET)).toEqual([]);
 expect(normalizeEditorialPlan(value,shortlist)).toEqual({value,normalization:{...normalization,added:[]}});
});
it('leaves valid responses and non-selected stories unchanged',()=>{
 const shortlist=fixture(),valid=fallbackEditorialPlan(shortlist),before=structuredClone(valid);
 const output=normalizeEditorialPlan(valid,shortlist);expect(output.value).toEqual(before);expect(output.normalization.added).toEqual([]);
});
it.each(['foreign','invented'])('rejects %s declared facts rather than promoting them',mode=>{
 const shortlist=fixture(),wire=compactEditorialInput(shortlist),raw=wire.decode(midnight.proposal as any),selected=raw.stories.find(s=>s.decision==='SELECT')!;
 selected.newUnderstandingFactIds.push(mode==='foreign'?shortlist.candidates.find(c=>c.targetVersionId!==selected.targetVersionId)!.facts[0].id:'invented');
 expect(()=>normalizeEditorialPlan(raw,shortlist)).toThrow();
});
it.each(['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'])('cannot normalize away %s protection',flag=>{
 const shortlist=fixture(),raw=compactEditorialInput(shortlist).decode(midnight.proposal as any),selected=raw.stories.find(s=>s.decision==='SELECT')!;
 shortlist.candidates.find(c=>c.targetVersionId===selected.targetVersionId)!.flags.push(flag);
 expect(()=>normalizeEditorialPlan(raw,shortlist)).toThrow();
});
it('does not drop an undeclared protected changed fact to make a proposal valid',()=>{
 const shortlist=fixture(),raw=compactEditorialInput(shortlist).decode(midnight.proposal as any),selected=raw.stories.find(s=>s.decision==='SELECT')!,c=shortlist.candidates.find(c=>c.targetVersionId===selected.targetVersionId)!;
 c.protectedReasons=['CHANGES_STATE'];c.facts.push({...c.facts[0],id:'protected-third',text:'The funding increased to $700 million.'});
 expect(()=>normalizeEditorialPlan(raw,shortlist)).toThrow();
 selected.mustIncludeFactIds.push('protected-third');expect(normalizeEditorialPlan(raw,shortlist).value.stories.find(s=>s.decision==='SELECT')!.mustIncludeFactIds).toContain('protected-third');
});
it('structural normalization cannot bypass communication capacity',()=>{
 const shortlist=fixture(),raw=compactEditorialInput(shortlist).decode(midnight.proposal as any),{value}=normalizeEditorialPlan(raw,shortlist);
 expect(planCapacityFailures(value,shortlist,{...DEFAULT_BRIEFING_BUDGET,maxStories:0})).toEqual([{targetVersionId:value.stories.find(s=>s.decision==='SELECT')!.targetVersionId,reason:'STORY_CAPACITY'}]);
});
