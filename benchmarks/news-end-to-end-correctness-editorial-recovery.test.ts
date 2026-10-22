import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {V1FeedStore,feedTransact} from '../apps/worker/src/v1-intelligence/store';
import {decodeV2EditorialResponse,v2EditorialRequest} from '../apps/worker/src/v1-intelligence/editorial-plan-v2';
import {COMPACT_COMPLETE_PARENT_POLICY,COMPACT_COMPLETE_EDITORIAL_POLICY} from '../apps/worker/src/v1-intelligence/editorial-complete-parents';
import {communicationFingerprint} from '../apps/worker/src/v1-intelligence/editorial';
import {deferPropositionWork} from '../apps/worker/src/v1-intelligence/editorial-proposition-work';
import {settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
import {sha256} from '../packages/contracts/src/index';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {loadNews,saveNews,newsEvaluationTransport} from './news-evaluation-transport';
import {hash} from './news-end-to-end';
import {llmRoute} from '../apps/worker/src/v1-intelligence/provider-routing';

const newsRoot='.local-reports/news-correctness-openrouter';
// Explicit local operator recovery. No paid request, no historical receipt update,
// no live runtime route, and no promotion of a Cloudflare qualification record.
it.skipIf(process.env.DISTILLED_NEWS_CORRECTNESS_RECOVER_EDITORIAL!=='EXACT_SAVED_OPENROUTER_RESPONSE')('restores only the strict-validated saved editorial plan with an append-only operator recovery audit',async()=>{
 const prefix=newsRoot+'/openrouter-93030bb9174c06abd373',paid=loadNews(prefix+'-accounted.json'),intent=loadNews(prefix+'-intent.json'),proof=loadNews(prefix+'-generation-proof.json');
 expect(paid.recovery).toBe('ACCOUNTING_ONLY_NO_SEMANTIC_PROMOTION');expect(paid.requestHash).toBe(hash(intent.body));expect(paid.model).toBe('openai/gpt-4.1');expect(paid.usage.confirmed).toBe(true);expect(proof.data.total_cost).toBe(paid.costUsd);
 const credential=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=credential.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const remote=evaluationD1(token!) as unknown as D1Database,financial=await remote.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(paid.id).first<any>();expect(financial).toEqual({token:paid.token,cost_usd:paid.costUsd,reported:1});
 const mf=await persistentEvaluationDatabase(join(process.cwd(),newsRoot,'d1-real-publication-openrouter'));
 try{
  const store=new V1FeedStore(mf.db,undefined,'local-news-mirror'),operationId='a972caa8b5f97c5b8a1634fdc26f257bf860b7330b912fde6925b4fba0a35716';
  const localIntent=await store.read<any>('feed-1','semantic_intents',operationId),oldResult=await store.read<any>('feed-1','semantic_results',operationId),oldSettlement=await store.read<any>('feed-1','semantic_settlements',operationId);
  expect(localIntent.input.model).toBe(paid.model);expect(localIntent.input.policyVersion).toBe(COMPACT_COMPLETE_EDITORIAL_POLICY);
  const {outputSchema,...state}=localIntent.input.state;expect(hash(state)).toBe(hash(intent.payload));expect(hash(outputSchema)).toBe(hash(intent.schema));
  expect(oldResult.failure).toBe('SEMANTIC_UNKNOWN_NEWS_ACCOUNTING_NO_FURTHER_CALLS');expect(oldResult.usage.reported).toBe(false);
  const shortlist=(await store.list<any>('feed-1','shortlists')).find(s=>s.policyVersion.endsWith(':evidence-grounded-v2')&&s.window.start===state.window.start&&s.window.end===state.window.end&&s.feedRevision===localIntent.input.feedRevision);expect(shortlist).toBeTruthy();expect(hash(v2EditorialRequest(shortlist,(await store.getFeed('feed-1'))!,'COMPLETE_COMPACT').state)).toBe(hash(intent.payload));
  let accepted:ReturnType<typeof decodeV2EditorialResponse>,repairPaid:any;
  try{accepted=decodeV2EditorialResponse({value:paid.result},shortlist,COMPACT_COMPLETE_PARENT_POLICY)}catch(e){
   saveNews(newsRoot+'/compact-editorial-rejection.json',(e as any).diagnostic);expect((e as any).diagnostic.rejection.code).toBe('NAVIGATION_PROVENANCE_REQUIRED');
   const vars=readFileSync(process.env.DISTILLED_EVALUATION_VARS_FILE!,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');expect(key).toBeTruthy();
   const env:any={OPENROUTER_API_KEY:key,DISTILLED_LLM_API_GATEWAY:'openrouter',V1_LLM_ROUTES_JSON:JSON.stringify({editorial:{provider:'openrouter',model:'openai/gpt-4.1'}})},transport=newsEvaluationTransport(env,{correctnessOnly:true}),route=llmRoute(env,'editorial');
   try{
    const schema=structuredClone(intent.schema);schema.$defs.EditorialParentDecision.anyOf[1].properties.disposition={type:'string',enum:['OPTIONAL_CONTEXT','DEFERRED']};
    const payload={...intent.payload,repair:{failedResponse:paid.result,validationFailure:'NAVIGATION_PROVENANCE_REQUIRED',instruction:'Reconsider this rejected plan against every offered source fact. No offered fact has trusted NOT_NEWS provenance: use DEFERRED for non-reader material, never fabricate provenance. Preserve important correction/relationship clarification in the selected source story where supported. Replit continued access and the clarification of the alleged ended Anthropic partnership are essential context for the default-model change. Return the complete keyed plan; the unchanged application validator will check it.'}};
    const envelope=transport.admission(route,payload,schema);console.info(JSON.stringify({type:'EDITORIAL_REPAIR_ADMISSION',...envelope}));expect(envelope.fits).toBe(true);
    const repaired=await transport.complete({route,feedId:'feed-1',phase:'EDITORIAL_OUTPUT_REPAIR',payload,schema,limits:{maxOutputTokens:envelope.maxOutputTokens,signal:AbortSignal.timeout(180000)}});
    accepted=decodeV2EditorialResponse({value:repaired.result},shortlist,COMPACT_COMPLETE_PARENT_POLICY);repairPaid={usage:repaired.usage,requestHash:hash({payload,schema})};saveNews(newsRoot+'/compact-editorial-repair-validation.json',{accepted,repairPaid});
   }finally{await transport.close()}
  }
  const before={result:hash(oldResult),settlement:hash(oldSettlement)},now=new Date().toISOString();
  await settleModelSpending(mf.db,'semantic_intents:'+operationId,localIntent.token,{costUsd:paid.costUsd,reported:true});
  const planId=await sha256(canonicalJson({shortlistId:shortlist.id,feedRevision:shortlist.feedRevision,model:paid.model,policy:COMPACT_COMPLETE_EDITORIAL_POLICY}));
  await feedTransact(store,'feed-1',async tx=>{
   expect(tx.snapshot.feed.revision).toBe(shortlist.feedRevision);expect(await communicationFingerprint(tx,shortlist.window.end)).toBe(shortlist.communicationFingerprint);
   for(const revision of localIntent.input.evidenceRevisionIds)expect((await store.activeEvidenceRevisionIds('feed-1')).has(revision)).toBe(true);
   if(await tx.read('editorial_plans',planId))return;
   const recoveryId=JSON.stringify([operationId,shortlist.id]);await tx.write('editorial_response_recoveries',recoveryId,{id:recoveryId,feedId:'feed-1',source:'EXPLICIT_LOCAL_OPERATOR_RECOVERY_OF_COMPLETE_SAVED_RESPONSE',requestHash:paid.requestHash,providerGenerationId:proof.data.id,providerResolvedModel:proof.data.model,repairPaid,remoteReceiptHash:hash(financial),priorSemanticResultHash:before.result,priorSemanticSettlementHash:before.settlement,sourceAnchorPolicy:COMPACT_COMPLETE_PARENT_POLICY,validation:'UNCHANGED_V2_EDITORIAL_VALIDATOR',createdAt:now});
   await tx.write('editorial_plans',planId,{...accepted,id:planId,feedId:'feed-1',feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route:'GPT',plannerSource:'REAL_COMPARATIVE_MODEL',modelOperationIds:[operationId],operationId,evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:COMPACT_COMPLETE_EDITORIAL_POLICY,validationContract:'EVIDENCE_GROUNDED_V2',createdAt:now});
   for(const story of accepted.stories){const candidate=shortlist.candidates.find((c:any)=>c.targetVersionId===story.targetVersionId);for(const d of story.validation!.dispositions)if(['REQUIRED','DEFERRED'].includes(d.disposition)){const p=story.validation!.propositions.find(p=>p.id===d.propositionId)!;await deferPropositionWork(tx,candidate,p,planId,shortlist.window.end,now)}}
  });
  expect(hash(await store.read('feed-1','semantic_results',operationId))).toBe(before.result);expect(hash(await store.read('feed-1','semantic_settlements',operationId))).toBe(before.settlement);
  saveNews(newsRoot+'/openrouter-editorial-recovery.json',{planId,operationId,...before,scope:'LOCAL_OPERATOR_ASSISTED_NOT_UNATTENDED_SUCCESS',newPaidCalls:0,at:now});
 }finally{await mf.dispose()}
},300000);
