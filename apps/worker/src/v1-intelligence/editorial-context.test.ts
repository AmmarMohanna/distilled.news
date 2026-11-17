import {it,expect} from 'vitest';
import {fallbackEditorialPlan,normalizeEditorialPlan,validateEditorialPlan} from './editorial-plan';
import {editorialContextFacts} from './editorial-context';
import {approvedWriterFacts} from './publication';
import type {ShortlistRecord} from './shortlist';
const source='source-revision';
function fixture(){return {id:'shortlist',feedId:'feed',candidates:[
 {targetType:'EVENT',targetVersionId:'researchers',stableTargetId:'researchers-event',evidenceRevisionIds:[source],facts:[{id:'researchers-fact',text:"Fired OpenAI researchers say they were let go for 'prioritising safety'.",evidenceRevisionIds:[source],claimMentionIds:['mention-1'],selfContained:'YES'}],flags:[],effects:[],protectedReasons:[],correctionObligationIds:[],priority:.8,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[],treatment:'STANDARD',previouslyCommunicated:[]}},
 {targetType:'EVENT',targetVersionId:'response',stableTargetId:'response-event',evidenceRevisionIds:[source],facts:[{id:'response-fact',text:'The AI firm instead claims the researchers were fired for mishandling sensitive information.',evidenceRevisionIds:[source],claimMentionIds:['mention-2'],selfContained:'YES'}],flags:[],effects:[],protectedReasons:[],correctionObligationIds:[],priority:.8,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[],treatment:'STANDARD',previouslyCommunicated:[]}}
 ],ledger:[],obligations:[],overflow:[]} as unknown as ShortlistRecord}
it('retained opposing accounts can reference same-article context without pretending they share Event identity',()=>{
 const sl=fixture(),body=fallbackEditorialPlan(sl);body.stories[0].disagreementFactIds=['response-fact'];body.stories[1].contextFactIds=['researchers-fact'];body.stories[1].disagreementFactIds=['researchers-fact'];
 const before=structuredClone(body),result=normalizeEditorialPlan(body,sl);
 expect(result.value).toEqual(before);expect(body).toEqual(before);expect(result.normalization.contextBindings).toHaveLength(3);
 expect(result.normalization.contextBindings![0]).toMatchObject({sourceTargetVersionId:'response',factId:'response-fact',evidenceRevisionIds:[source]});
 expect(sl.candidates[0].facts).toHaveLength(1);
});
it('unrelated evidence and unresolved facts cannot become contextual support',()=>{
 const sl=fixture(),body=fallbackEditorialPlan(sl);body.stories[0].contextFactIds=['response-fact'];sl.candidates[1].facts[0].evidenceRevisionIds=['unrelated-revision'];expect(()=>validateEditorialPlan(body,sl)).toThrow();
 sl.candidates[1].facts[0].evidenceRevisionIds=[source];sl.candidates[1].facts[0].selfContained='UNRESOLVED';expect(()=>validateEditorialPlan(body,sl)).toThrow();
});
it.each(['newUnderstandingFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','openQuestionFactIds'])('context cannot bypass primary candidate ownership through %s',field=>{
 const sl=fixture(),body=fallbackEditorialPlan(sl);body.stories[0].contextFactIds=['response-fact'];(body.stories[0] as any)[field]=['response-fact'];expect(()=>normalizeEditorialPlan(body,sl)).toThrow();
});
it('writer-approved contextual facts retain exact source quotes and reject invented identifiers',()=>{
 const sl=fixture(),body=fallbackEditorialPlan(sl);body.stories[0].disagreementFactIds=['response-fact'];validateEditorialPlan(body,sl);
 const story:any={candidate:{id:'candidate',targetType:'EVENT',targetVersionId:'researchers'},plan:{...body.stories[0],facts:editorialContextFacts(sl.candidates[0],sl)},evidence:[{id:source,body:sl.candidates.flatMap(c=>c.facts.map(f=>f.text)).join('\n')}]};
 const approved=approvedWriterFacts(story);expect(approved.map(f=>f.id)).toEqual(['researchers-fact','response-fact']);expect(approved[1].support).toEqual([{evidenceRevisionId:source,quote:sl.candidates[1].facts[0].text}]);
 body.stories[0].disagreementFactIds=['invented'];expect(()=>validateEditorialPlan(body,sl)).toThrow();
});
