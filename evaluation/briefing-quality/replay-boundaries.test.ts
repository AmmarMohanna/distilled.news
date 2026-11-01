import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {admit,requestAdmission,budgetPort,MODELS,publishHistory} from './replay';

const request={model:MODELS.editor,system:'Rules',user:'Evidence',maxTokens:100};
const manifest={maxRequestUtf8Bytes:100000,maxCalls:2,maxUsd:1,maxPerCallUsd:.25,maxOutputTokens:4000};
const response={text:'{}',inputTokens:10,outputTokens:2,costUsd:.001};
async function temporary(run:(dir:string)=>Promise<void>) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evaluation-boundary-'));
  try {await run(dir);} finally {fs.rmSync(dir,{recursive:true,force:true});}
}

it('admits the exact evidence length boundary without truncation',()=>{
  const input={articles:[{id:'a',text:'x'.repeat(250000)}]} as any;
  expect(()=>admit(input,1000000)).not.toThrow();
  expect(input.articles[0].text).toHaveLength(250000);
});
it('counts request UTF-8 bytes rather than characters',()=>{
  const value={...request,system:'',user:'خبر'};
  const bytes=Buffer.byteLength(value.user);
  expect(requestAdmission(value,bytes).bytes).toBe(bytes);
  expect(()=>requestAdmission(value,bytes-1)).toThrow('FULL_REQUEST_LIMIT');
});
it.each([NaN,Infinity,-1,0])('rejects an invalid request limit: %s',limit=>{
  expect(()=>requestAdmission(request,limit)).toThrow('INVALID_REQUEST_LIMIT');
});
it.each([NaN,Infinity,-1,0,1.5])('rejects invalid maximum output tokens: %s',maxTokens=>{
  expect(()=>requestAdmission({...request,maxTokens},100000)).toThrow('INVALID_OUTPUT_TOKENS');
});
it('refuses an unexpected model before sending',()=>{
  expect(()=>requestAdmission({...request,model:'unapproved/model'},100000)).toThrow('MODEL_ROUTE_NOT_ALLOWED');
});
it.each(['maxCalls','maxUsd','maxPerCallUsd','maxOutputTokens','maxRequestUtf8Bytes'])('refuses a nonfinite budget field: %s',field=>{
  expect(()=>budgetPort({...manifest,[field]:NaN},os.tmpdir(),async()=>response)).toThrow('INVALID_BUDGET');
});
it('serializes concurrent calls before enforcing the call ceiling',async()=>temporary(async dir=>{
  let sends=0;
  const port=budgetPort({...manifest,maxCalls:1},dir,async()=>{sends++;return response;});
  const results=await Promise.allSettled([port.complete(request),port.complete(request)]);
  await port.drain();
  expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected']);
  expect(sends).toBe(1);
  const ledger=fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  expect(ledger.map(row=>row.state)).toEqual(['RESERVED','SETTLED']);
}));
it('persists the reservation before the provider is called',async()=>temporary(async dir=>{
  const port=budgetPort(manifest,dir,async()=>{
    expect(JSON.parse(fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim()).state).toBe('RESERVED');
    expect(fs.existsSync(path.join(dir,'request-1.json'))).toBe(true);
    return response;
  });
  await port.complete(request);
}));
it.each([{inputTokens:-1},{outputTokens:1.5},{costUsd:NaN},{costUsd:-1}])('holds unknown usage and prevents another send: %j',async bad=>temporary(async dir=>{
  let sends=0;
  const port=budgetPort(manifest,dir,async()=>{sends++;return {...response,...bad};});
  await expect(port.complete(request)).rejects.toThrow('USAGE_UNKNOWN');
  await expect(port.complete(request)).rejects.toThrow('RUN_FENCED');
  expect(sends).toBe(1);
  const journal=fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8');
  expect(journal).toContain('UNKNOWN_OR_TERMINAL_FAILURE');
  expect(journal).not.toContain('SETTLED');
}));
it('retains actual over-reservation costs and fences further sends',async()=>temporary(async dir=>{
  const port=budgetPort(manifest,dir,async()=>({...response,costUsd:.5}));
  await expect(port.complete(request)).rejects.toThrow('PROVIDER_COST_EXCEEDED_RESERVATION');
  await expect(port.complete(request)).rejects.toThrow('RUN_FENCED');
  expect(fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8')).toContain('"costUsd":0.5');
}));
it('publishing history preserves earlier prose and never mutates caller arrays',()=>{
  const prior=[{id:'old',at:'2026-10-01T00:00:00Z',headline:'Prior',body:'Exact earlier wording'}];
  const items=[{headline:'New',body:'New wording',sourceIds:['a']}] as any;
  const history=publishHistory(prior,items,'published','v3','case','2026-10-02T00:00:00Z');
  expect(prior).toHaveLength(1);expect(history).toHaveLength(2);
  expect(history[0].body).toBe('Exact earlier wording');expect(history[1].id).toBe('v3:case:0');
});
