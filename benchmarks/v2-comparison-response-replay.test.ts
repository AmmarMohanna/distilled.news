import {it,expect} from 'vitest';import {readdirSync,existsSync} from 'node:fs';
import {comparisonRoot,load,save} from './v2-comparison-transport';
import {comparisonResponseModels} from './v2-configuration-comparison';
import {extractClaimMentions,isNewsMention} from '../apps/worker/src/v1-intelligence/claims';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from '../apps/worker/src/v1-intelligence/construction-transport';
import {parseConstruction} from '../apps/worker/src/v1-intelligence/semantic-construction';
it.skipIf(!existsSync(comparisonRoot+'/A-medium-state.json'))('recovers the already billed Luna response and validates all source assignments without inference',async()=>{
 const file=readdirSync(comparisonRoot).find(f=>f.startsWith('A-medium-')&&f.endsWith('-settled.json')&&load(comparisonRoot+'/'+f).error==='COMPARISON_RESPONSE_MODEL_IDENTITY_MISMATCH')!,settled=load(comparisonRoot+'/'+file),prefix=comparisonRoot+'/'+file.replace('-settled.json',''),intent=load(prefix+'-intent.json'),raw=load(prefix+'-response.json');
 expect(settled.error).toBe('COMPARISON_RESPONSE_MODEL_IDENTITY_MISMATCH');expect(comparisonResponseModels(raw.raw)).toEqual(['openai/gpt-6-luna']);
 const revision:any={id:intent.payload.source.id,feedId:'feed-1',body:intent.payload.source.text,title:intent.payload.source.title,contentHash:'retained-real-source',acceptedAt:load(comparisonRoot+'/shared-context.json').at};
 const mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input:any={revision,candidates:[],storylineIds:[],role:'REPORTED_DEVELOPMENT'},wire=constructionTransport(mentions,input,{...intent.payload,constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION});
 const result=parseConstruction(wire.decode(settled.result),mentions,input,{scorer:'REAL_RETAINED_LUNA_RESPONSE',policyVersion:'v2-model-comparison-v1'});
 expect(mentions).toHaveLength(48);expect(result.groups.flatMap(g=>g.claimMentionIds).length+result.backgroundMentionIds.length).toBe(48);
 save(prefix+'-identity-recovery.json',{at:new Date().toISOString(),originalOperationId:settled.id,operationHash:settled.operationHash,model:'openai/gpt-6-luna',remoteCostUsd:settled.usage.cost,newCalls:0,reason:'Heartbeat comments preceded the valid SSE model field; original settlement retained',validatedClaims:48,groups:result.groups.length});
 save(comparisonRoot+'/luna-retained-response-review.json',{sourceTitle:revision.title,groupCount:result.groups.length,groups:settled.result.groups,validatedClaimMentions:48,reviewMethod:'APPLICATION_VALIDATION_AND_AI_ASSISTED_REVIEW_NOT_HUMAN_GOLD',newPaidCalls:0});
});
