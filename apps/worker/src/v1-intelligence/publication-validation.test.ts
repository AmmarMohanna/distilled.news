import {expect,it} from 'vitest';
import {decidePublicationValidation,decidePublicationPackets,verificationCompatibility,type VerificationManifest} from './publication-validation';
const manifest:VerificationManifest={contract:'EVIDENCE_GROUNDED_V2',feedId:'feed',feedRevision:1,evidenceHash:'e',selectionHash:'s',draftHash:'d',questionHash:'q',promptVersion:'p',packetSchemaVersion:'v2',semanticPolicy:'semantic-publication-v2',editorialContractVersion:'editorial-requirements-v2',model:'model',provider:'provider',providerRoute:'route',outputLanguage:'en'};
const paid={operationId:'op',receiptOperationId:'op',reservationId:'semantic_intents:op',intentToken:'t',settlementToken:'t',resultHash:'hash'};
const claims:any=[{id:'c',candidateId:'story',text:'Officials reported 12 injuries.',support:[],context:[],requiredFacts:[{id:'f',text:'Officials reported 12 injuries.',evidenceRevisionIds:['r']}]}];
const result=():any=>({supportedClaimIds:['c'],preservedFactIds:['f'],claimEntailment:[{claimId:'c',fullyEntailed:true,unsupportedMeaning:[],reason:'Supported.'}],semanticChecks:[{candidateId:'story',factId:'f',communicated:true,sourceSupported:true,readerEntailsProposition:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,readerSpans:[{claimId:'c',text:'Officials reported 12 injuries.',start:0,end:claims[0].text.length}],reason:'Coverage.'}]});
it('requires complete exact compatibility including paid token linkage',()=>{
 expect(verificationCompatibility({manifest,paid},manifest,'hash')).toBe(true);
 for(const key of Object.keys(manifest)){const changed:any={...manifest,[key]:key==='feedRevision'?2:'different'};expect(verificationCompatibility({manifest,paid},changed,'hash')).toBe(false);}
 expect(verificationCompatibility({manifest,paid:{...paid,settlementToken:'wrong'}},manifest,'hash')).toBe(false);
 expect(verificationCompatibility({manifest,paid},manifest,'changed result')).toBe(false);
 expect(verificationCompatibility({},manifest,'hash')).toBe(false);
});
it('accepts complementary complete judgments on actual reader prose',()=>{expect(decidePublicationValidation(claims,result()).status).toBe('ACCEPT');});
it.each(['whole','facet'])('a conflicting %s verdict is unresolved, never acceptance',side=>{
 const r=result();if(side==='whole')r.claimEntailment[0].fullyEntailed=false;else r.semanticChecks[0].attribution=false;
 expect(decidePublicationValidation(claims,r)).toMatchObject({status:'UNRESOLVED',reasons:expect.arrayContaining([side==='whole'?'CLAIM_VERDICT_CONFLICT':'FACT_VERDICT_CONFLICT'])});
});
it('does not use a true surviving road claim to approve missing required bridge coverage',()=>{
 const r=result();r.semanticChecks[0].communicated=false;r.semanticChecks[0].readerSpans=[];r.preservedFactIds=[];
 expect(decidePublicationValidation(claims,r).status).toBe('REJECT');
});
it('rejects consistent negatives; missing, foreign or source-only witnesses stay unresolved',()=>{
 const r=result();r.claimEntailment[0].fullyEntailed=false;r.supportedClaimIds=[];r.preservedFactIds=[];r.semanticChecks[0].communicated=false;r.semanticChecks[0].readerSpans=[];
 expect(decidePublicationValidation(claims,r).status).toBe('REJECT');
 for(const mutate of [(x:any)=>x.semanticChecks=[],(x:any)=>x.semanticChecks[0].readerSpans[0].claimId='source-only',(x:any)=>x.semanticChecks[0].candidateId='foreign']){const x=result();mutate(x);expect(decidePublicationValidation(claims,x).status).toBe('UNRESOLVED');}
 expect(decidePublicationValidation(claims,undefined).status).toBe('UNRESOLVED');
});
it('a negative facet on an optional fact actually written cannot be ignored',()=>{
 const written=structuredClone(claims);written[0].allowedFacts=[...written[0].requiredFacts,{id:'optional',text:'Officials reported injuries.',evidenceRevisionIds:['r']}];
 const r=result();r.semanticChecks.push({...r.semanticChecks[0],factId:'optional',attribution:false});
 expect(decidePublicationValidation(written,r).status).toBe('REJECT');
});
it('a decoder-reported invalid reader witness is unresolved, not a factual rejection',()=>{
 const r=result();r.semanticChecks[0]={...r.semanticChecks[0],communicated:false,readerSpans:[],reason:'INVALID_READER_WITNESS: coverage cited source-only prose.'};
 expect(decidePublicationValidation(claims,r).status).toBe('UNRESOLVED');
});
it('a complete positive packet cannot fill an incomplete overlapping packet verdict',()=>{
 const incomplete=result();incomplete.semanticChecks=[];
 expect(decidePublicationPackets(claims,[{claims,result:result()},{claims,result:incomplete}]).decision.status).toBe('UNRESOLVED');
});
it('malformed truthy semantic fields cannot become approvals',()=>{
 for(const mutate of [(r:any)=>r.claimEntailment[0].fullyEntailed='true',(r:any)=>r.semanticChecks[0].attribution='true']){const r=result();mutate(r);expect(decidePublicationValidation(claims,r).status).toBe('UNRESOLVED');}
});
it.each(['missing','UNRESOLVED'])('offered novelty with %s judgment remains unresolved before repair admission',status=>{
 const offered=structuredClone(claims);offered[0].newUnderstandingFacts=offered[0].requiredFacts;
 const r=result();if(status!=='missing')r.semanticChecks[0].readerNovelty={status,reason:'Cannot decide novelty.',previousFactTexts:[]};
 expect(decidePublicationValidation(offered,r).status).toBe('UNRESOLVED');
});
it('overlapping packets cannot erase contradictory novelty judgments',()=>{
 const offered=structuredClone(claims);offered[0].newUnderstandingFacts=offered[0].requiredFacts;offered[0].previousLedgerFacts=[claims[0].requiredFacts[0].text];
 const a=result(),b=result();a.semanticChecks[0].readerNovelty={status:'NEW',reason:'New.',previousFactTexts:[]};b.semanticChecks[0].readerNovelty={status:'ALREADY_COMMUNICATED',reason:'Known.',previousFactTexts:[claims[0].requiredFacts[0].text]};
 expect(decidePublicationPackets(offered,[{claims:offered,result:a},{claims:offered,result:b}]).decision.status).toBe('UNRESOLVED');
});
it('omitted optional novelty does not require a verdict once actual required novelty is established',()=>{
 const offered=structuredClone(claims);offered[0].newUnderstandingFacts=[...offered[0].requiredFacts,{id:'optional',text:'Optional background.',evidenceRevisionIds:['r']}];offered[0].allowedFacts=offered[0].newUnderstandingFacts;
 const r=result();r.semanticChecks[0].readerNovelty={status:'NEW',reason:'Required new meaning is communicated.',previousFactTexts:[]};
 expect(decidePublicationValidation(offered,r).status).toBe('ACCEPT');
});
it('missing optional novelty cannot authorize repair if no communicated novelty has been established',()=>{
 const offered=structuredClone(claims);offered[0].newUnderstandingFacts=[{id:'optional',text:'Optional background.',evidenceRevisionIds:['r']}];offered[0].allowedFacts=[...offered[0].requiredFacts,...offered[0].newUnderstandingFacts];
 expect(decidePublicationValidation(offered,result()).status).toBe('UNRESOLVED');
});

