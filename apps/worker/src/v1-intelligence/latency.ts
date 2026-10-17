import {AsyncLocalStorage} from 'node:async_hooks';

export interface LatencyCorrelation {
 feedId:string;phase:'REVIEW'|'REMATCH'|'PUBLICATION'|'MODEL';
 reviewId?:string;windowId?:string;operationId?:string;
}
interface Measurement {counts:Record<string,number>;stages:Record<string,{count:number;durationMs:number}>;receiptOperationId?:string}
const measurements=new AsyncLocalStorage<Measurement>();
/** One bounded aggregate per execution, no D1 writes and no error/source payloads.
 * Stage totals may overlap; they are not an additive decomposition of wall time. */
export async function withLatency<T>(correlation:LatencyCorrelation,run:()=>Promise<T>):Promise<T>{
 const measurement:Measurement={counts:{},stages:{}},started=performance.now();let outcome='FAILED';
 try{return await measurements.run(measurement,async()=>{const result=await run();outcome='SUCCEEDED';return result})}
 finally{const {feedId,phase,reviewId,windowId,operationId}=correlation;console.info(JSON.stringify({type:'V1_PIPELINE_LATENCY',feedId,phase,reviewId,windowId,operationId,outcome,durationMs:performance.now()-started,...measurement}))}
}
export function countLatency(name:string,amount=1):void{
 const measurement=measurements.getStore();if(measurement&&Number.isFinite(amount))measurement.counts[name]=(measurement.counts[name]??0)+amount;
}
/** Receipt identity can differ from the requested operation on durable reuse.
 * Assign rather than increment: settlement and replay describe one receipt. */
export function recordModelReceipt(receiptOperationId:string,usage:{calls:number;costUsd:number;reported:boolean},latencyMs:number):void{
 const measurement=measurements.getStore();if(!measurement)return;
 measurement.receiptOperationId=receiptOperationId;
 measurement.counts.receiptProviderCalls=usage.calls;
 measurement.counts.receiptReportedCostUsd=usage.reported?usage.costUsd:0;
 measurement.counts.reportedUsage=usage.reported?1:0;
 measurement.counts.receiptProviderLatencyMs=latencyMs;
}
export async function measureLatency<T>(stage:string,run:()=>Promise<T>):Promise<T>{
 const measurement=measurements.getStore();if(!measurement)return run();
 const started=performance.now();
 try{return await run()}
 finally{const aggregate=measurement.stages[stage]??{count:0,durationMs:0};aggregate.count++;aggregate.durationMs+=performance.now()-started;measurement.stages[stage]=aggregate}
}
