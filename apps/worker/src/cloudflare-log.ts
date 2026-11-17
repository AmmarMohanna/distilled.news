import {canonicalJson} from './v1-intake/canonical';
/** Gateway cost is an estimate. Routing binds the TLS response header log ID to authenticated provider metadata. Optional stored response bodies, when available, must also match exactly. */
export function validateCloudflareLog(log:any,logId:string,model:string,payload:any):{billingSource:'UNIFIED';estimatedCostUsd?:number}{
 let response:any;if(log?.response_head!=null){try{response=JSON.parse(log.response_head)}catch{throw Error('MODEL_BILLING_ROUTE_UNPROVEN')}}
 if(typeof payload?.id!=='string'||!payload.id||log.id!==logId||log.provider!=='openai'||log.model!==model.replace(/^cloudflare:/,'')||log.success!==true||log.status_code!==200||log.cached!==false||log.wholesale!==true||log.byok!==null||log.response_head_complete!==true||(response&&(response.state!=='Completed'||!response.result||canonicalJson(response.result)!==canonicalJson(payload)))||log.tokens_in!==payload.usage?.prompt_tokens||log.tokens_out!==payload.usage?.completion_tokens)throw Error('MODEL_BILLING_ROUTE_UNPROVEN');
 return {billingSource:'UNIFIED',...(log.custom_cost===false&&typeof log.cost==='number'&&Number.isFinite(log.cost)&&log.cost>=0?{estimatedCostUsd:log.cost}:{})};
}
