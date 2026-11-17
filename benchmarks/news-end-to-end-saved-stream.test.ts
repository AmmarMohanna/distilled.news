import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {boundedCompletion} from '../apps/worker/src/ai';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {join} from 'node:path';
import {withProviderReceiptSink} from '../apps/worker/src/provider-receipt';
import {readStructuredStream} from '../apps/worker/src/provider-stream';
const root='.local-reports/news-correctness-openrouter/';
it('decodes the saved real complete verification response without network',async()=>{
 const saved=JSON.parse(readFileSync(root+'openrouter-332366573ff7bc3d4519-response.json','utf8')),intent=JSON.parse(readFileSync(root+'openrouter-332366573ff7bc3d4519-intent.json','utf8'));
 const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{},saved.headers['x-generation-id']);expect(parsed.usage.cost).toBe(.09851);
 const mf=await persistentEvaluationDatabase(join(process.cwd(),root,'d1-real-publication-openrouter'));
 try{const result=await withProviderReceiptSink(async receipt=>{const id=JSON.stringify(['semantic_intents:9b24fc5848d92cde4bdec7407b118f8f8211e444c1c48ced3aaef636f155ab1a',receipt.stage]);if(receipt.stage!=='HEADERS')return;const saved=await mf.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='model_provider_receipts' AND id=? AND feed_id=?").bind(id,'feed-1').first<any>();expect(saved).toBeTruthy();expect(JSON.parse(saved.json).generationId).toBe(receipt.generationId);expect(JSON.parse(saved.json).reportedCostUsd).toBe(receipt.reportedCostUsd)},()=>boundedCompletion({model:'openai/gpt-4.1',provider:'OPENROUTER',accountId:'',gatewayId:'',apiKey:'unused',fetcher:async()=>new Response(saved.raw,{headers:saved.headers})},'feed','event_review','GROUNDING',JSON.stringify(intent.payload),intent.schema,{maxOutputTokens:8192,signal:AbortSignal.timeout(10000),uniqueJsonKeys:true}));expect(result).toBeTruthy()}catch(e){console.info('CAUSE',String((e as any).cause));throw e}finally{await mf.dispose()}
});
