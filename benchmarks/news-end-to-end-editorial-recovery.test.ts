import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {V1FeedStore,feedTransact} from '../apps/worker/src/v1-intelligence/store';
import {decodeV2EditorialResponse,v2EditorialRequest,V2_WHOLE_PARENT_POLICY,V2_WHOLE_PARENT_EDITORIAL_POLICY} from '../apps/worker/src/v1-intelligence/editorial-plan-v2';
import {communicationFingerprint} from '../apps/worker/src/v1-intelligence/editorial';
import {deferPropositionWork} from '../apps/worker/src/v1-intelligence/editorial-proposition-work';
import {settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
import {sha256} from '../packages/contracts/src/index';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {loadNews,saveNews,newsRoot} from './news-evaluation-transport';
import {hash} from './news-end-to-end';

// Explicit local operator recovery. No paid request, no historical receipt update,
// no live runtime route, and no promotion of a Cloudflare qualification record.
it.skipIf(process.env.DISTILLED_NEWS_E2E_RECOVER_EDITORIAL!=='EXACT_SAVED_OPENROUTER_RESPONSE')('restores only the strict-validated saved editorial plan with an append-only operator recovery audit',async()=>{
 const prefix=newsRoot+'/openrouter-195802d1580e83b79bb4',paid=loadNews(prefix+'-accounted.json'),intent=loadNews(prefix+'-intent.json'),proof=loadNews(prefix+'-generation-proof.json');
 expect(paid.recovery).toBe('ACCOUNTING_ONLY_NO_SEMANTIC_PROMOTION');expect(paid.requestHash).toBe(hash(intent.body));expect(paid.model).toBe('openai/gpt-4.1');expect(paid.usage.confirmed).toBe(true);expect(proof.data.total_cost).toBe(paid.costUsd);
 const credential=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=credential.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const remote=evaluationD1(token!) as unknown as D1Database,financial=await remote.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(paid.id).first<any>();expect(financial).toEqual({token:paid.token,cost_usd:paid.costUsd,reported:1});
 const mf=await persistentEvaluationDatabase(join(process.cwd(),newsRoot,'d1-openrouter'));
 try{
  const store=new V1FeedStore(mf.db,undefined,'local-news-mirror'),operationId='5cc1ed0d123b3b32beeda7131a63f874581acd161e14cf0727ca582f361f504f';
  const localIntent=await store.read<any>('feed-1','semantic_intents',operationId),oldResult=await store.read<any>('feed-1','semantic_results',operationId),oldSettlement=await store.read<any>('feed-1','semantic_settlements',operationId);
  expect(localIntent.input.model).toBe(paid.model);expect(localIntent.input.policyVersion).toBe(V2_WHOLE_PARENT_EDITORIAL_POLICY);
  const {outputSchema,...state}=localIntent.input.state;expect(hash(state)).toBe(hash(intent.payload));expect(hash(outputSchema)).toBe(hash(intent.schema));
  expect(oldResult.failure).toBe('SEMANTIC_PROVIDER_FAILURE');expect(oldResult.usage.reported).toBe(false);
  const shortlist=(await store.list<any>('feed-1','shortlists')).find(s=>s.policyVersion.endsWith(':evidence-grounded-v2')&&s.window.start===state.window.start&&s.window.end===state.window.end&&s.feedRevision===localIntent.input.feedRevision&&canonicalJson(s.candidates.map((c:any)=>c.targetVersionId).sort())===canonicalJson(state.candidates.map((c:any)=>c.targetVersionId).sort()));expect(shortlist).toBeTruthy();expect(hash(v2EditorialRequest(shortlist,(await store.getFeed('feed-1'))!,true).state)).toBe(hash(intent.payload));
  const accepted=decodeV2EditorialResponse({value:paid.result},shortlist,V2_WHOLE_PARENT_POLICY),before={result:hash(oldResult),settlement:hash(oldSettlement)},now=new Date().toISOString();
  await settleModelSpending(mf.db,'semantic_intents:'+operationId,localIntent.token,{costUsd:paid.costUsd,reported:true});
  const planId=await sha256(canonicalJson({shortlistId:shortlist.id,feedRevision:shortlist.feedRevision,model:paid.model,policy:V2_WHOLE_PARENT_EDITORIAL_POLICY}));
  await feedTransact(store,'feed-1',async tx=>{
   expect(tx.snapshot.feed.revision).toBe(shortlist.feedRevision);expect(await communicationFingerprint(tx,shortlist.window.end)).toBe(shortlist.communicationFingerprint);
   for(const revision of localIntent.input.evidenceRevisionIds)expect((await store.activeEvidenceRevisionIds('feed-1')).has(revision)).toBe(true);
   if(await tx.read('editorial_plans',planId))return;
   const recoveryId=JSON.stringify([operationId,shortlist.id]);await tx.write('editorial_response_recoveries',recoveryId,{id:recoveryId,feedId:'feed-1',source:'EXPLICIT_LOCAL_OPERATOR_RECOVERY_OF_COMPLETE_SAVED_RESPONSE',requestHash:paid.requestHash,providerGenerationId:proof.data.id,providerResolvedModel:proof.data.model,remoteReceiptHash:hash(financial),priorSemanticResultHash:before.result,priorSemanticSettlementHash:before.settlement,sourceAnchorPolicy:V2_WHOLE_PARENT_POLICY,validation:'UNCHANGED_V2_EDITORIAL_VALIDATOR',createdAt:now});
   await tx.write('editorial_plans',planId,{...accepted,id:planId,feedId:'feed-1',feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route:'GPT',plannerSource:'REAL_COMPARATIVE_MODEL',modelOperationIds:[operationId],operationId,evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:V2_WHOLE_PARENT_EDITORIAL_POLICY,validationContract:'EVIDENCE_GROUNDED_V2',createdAt:now});
   for(const story of accepted.stories){const candidate=shortlist.candidates.find((c:any)=>c.targetVersionId===story.targetVersionId);for(const d of story.validation!.dispositions)if(['REQUIRED','DEFERRED'].includes(d.disposition)){const p=story.validation!.propositions.find(p=>p.id===d.propositionId)!;await deferPropositionWork(tx,candidate,p,planId,shortlist.window.end,now)}}
  });
  expect(hash(await store.read('feed-1','semantic_results',operationId))).toBe(before.result);expect(hash(await store.read('feed-1','semantic_settlements',operationId))).toBe(before.settlement);
  saveNews(newsRoot+'/openrouter-editorial-recovery.json',{planId,operationId,...before,scope:'LOCAL_OPERATOR_ASSISTED_NOT_UNATTENDED_SUCCESS',newPaidCalls:0,at:now});
 }finally{await mf.dispose()}
},60000);
