import type { AuthenticatedXAcquisitionRequestMessage,Env } from "./types";

interface Row { request_id:string; request_json:string }

/** Durable queue wrapper around the same protected X acquisition route. */
export async function processAuthenticatedXAcquisitionRequest(
  env:Pick<Env,"DB"|"WEB_OPERATOR_RUNTIME_TOKEN">,
  message:AuthenticatedXAcquisitionRequestMessage,
  invoke:(request:Request)=>Promise<Response>
):Promise<void>{
  const claimed=await env.DB.prepare("UPDATE authenticated_x_acquisition_requests SET state='running',started_at=? WHERE request_id=? AND state IN ('pending','queued')")
    .bind(new Date().toISOString(),message.requestId).run();
  if(Number(claimed.meta.changes)!==1)return;
  const row=await env.DB.prepare("SELECT request_id,request_json FROM authenticated_x_acquisition_requests WHERE request_id=?").bind(message.requestId).first<Row>();
  if(!row)return;
  if(!env.WEB_OPERATOR_RUNTIME_TOKEN){await finish(env.DB,row.request_id,"failed",null,"runtime_token_unavailable");return}
  try{
    const response=await invoke(new Request("https://worker.internal/v1/authenticated-sources/x/acquisition",{
      method:"POST",headers:{authorization:`Bearer ${env.WEB_OPERATOR_RUNTIME_TOKEN}`,"content-type":"application/json"},body:row.request_json
    }));
    if(!response.ok){await finish(env.DB,row.request_id,"failed",null,`http_${response.status}`);return}
    const result=await response.json<Record<string,unknown>>();
    const bounded={
      status:safeString(result.status,40),stopReason:safeString(result.stopReason,40),
      upstreamResourceId:safeString(result.upstreamResourceId,100),
      activeWorkflow:boundedWorkflow(result.activeWorkflow),candidateWorkflow:boundedWorkflow(result.candidateWorkflow),
      webOperatorCalls:boundedNumber(result.webOperatorCalls),discoveryModelCalls:boundedNumber(result.discoveryModelCalls),
      discoveryBrowserOperations:boundedNumber(result.discoveryBrowserOperations),
      coverage:boundedCoverage(result.coverage),committedHighWater:safeString(result.committedHighWater,40),
      items:Array.isArray(result.items)?result.items.slice(0,30).map(value=>{
        const item=value&&typeof value==="object"?value as Record<string,unknown>:{};
        return{sourceItemId:safeString(item.sourceItemId,80),publishedAt:safeString(item.publishedAt,40),contentLength:boundedNumber(item.contentLength)};
      }):[]
    };
    await finish(env.DB,row.request_id,"completed",JSON.stringify(bounded),null,bounded.status);
  }catch{await finish(env.DB,row.request_id,"failed",null,"internal_execution_failure")}
}

export async function dispatchPendingAuthenticatedXAcquisitionRequests(env:Pick<Env,"DB"|"WEB_OPERATOR_QUEUE">):Promise<number>{
  await env.DB.prepare("UPDATE authenticated_x_acquisition_requests SET state='failed',failure_class='execution_deadline_exceeded',completed_at=? WHERE state='running' AND started_at<?")
    .bind(new Date().toISOString(),new Date(Date.now()-15*60_000).toISOString()).run();
  const rows=await env.DB.prepare("SELECT request_id FROM authenticated_x_acquisition_requests WHERE state='pending' ORDER BY created_at LIMIT 5").all<{request_id:string}>();
  for(const row of rows.results){
    await env.WEB_OPERATOR_QUEUE.send({type:"authenticated_x_acquisition_request",requestId:row.request_id} satisfies AuthenticatedXAcquisitionRequestMessage);
    await env.DB.prepare("UPDATE authenticated_x_acquisition_requests SET state='queued' WHERE request_id=? AND state='pending'").bind(row.request_id).run();
  }
  return rows.results.length;
}

async function finish(db:Env["DB"],id:string,state:"completed"|"failed",json:string|null,failure:string|null,outcome:string|null=null){
  await db.prepare("UPDATE authenticated_x_acquisition_requests SET state=?,result_json=?,failure_class=?,outcome=?,completed_at=? WHERE request_id=? AND state='running'")
    .bind(state,json,failure,outcome,new Date().toISOString(),id).run();
}
const safeString=(value:unknown,max:number)=>typeof value==="string"?value.slice(0,max):null;
const boundedNumber=(value:unknown)=>typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=100000?value:null;
function boundedWorkflow(value:unknown){
  if(!value||typeof value!=="object")return null;
  const workflow=value as Record<string,unknown>;
  return{id:safeString(workflow.id,100),version:boundedNumber(workflow.version),state:safeString(workflow.state,30)};
}
function boundedCoverage(value:unknown){
  if(!value||typeof value!=="object")return null;
  const coverage=value as Record<string,unknown>;
  return{rangeCovered:coverage.rangeCovered===true,truncated:coverage.truncated===true,stopReason:safeString(coverage.stopReason,40)};
}
