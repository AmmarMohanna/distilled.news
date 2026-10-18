import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateLabels, scoreValidationEvaluation} from './validate-validation-labels.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const text='## T01\n\nSource: Road reopened. Bridge closed.\nReader: Road reopened.\n';
const witness=(quote,kind)=>({artifact:'REVIEW.md',sha256:hash(text),section:'T01',quote,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length,kind});
function fixture(){return {schemaVersion:'publication-validation-labels-v2',reviewer:'reviewer',reviewedAt:'2026-10-18',provenance:'AI_ASSISTED',previouslyReadAudit:true,modelAssistanceUsed:true,evidenceInspected:[{artifact:'REVIEW.md',sha256:hash(text),scope:'entire file'}],sourceManifestSha256:hash('manifest'),cases:[{id:'T01',reviewState:'REVIEWED',readerScopesInspected:[],claims:[{claimId:'T01-reader',readerText:'Road reopened.',support:'SUPPORTED',errorKind:null,facets:[],sourceWitnesses:[witness('Road reopened.','CONTROL_SOURCE')],readerWitnesses:[witness('Road reopened.','CONTROL_READER')],reason:'Exact support.'}],requirements:[{propositionId:'bridge',sourcePropositionText:'Bridge closed.',editorialRequirementId:null,materiality:'REQUIRED',communication:'OMITTED',sourceWitnesses:[witness('Bridge closed.','CONTROL_SOURCE')],readerWitnesses:[],omissionScopeWitnesses:[{artifact:'REVIEW.md',sha256:hash(text),section:'T01',scope:'COMPLETE_CONTROL_READER',scopeSha256:hash('Road reopened.')}],reason:'Separate essential development absent.'}],reason:'Case scope only.'}]};}
const manifest={caseIds:['T01'],sourceManifestSha256:hash('manifest'),artifacts:{'REVIEW.md':Buffer.from(text)}};
test('true surviving prose and missing mandatory development remain separate',()=>{
 const result=validateLabels(fixture(),manifest);assert.equal(result.valid,true);assert.equal(result.cases[0].outcome,'NEGATIVE');assert.equal(result.cases[0].claims[0].support,'SUPPORTED');assert.deepEqual(result.cases[0].errors,['MISSING_MANDATORY_COVERAGE']);
});
test('optional omission does not become a false reader claim or coverage error',()=>{const j=fixture();j.cases[0].requirements[0].materiality='OPTIONAL';const r=validateLabels(j,manifest);assert.equal(r.valid,true);assert.equal(r.cases[0].outcome,'POSITIVE');assert.equal(r.editionCertified,false);});
test('rejects missing/duplicate IDs, altered bytes, wrong sections, offsets, and empty reasons',()=>{
 for(const mutate of [j=>j.cases=[],j=>j.cases.push(j.cases[0]),j=>j.cases[0].reason=' ',j=>j.cases[0].claims[0].sourceWitnesses[0].start++,j=>j.cases[0].claims[0].sourceWitnesses[0].section='T02',j=>j.cases[0].requirements[0].omissionScopeWitnesses[0].scopeSha256=hash('different')]){const j=fixture();mutate(j);assert.equal(validateLabels(j,manifest).valid,false);}
 assert.equal(validateLabels(fixture(),{...manifest,artifacts:{'REVIEW.md':Buffer.from(text+'changed')}}).valid,false);
});
test('unreviewed null is excluded rather than relabeled as substantive uncertainty',()=>{const j=fixture();j.cases[0]={id:'T01',reviewState:'UNREVIEWED',claims:null,requirements:null,readerScopesInspected:null,reason:null};const r=validateLabels(j,manifest);assert.equal(r.valid,true);assert.equal(r.cases[0].outcome,'UNREVIEWED');});
test('AI exposure cannot become independent human gold',()=>{const j=fixture();j.provenance='INDEPENDENT_HUMAN';assert.equal(validateLabels(j,manifest).valid,false);});
test('scores only compatible outcomes, with unresolved and missing results visible',()=>{
 const labels=[{id:'p',outcome:'POSITIVE'},{id:'n',outcome:'NEGATIVE'},{id:'u',outcome:'UNRESOLVED'},{id:'p2',outcome:'POSITIVE'}];
 const r=scoreValidationEvaluation(labels,[{id:'p',compatible:true,decision:'REJECT'},{id:'n',compatible:true,decision:'ACCEPT'},{id:'u',compatible:true,decision:'UNRESOLVED'}],'AI_ASSISTED');
 assert.equal(r.falseRejections,1);assert.equal(r.falseAcceptances,1);assert.equal(r.missingVerdicts,1);assert.equal(r.labelUnresolved,1);assert.equal(r.independentGold,false);
 const empty=scoreValidationEvaluation(labels,[],'AI_ASSISTED');assert.equal(empty.accuracy,'UNMEASURED');assert.equal(empty.falseAcceptances,null);assert.equal(empty.falseRejections,null);
});
