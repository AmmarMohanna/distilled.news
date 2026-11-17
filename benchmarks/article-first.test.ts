import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION,ARTICLE_FIRST_POLICY} from '../apps/worker/src/v1-intelligence/construction-transport';
import {admitModelOperation,modelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';
import {STAGING_GROUPING_CAPABILITIES_JSON} from '../apps/worker/src/staging-grouping-run-policy';
import saved from './minimal-construction-staging-results.json';
import original from './fresh-private-staging-mission-results.json';
it('bounds article-first input using unchanged complete evidence without predicting model decisions',()=>{
 const root='.local-reports/single-feed-preflight/',read=(name:string,hash:string)=>{const b=readFileSync(root+name);expect(createHash('sha256').update(b).digest('hex')).toBe(hash);return JSON.parse(b.toString('utf8'))};
 const e=read('minimal-construction-20261019-1-evidence.json',saved.privateEvidenceSha256['minimal-construction-20261019-1-evidence.json']),result=e.docs.result[0].results.filter((r:any)=>r.kind==='semantic_results').map((r:any)=>JSON.parse(r.json)).find((r:any)=>r.input.state?.constructionOwnershipVersion===MINIMAL_CONSTRUCTION_VERSION);
 const revision=JSON.parse(read('fresh-evidence-after-recovery.json',original.privateEvidenceSha256['fresh-evidence-after-recovery.json']).result[0].results[0].json),mentions=read('fresh-final-readonly.json',original.privateEvidenceSha256['fresh-final-readonly.json']).retained.result[0].results.map((r:any)=>JSON.parse(r.json));
 const wire=constructionTransport(mentions,{revision,candidates:[],storylineIds:[],role:'REPORTED_DEVELOPMENT'},{...result.input.state,articleUnderstandingPolicy:ARTICLE_FIRST_POLICY}),admission=admitModelOperation('openai/gpt-4.1-mini',wire.state,wire.schema,modelCapability('openai/gpt-4.1-mini',STAGING_GROUPING_CAPABILITIES_JSON)!);expect(admission.fits).toBe(true);expect(wire.state.source.text).toBe(revision.body);expect(wire.state.claimMentions).toHaveLength(9);
 writeFileSync('benchmarks/article-first-offline-results.json',JSON.stringify({mode:'OFFLINE_INPUT_ADMISSION_ONLY',policy:ARTICLE_FIRST_POLICY,paidCalls:0,paidCostUsd:0,sourceUnits:9,inputBytes:admission.requestBytes,inputTokenUpperBound:admission.inputTokenUpperBound,reservationUpperUsd:admission.reservationCostUsd,maximumConstructionCalls:2,additionalInferenceStages:0,previousActual:{tokensIn:result.usage.tokensIn,tokensOut:result.usage.tokensOut,costUsd:result.usage.costUsd,modelLatencyMs:result.latencyMs,groups:7,deferredGroups:6},revisedActual:{firstCallAcceptance:null,falseSplits:null,falseMerges:null,unnecessaryDefer:null,tokensIn:null,tokensOut:null,costUsd:null,latencyMs:null},limitations:['Prompt and controlled graph fixtures cannot establish actual model grouping quality.','No provider call, compatible new verdict or successful publication exists for this policy.']},null,2)+'\n');
});
