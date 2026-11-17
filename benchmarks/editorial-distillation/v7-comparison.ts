import {generateBriefing} from '../../packages/briefing/src/engine';
import type {ModelPort,ModelRequest,ModelResponse} from '../../packages/briefing/src/model';
import type {BriefingInput} from '../../packages/briefing/src/types';
import {createHash} from 'node:crypto';
export const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const MODELS={editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'};
export interface FrozenCase {id:string; input:BriefingInput; evidenceHash:string;}
export function freezeCase(corpus:any,id:string):FrozenCase {
 const c=corpus.cases.find((c:any)=>c.id===id);if(!c)throw Error('UNKNOWN_CASE');
 const input=structuredClone({feed:c.feed,windowStart:c.windowStart,windowEnd:c.windowEnd,prior:c.prior,articles:c.articleIds.map((id:string)=>{const a=corpus.sources.find((s:any)=>s.article.id===id)?.article;if(!a)throw Error('MISSING_SOURCE');return a;})});
 return {id,input,evidenceHash:hash(input)};
}
/** No network transport: caller must provide native paid-operation admission and durable receipts. */
export async function runFrozen(frozen:FrozenCase,version:4|7,admittedPort:ModelPort,persist:(event:unknown)=>Promise<void>){
 if(hash(frozen.input)!==frozen.evidenceHash)throw Error('EVIDENCE_CHANGED');
 const events:Array<{request:ModelRequest;response:ModelResponse;wallMs:number}>=[];
 const port:ModelPort={async complete(request){const stable=structuredClone(request);await persist({type:'intent',caseId:frozen.id,version,requestHash:hash(stable),request:stable});const start=performance.now();const response=await admittedPort.complete(request);const event={request:stable,response,wallMs:performance.now()-start};await persist({type:'response',caseId:frozen.id,version,...event});events.push(event);return response;}};
 const start=performance.now();const result=await generateBriefing(structuredClone(frozen.input),port,MODELS,{promptVersion:version,maxRepairs:1,now:()=>new Date(frozen.input.windowEnd)});
 const output={caseId:frozen.id,version,evidenceHash:frozen.evidenceHash,wallMs:performance.now()-start,result,events,publicationPersistence:false,semanticAssessment:null};await persist({type:'complete',...output});return output;
}
