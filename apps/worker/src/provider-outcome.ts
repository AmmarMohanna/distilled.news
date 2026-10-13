export interface ProviderDiagnostic {httpStatus:number;category?:string;code?:string;message:string;requestId?:string;reportedCostUsd?:number;execution:'REJECTED_BEFORE_EXECUTION'|'COMPLETED_WITH_KNOWN_USAGE'|'UNKNOWN'}
export class ProviderRequestError extends Error {constructor(message:string,readonly providerDiagnostic:ProviderDiagnostic){super(message)}}
export async function readProviderRejection(response:Response,secrets:string[]):Promise<{diagnostic:ProviderDiagnostic;usage?:{prompt_tokens?:number;completion_tokens?:number;cost?:number}}> {
 const reader=response.body?.getReader();let raw='',size=0;
 try{if(reader){const chunks:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536)break;chunks.push(part.value)}if(size<=65536){const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}raw=new TextDecoder().decode(bytes)}}}catch{}finally{await reader?.cancel().catch(()=>{})}
 let body:any;try{body=JSON.parse(raw)}catch{}
 let nested:any;try{nested=JSON.parse(body?.error?.metadata?.raw)}catch{}
 const error=nested?.error??body?.error,tag=(v:unknown)=>typeof v==='string'&&!secrets.includes(v)&&!/^(sk-|sk_or_|eyJ)/.test(v)&&/^[a-zA-Z0-9_.:-]{1,96}$/.test(v)?v:undefined;
 let message=typeof error?.message==='string'?error.message:'Provider error details unavailable';
 for(const secret of secrets.filter(Boolean))message=message.split(secret).join('[redacted]');
 message=message.replace(/Bearer\s+\S+|(?:sk-|sk_or_|eyJ)[A-Za-z0-9_./-]+/gi,'[redacted]').replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+/g,'[redacted]').replace(/[\x00-\x1f]/g,' ').slice(0,512);
 const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:undefined;
 const cost=body?.usage?.cost,known=typeof cost==='number'&&Number.isFinite(cost)&&cost>=0;
 // An HTTP status alone proves neither nonexecution nor nonbilling. Only the
 // explicit schema validation code identifies a pre-inference rejection.
 const rejected=response.status===400&&error?.code==='invalid_json_schema'&&error?.type==='invalid_request_error';
 const diagnostic:ProviderDiagnostic={httpStatus:response.status,...(known?{reportedCostUsd:cost}:{}),category:tag(error?.type),code:tag(error?.code),message,requestId:tag(response.headers.get('x-request-id'))??tag(response.headers.get('request-id')),execution:known?'COMPLETED_WITH_KNOWN_USAGE':rejected?'REJECTED_BEFORE_EXECUTION':'UNKNOWN'};
 return {diagnostic,usage:known?{cost,prompt_tokens:count(body.usage.prompt_tokens??body.usage.input_tokens),completion_tokens:count(body.usage.completion_tokens??body.usage.output_tokens)}:rejected?{cost:0,prompt_tokens:0,completion_tokens:0}:undefined};
}
