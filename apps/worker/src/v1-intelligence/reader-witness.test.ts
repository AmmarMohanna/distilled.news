import {expect,it} from 'vitest';
import {verificationWire} from './writer-wire';
import {decidePublicationValidation,decidePublicationPackets} from './publication-validation';
import saved from '../../../../benchmarks/validation-contract-real-model-results.json';
const text='The road has reopened.';
const claims:any=[{id:'c',candidateId:'story',text,support:[],context:[],requiredFacts:[{id:'road',text:'Officials reopened the road.',evidenceRevisionIds:['r']},{id:'bridge',text:'The bridge remains closed.',evidenceRevisionIds:['r']}]}];
const whole={claimId:'claim_1',fullyEntailed:true,unsupportedMeaning:[] as string[],reason:'Road statement is supported; assess bridge coverage separately.'};
const check=(factId:string,extra:any={})=>({factId,communicated:true,sourceSupported:true,readerEntailsProposition:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Same proposition in reader prose.',readerSpans:[{claimId:'claim_1',text}],...extra});
const wire=()=>verificationWire(claims,{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true});
const raw=(checks:any[])=>({supportedClaimIds:['claim_1'],preservedFactIds:checks.filter(c=>c.communicated&&c.sourceSupported!==false&&c.readerEntailsProposition!==false).map(c=>c.factId),claimEntailment:[whole],semanticChecks:checks});
it('reproduces the bare-ID false communication without new response fields',()=>{
 const old=['fact_1','fact_2'].map(factId=>({factId,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Source proposition is in the reader.',readerSpans:[{claimId:'claim_1'}]}));
 expect(wire().decode(raw(old)).semanticChecks[1].communicated).toBe(false);
});
it('never converts a bare claim ID into positive reader communication (saved T08 defect)',()=>{
 const result=wire().decode(raw([check('fact_1'),check('fact_2',{readerSpans:[{claimId:'claim_1'}]})]));
 expect(result.semanticChecks[1].communicated).toBe(false);
 expect(decidePublicationValidation(claims,result as any).status).toBe('UNRESOLVED');
});
it('accepts a semantically attested paraphrase and rejects separately missing mandatory coverage',()=>{
 const result=wire().decode(raw([check('fact_1'),check('fact_2',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]));
 expect(result.semanticChecks[0].communicated).toBe(true);
 expect(decidePublicationValidation(claims,result as any)).toMatchObject({status:'REJECT',reasons:expect.arrayContaining(['MISSING_MANDATORY_COVERAGE'])});
 const onlyRoad=[{...claims[0],requiredFacts:[claims[0].requiredFacts[0]],allowedFacts:claims[0].requiredFacts}];
 expect(decidePublicationValidation(onlyRoad,result as any).status).toBe('ACCEPT');
});
it.each(['source','coordinates','text','foreign'])('rejects %s witnesses against the authoritative reader bytes',kind=>{
 const span:any={claimId:'claim_1',text};
 if(kind==='source')span.text='The bridge remains closed.';
 if(kind==='coordinates')span.start=1;
 if(kind==='text')span.text=text+' ';
 if(kind==='foreign')span.claimId='source_1';
 if(kind==='coordinates'){expect(()=>wire().decode(raw([check('fact_1'),check('fact_2',{readerSpans:[span]})]))).toThrow();}else expect(wire().decode(raw([check('fact_1'),check('fact_2',{readerSpans:[span]})])).semanticChecks[1].communicated).toBe(false);
});
it('text presence cannot override an adverse proposition-entailment judgment',()=>{
 const result=wire().decode(raw([check('fact_1'),check('fact_2',{readerEntailsProposition:false})]));
 expect(decidePublicationValidation(claims,result as any)).toMatchObject({status:'REJECT',reasons:expect.arrayContaining(['FACT_FACET_FAILED'])});
});
it('does not accept any old saved real-provider judgment as a new reader-witness verdict',()=>{
 for(const c of saved.cases)expect(decidePublicationValidation(c.question as any,c.providerVerdict as any).status,c.caseId).toBe('UNRESOLVED');
});
// Controlled semantic ports exercise the gate, not new provider accuracy.
it.each([
 ['wrong subject/quantity','Alice reported 12 injuries; Bob reported 40.','Alice reported 40 injuries; Bob reported 12.',false],
 ['S18 wrong quote speaker','Davies-Jones said "Delete the images".','Bertin said "Delete the images".',false],
 ['S12 original missing legal scope','The law covers qualifying relatives and children under eight.','The law covers relatives.',false],
 ['S12 repaired legal paraphrase','The law covers qualifying relatives and children under eight.','Qualifying family relationships and children younger than eight fall within the law.',true],
])('%s needs semantic proposition fidelity in addition to text presence',(_name,source,draft,valid)=>{
 const cs:any=[{id:'c',candidateId:'story',text:draft,support:[],context:[],requiredFacts:[{id:'f',text:source,evidenceRevisionIds:['r']}]}];
 const result:any={supportedClaimIds:valid?['c']:[],preservedFactIds:valid?['f']:[],claimEntailment:[{claimId:'c',fullyEntailed:valid,unsupportedMeaning:valid?[]:['Material meaning differs.'],reason:'Controlled adjudication.'}],semanticChecks:[{candidateId:'story',factId:'f',communicated:true,sourceSupported:true,readerEntailsProposition:valid,attribution:valid,certainty:true,temporal:true,qualifiers:valid,readerSpans:[{claimId:'c',text:draft,start:0,end:draft.length}],reason:'Controlled proposition judgment.'}]};
 expect(decidePublicationValidation(cs,result).status).toBe(valid?'ACCEPT':'REJECT');
});
it('S16 independent Meta development cannot borrow a different selected story witness',()=>{
 const meta={id:'meta',text:'Meta released its model.',evidenceRevisionIds:['r']};
 const cs:any=[{id:'c',candidateId:'other',text,support:[],context:[],allowedFacts:[]},{id:'m',candidateId:'meta-story',text:'Other AI news.',support:[],context:[],requiredFacts:[meta]}];
 const w=verificationWire(cs,{validationContract:'EVIDENCE_GROUNDED_V2'});
 const r=w.decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1'],semanticChecks:[check('fact_1')]});
 expect(r.semanticChecks[0]).toMatchObject({communicated:false,readerSpans:[]});
});
it('checks incorrect optional assertions but permits optional omission',()=>{
 const cs:any=[{...claims[0],requiredFacts:[],allowedFacts:claims[0].requiredFacts}];
 const r:any={supportedClaimIds:['c'],claimEntailment:[{...whole,claimId:'c'}],semanticChecks:[]};
 expect(decidePublicationValidation(cs,r).status).toBe('ACCEPT');
 r.semanticChecks=[{...check('bridge',{sourceSupported:false,readerSpans:[{claimId:'c',text,start:0,end:text.length}]}),candidateId:'story'}];
 expect(decidePublicationValidation(cs,r)).toMatchObject({status:'REJECT',reasons:expect.arrayContaining(['OPTIONAL_FACT_FACET_FAILED'])});
});
it('keeps contradictory summary IDs unresolved rather than sanitizing them into a repairable rejection',()=>{
 const r=raw([check('fact_1',{communicated:false,readerEntailsProposition:false,readerSpans:[]}),check('fact_2',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]);
 r.claimEntailment=[{...whole,fullyEntailed:false,unsupportedMeaning:['Wrong meaning.']}];
 // Explicit positive summary contradicts negative detailed verdicts.
 r.preservedFactIds=['fact_1'];
 expect(decidePublicationValidation(claims,wire().decode(r) as any).status).toBe('UNRESOLVED');
});
it.each([true,false])('optional positive summary cannot hide an adverse or omitted communication verdict (%s)',communicated=>{
 const cs:any=[{...claims[0],requiredFacts:[],allowedFacts:claims[0].requiredFacts}];
 const r:any={supportedClaimIds:communicated?[]:['c'],preservedFactIds:['bridge'],claimEntailment:[{...whole,claimId:'c',fullyEntailed:!communicated}],semanticChecks:[{...check('bridge',{communicated,readerEntailsProposition:false,readerSpans:communicated?[{claimId:'c',text,start:0,end:text.length}]:[]}),candidateId:'story'}]};
 expect(decidePublicationValidation(cs,r).status).toBe('UNRESOLVED');
});
it('does not widen the legacy decoder to accept v2-only witness/facet fields',()=>{
 const legacy=verificationWire([{...claims[0],requiredFacts:[claims[0].requiredFacts[0]]}]);
 expect(()=>legacy.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[check('fact_1')]})).toThrow();
});
it.each([false,true])('preservation summary ownership permits only genuine optional omission across stories (%s)',wrongOwner=>{
 const fact={id:'shared',text:'The road reopened.',evidenceRevisionIds:['r']};
 const cs:any=[{id:'a',candidateId:'one',text,support:[],context:[],allowedFacts:[fact]},{id:'b',candidateId:'two',text:'A separate supported update.',support:[],context:[],allowedFacts:[fact]}];
 const w=verificationWire(cs,{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true});
 const decoded=w.decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:[wrongOwner?'fact_2':'fact_1'],claimEntailment:[whole,{...whole,claimId:'claim_2'}],semanticChecks:[check('fact_1'),check('fact_2',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]});
 expect(decidePublicationValidation(cs,decoded as any).status).toBe(wrongOwner?'UNRESOLVED':'ACCEPT');
});
it('a positive optional summary with no corresponding check is incomplete, never silently omitted',()=>{
 const cs:any=[{...claims[0],requiredFacts:[],allowedFacts:claims[0].requiredFacts}];
 expect(()=>verificationWire(cs,{validationContract:'EVIDENCE_GROUNDED_V2'}).decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_2'],semanticChecks:[]})).toThrow('INCOMPLETE_SEMANTIC_VERDICT');
});
it('the provider cannot supply the decoder-derived summary ownership marker',()=>{
 expect(()=>wire().decode(raw([check('fact_1',{preservedInSummary:true}),check('fact_2')]))).toThrow();
});
it('partitioned verification preserves optional summary ownership',()=>{
 const fact={id:'shared',text:'The road reopened.',evidenceRevisionIds:['r']};
 const a:any={id:'a',candidateId:'one',text,support:[],context:[],allowedFacts:[fact]},b:any={id:'b',candidateId:'two',text:'A separate supported update.',support:[],context:[],allowedFacts:[fact]},c:any={id:'c',candidateId:'three',text:'Another supported update.',support:[],context:[]};
 const first=verificationWire([a,b],{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true}).decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1'],claimEntailment:[whole,{...whole,claimId:'claim_2'}],semanticChecks:[check('fact_1'),check('fact_2',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]});
 const second=verificationWire([b,c],{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true}).decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:[],claimEntailment:[whole,{...whole,claimId:'claim_2'}],semanticChecks:[check('fact_1',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]});
 expect(decidePublicationPackets([a,b,c],[{claims:[a,b],result:first as any},{claims:[b,c],result:second as any}]).decision.status).toBe('ACCEPT');
});
it('contradictory positive and negative packet judgments stay unresolved before repair admission',()=>{
 const cs:any=[{...claims[0],requiredFacts:[claims[0].requiredFacts[0]]}],w=verificationWire(cs,{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true});
 const yes=w.decode(raw([check('fact_1')])),no=w.decode({...raw([check('fact_1',{communicated:false,readerEntailsProposition:false,readerSpans:[]})]),supportedClaimIds:[],claimEntailment:[{...whole,fullyEntailed:false,unsupportedMeaning:['Wrong factual meaning.']}]});
 expect(decidePublicationPackets(cs,[{claims:cs,result:yes as any},{claims:cs,result:no as any}]).decision.status).toBe('UNRESOLVED');
});
