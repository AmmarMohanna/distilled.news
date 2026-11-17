import {it,expect} from 'vitest';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {readStructuredStream} from '../apps/worker/src/provider-stream';
import {decodeV2EditorialResponse,V2_WHOLE_PARENT_POLICY} from '../apps/worker/src/v1-intelligence/editorial-plan-v2';
import {boundedCompletion} from '../apps/worker/src/ai';
const prefix='.local-reports/news-end-to-end/openrouter-195802d1580e83b79bb4';
it.skipIf(!existsSync(prefix+'-response.json'))('replays the saved complete editorial stream without issuing inference',async()=>{
 const saved=JSON.parse(readFileSync(prefix+'-response.json','utf8')),intent=JSON.parse(readFileSync(prefix+'-intent.json','utf8'));
 const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{},saved.headers['x-generation-id']);
 expect(parsed.usage.cost).toBe(.110432);expect(parsed.choices[0].finish_reason).toBe('stop');
 let usage:any;
 const result=await boundedCompletion({accountId:'',gatewayId:'',apiKey:'offline',model:'openai/gpt-4.1',provider:'OPENROUTER',usageRecorder:async row=>{usage=row},fetcher:async()=>new Response(saved.raw,{headers:{'content-type':'text/event-stream','x-generation-id':saved.headers['x-generation-id']}})},'offline','event_review','COMPARATIVE_EDITORIAL_PLAN',JSON.stringify(intent.payload),intent.schema,{maxOutputTokens:12288,signal:new AbortController().signal,uniqueJsonKeys:true});
 const shortlist=readdirSync('.local-reports/news-end-to-end').filter(n=>n.startsWith('openrouter-checkpoint-')).map(n=>JSON.parse(readFileSync('.local-reports/news-end-to-end/'+n,'utf8'))).find(x=>x.stage==='SHORTLIST').value;
 const accepted=decodeV2EditorialResponse({value:result},shortlist,V2_WHOLE_PARENT_POLICY);expect(accepted.stories.length).toBe(shortlist.candidates.length);
 expect(result.stories).toBeInstanceOf(Array);expect(usage.reportedCostUsd).toBe(.110432);
});
