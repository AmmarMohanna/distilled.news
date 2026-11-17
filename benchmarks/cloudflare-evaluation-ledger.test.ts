import {it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {confirmCloudflareCharge} from './cloudflare-evaluation-ledger';

it('obtains a current credential for every metadata read while retaining actual billing proof',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'dn-billing-credential-')),prefix=join(directory,'case');
 const payload={id:'chatcmpl-example',model:'gpt-4.1-2025-04-14',usage:{prompt_tokens:12,completion_tokens:4}};
 const log={id:'log-id',provider:'openai',model:'openai/gpt-4.1',success:true,status_code:200,cached:false,wholesale:true,byok:null,tokens_in:12,tokens_out:4,response_head_complete:true,response_head:JSON.stringify({state:'Completed',result:payload}),cost:.000056,custom_cost:false,created_at:'1970-01-01T00:00:00.000Z'};
 writeFileSync(prefix+'-response.json',JSON.stringify({raw:JSON.stringify(payload),headers:{'cf-aig-log-id':'log-id'}}));
 const headers:string[]=[];let credentials=0;
 vi.stubGlobal('fetch',async(url:any,init:any)=>{headers.push(init.headers.authorization);const path=String(url);let result:any;
  if(path.includes('usage-history'))result={history:[{aggregated_value:.000056,start_time:0,end_time:3600}]};
  else if(path.endsWith('/logs/log-id'))result=log;
  else if(path.includes('page=2'))result=[];
  else if(path.includes('/logs?'))result=[log];
  else result=[{id:'default'}];
  return Response.json({success:true,result});
 });
 try{expect(await confirmCloudflareCharge(prefix,async()=>`credential-${++credentials}`,[],.01)).toEqual({costUsd:.000056,gatewayLogId:'log-id'});expect(headers).toEqual([1,2,3,4,5].map(n=>`Bearer credential-${n}`));}
 finally{vi.unstubAllGlobals();for(const suffix of ['-response.json','-billing-observation.json','-billing-proof.json'])if(existsSync(prefix+suffix))unlinkSync(prefix+suffix);rmdirSync(directory)}
});