it('rejects an unsupported extra clause without treating supported facts in that paragraph as contradictory judgments',()=>{
 const written=structuredClone(claims);written[0].text+=' Officials guaranteed full recovery.';const r=result();r.supportedClaimIds=[];r.claimEntailment[0]={claimId:'c',fullyEntailed:false,reason:'The injury count is supported, but guaranteed recovery is not.',unsupportedMeaning:['Guaranteed full recovery.']};r.semanticChecks[0].readerSpans=[{claimId:'c',text:written[0].text,start:0,end:written[0].text.length}];expect(decidePublicationValidation(written,r)).toMatchObject({status:'REJECT',reasons:['CLAIM_NOT_ENTAILED']});
});
it('novelty cannot override a negative fidelity judgment or turn it into uncertainty',()=>{
 const offered=structuredClone(claims);offered[0].newUnderstandingFacts=offered[0].requiredFacts;
 const r=result();r.supportedClaimIds=[];r.preservedFactIds=[];r.claimEntailment[0].fullyEntailed=false;r.claimEntailment[0].unsupportedMeaning=['Missing attribution.'];r.semanticChecks[0].attribution=false;r.semanticChecks[0].readerNovelty={status:'NEW',reason:'Not previously communicated.',previousFactTexts:[]};
 expect(decidePublicationValidation(offered,r)).toMatchObject({status:'REJECT',reasons:expect.arrayContaining(['CLAIM_NOT_ENTAILED','FACT_FACET_FAILED'])});
});