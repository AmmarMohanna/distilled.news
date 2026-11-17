import {expandedSchema} from './schema-test-utils';
import {describe,it,expect} from 'vitest';
import cases from './fixtures/oct11-rejected-repeat-proposals.json';
import {compactEditorialInput} from './editorial-transport';
import {keyedEditorialPlanWireSchemaFor,normalizeEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {equivalentFact} from './editorial';
import type {ShortlistRecord} from './shortlist';
const scopeFor=(c:typeof cases[number])=>({...c.shortlist,candidates:c.shortlist.candidates.filter(t=>!(c.coverage!.notComparativelyReviewedTargetVersionIds as string[]).includes(t.targetVersionId))}) as unknown as ShortlistRecord;
const branches=(raw:any,key:string)=>{const schema=expandedSchema(raw);return schema.properties.stories.properties[key].anyOf.map((r:any)=>r);};
describe('retained October 11 proposals: source age is not reader repetition',()=>{
 it.each(cases)('prevents unsupported REPEAT labels at the provider boundary: $proposal.window.end',c=>{
  const sl=scopeFor(c),tr=compactEditorialInput(sl),body=tr.decodeKeyed(c.proposal.rawProposal);
  expect(()=>normalizeEditorialPlan(body,sl,{requireFeedFit:true,requirePublicationCorrection:true,correctionCapacity:1})).toThrow();
  const schema=keyedEditorialPlanWireSchemaFor(tr.state);let rejected=0;
  for(const [i,target] of sl.candidates.entries()){
   const known=sl.ledger.filter(e=>e.eventIds.includes(target.stableTargetId)||Boolean(target.storylineId&&e.storylineIds.includes(target.storylineId))).flatMap(e=>e.claimFacts);
   const story=body.stories.find(s=>s.targetVersionId===target.targetVersionId)!;
   if(story.deltaType==='REPEAT'&&!target.facts.every(f=>known.some(t=>equivalentFact(t,f.text)))){
    rejected++;for(const branch of branches(schema,tr.state.candidates[i].targetVersionId))expect(branch.properties.deltaType.enum).not.toContain('REPEAT');
   }
  }
  expect(rejected).toBeGreaterThan(0);
 });
 it('permits proven same-story repetition but not partial, foreign-story, or changed-value history',()=>{
  const sl=scopeFor(cases[0]);sl.candidates=[sl.candidates[3]];sl.obligations=[];
  const c=sl.candidates[0];c.protectedReasons=[];c.correctionObligationIds=[];c.flags=[];
  const entry={...sl.ledger[0],id:'witness',eventIds:[c.stableTargetId],storylineIds:[],claimFacts:c.facts.map(f=>f.text)};sl.ledger=[entry];
  const allowed=()=>{const tr=compactEditorialInput(sl);return branches(keyedEditorialPlanWireSchemaFor(tr.state),tr.state.candidates[0].targetVersionId).some((b:any)=>b.properties.deltaType.enum.includes('REPEAT'))};
  expect(allowed()).toBe(true);const plan=fallbackEditorialPlan(sl);Object.assign(plan.stories[0],{decision:'SUPPRESS',treatment:'OMIT',deltaType:'REPEAT'});expect(()=>normalizeEditorialPlan(plan,sl)).not.toThrow();
  entry.claimFacts=entry.claimFacts.slice(0,1);expect(allowed()).toBe(false);
  entry.claimFacts=c.facts.map(f=>f.text);entry.eventIds=['foreign'];expect(allowed()).toBe(false);
  entry.eventIds=[c.stableTargetId];c.facts=[{...c.facts[0],text:'The company raised $120 million.'}];entry.claimFacts=['The company raised $90 million.'];expect(allowed()).toBe(false);
 });
});
