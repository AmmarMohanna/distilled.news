import {expect,it} from 'vitest';
import attempt from './fixtures/novelty-attempt-20261007.json';
import {verificationWire} from './writer-wire';
import {equivalentFact} from './editorial';
import type {VerificationClaim} from './publication';
const claims=attempt.claims as unknown as VerificationClaim[];
function response(wire:ReturnType<typeof verificationWire>,statuses:string[]){
 return {supportedClaimIds:wire.payload.stories.flatMap(s=>s.claims.map(c=>c.id)),preservedFactIds:wire.payload.stories.flatMap(s=>s.requiredFactIds),addressedCorrectionObligationIds:[],semanticChecks:wire.payload.stories.flatMap((s,i)=>s.requiredFactIds.map(id=>({factId:id,communicated:true,attributionPreserved:true,certaintyPreserved:true,temporalFaithful:true,qualifiersPreserved:true,nonRepetitive:true,reason:'Complete supported reader prose.',readerSpans:[{claimId:s.claims[0].id}],readerNovelty:{status:statuses[i],reason:statuses[i]==='NEW'?'Adds the supported funding development to this reader.':'Already entailed by the prior reader fact.',previousFactTexts:statuses[i]==='ALREADY_COMMUNICATED'?s.previousLedgerFacts:[]}})))};
}
it('persisted failure has a genuinely uncommunicated Lambda delta and an already communicated Mistral recap',()=>{
 expect(claims[0].previousLedgerFacts).toEqual([]);expect(attempt.priorPublishedClaims.some(text=>text.includes('Lambda'))).toBe(false);
 expect(claims[1].previousLedgerFacts!.some(text=>equivalentFact(text,claims[1].requiredFacts![0].text))).toBe(true);
 expect(attempt.verified.semanticChecks.every(c=>c.communicated&&c.attribution&&c.certainty&&c.temporal&&c.qualifiers)).toBe(true);
 expect(attempt.verified.novelFactIds).toEqual([]);
});
it('a repeated story does not erase a valid reader delta in another story',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true}),raw=response(wire,['NEW','ALREADY_COMMUNICATED']);
 expect(wire.schema.required).not.toContain('novelFactIds');
 const result=wire.decode(raw);expect(result.novelFactIds).toEqual([claims[0].requiredFacts![0].id]);expect(result.semanticChecks[1].readerNovelty?.previousFactTexts).toEqual(claims[1].previousLedgerFacts);
});
it('the observed unexplained empty novelty list remains unresolved, never automatically promoted',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true}),raw=response(wire,['NEW','ALREADY_COMMUNICATED']);
 for(const check of raw.semanticChecks)delete (check as any).readerNovelty;
 const result=wire.decode({...raw,novelFactIds:[]});expect(result.novelFactIds).toEqual([]);expect(result.semanticChecks.every(c=>c.readerNovelty?.status==='UNRESOLVED')).toBe(true);
});
it('already communicated requires exact same-story reader history, not another story or a planner decision',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true}),raw=response(wire,['ALREADY_COMMUNICATED','ALREADY_COMMUNICATED']);raw.semanticChecks[0].readerNovelty.previousFactTexts=[claims[1].previousLedgerFacts![0]];
 const result=wire.decode(raw);expect(result.novelFactIds).toEqual([]);expect(result.semanticChecks[0].readerNovelty?.status).toBe('UNRESOLVED');
});
it('changed quantities remain new and genuinely uncertain novelty remains closed',()=>{
 const supplied=[{...claims[0],text:'Officials confirmed 40 deaths.',requiredFacts:[{id:'count',text:'Officials confirmed 40 deaths.',evidenceRevisionIds:['revision']}],allowedFacts:[],newUnderstandingFacts:[{id:'count',text:'Officials confirmed 40 deaths.',evidenceRevisionIds:['revision']}],previousLedgerFacts:['Officials confirmed 12 deaths.']}];
 const wire=verificationWire(supplied,{requireReaderNovelty:true});expect(wire.decode(response(wire,['NEW'])).novelFactIds).toEqual(['count']);expect(wire.decode(response(wire,['UNRESOLVED'])).novelFactIds).toEqual([]);
});
it('positive novelty cannot bypass missing reader coverage',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true}),raw=response(wire,['NEW','ALREADY_COMMUNICATED']);raw.semanticChecks[0].communicated=false;
 expect(wire.decode(raw).novelFactIds).toEqual([]);
});
