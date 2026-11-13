import {expect,it} from 'vitest';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {SemanticIntent} from './semantic-operations';
import {saveV3Response,recoverV3Response,recoverV3ResponseBilling,ResponseCheckpointPending} from './v3-response-checkpoint';

async function fixture(){
 const objects=new Map<string,string>(),bucket={put:async(key:string,value:string)=>{if(objects.has(key))return null;objects.set(key,value);return {key}},get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null} as unknown as R2Bucket;
 const input={feedId:'private/feed',feedRevision:1,evidenceRevisionIds:['revision-1'],kind:'V3_EDITOR_VERIFIER',policyVersion:'test',model:'openai/gpt-4.1',budgetKey:'v3:window',state:{request:'same exact input'}};
 const intent:SemanticIntent={id:await sha256(canonicalJson(input)),input,feedId:input.feedId,token:'owner-token',leaseUntil:Date.now()+10000,reservedCostUsd:.1,createdAt:new Date().toISOString()};
 const header={provider:'OPENROUTER',model:input.model,stage:'HEADERS' as const,httpStatus:200,generationId:'gen-test-journal'};
 const raw=JSON.stringify({id:header.generationId,choices:[{message:{content:'{"sources":[]}'},finish_reason:'stop'}],usage:{cost:.002,prompt_tokens:100,completion_tokens:20}});
 return {objects,bucket,intent,header,raw};
}
it('recovers exact content and confirmed usage, retaining an immutable checkpoint',async()=>{
 const f=await fixture(),proof=await saveV3Response(f.bucket,f.intent,f.raw,f.header);
 expect(proof.key).toContain('private%2Ffeed');
 const recovered=await recoverV3Response(f.bucket,f.intent);
 expect(recovered).toMatchObject({value:{text:'{"sources":[]}',finishReason:'stop'},usage:{calls:1,costUsd:.002,reported:true},responseCheckpoint:proof});
 await saveV3Response(f.bucket,f.intent,f.raw,f.header);expect(f.objects.size).toBe(1);
 await expect(saveV3Response(f.bucket,f.intent,f.raw+' ',f.header)).rejects.toThrow('CONFLICT');
});
it.each(['token','feedId','inputHash','model','raw'])('rejects a checkpoint with altered %s',async field=>{
 const f=await fixture(),proof=await saveV3Response(f.bucket,f.intent,f.raw,f.header),saved=JSON.parse(f.objects.get(proof.key)!);
 saved[field]+='-tampered';f.objects.set(proof.key,JSON.stringify(saved));
 await expect(recoverV3Response(f.bucket,f.intent)).rejects.toThrow('IDENTITY');
});
it('never recovers output from billing metadata alone',async()=>{
 const f=await fixture();expect(await recoverV3Response(f.bucket,f.intent)).toBeUndefined();
 const raw=JSON.stringify({id:f.header.generationId,usage:{cost:.002,prompt_tokens:100,completion_tokens:20}});
 await saveV3Response(f.bucket,f.intent,raw,f.header);
 await expect(recoverV3Response(f.bucket,f.intent)).rejects.toThrow('INVALID');
 expect(await recoverV3ResponseBilling(f.bucket,f.intent)).toMatchObject({usage:{reported:true,costUsd:.002}});
});
it('yields on temporary R2 unavailability instead of treating the checkpoint as missing',async()=>{
 const f=await fixture();f.bucket.get=async()=>{throw Error('R2 temporarily unavailable')};
 await expect(recoverV3Response(f.bucket,f.intent)).rejects.toBeInstanceOf(ResponseCheckpointPending);
});
it('yields if the R2 object body cannot be read',async()=>{
 const f=await fixture();f.bucket.get=async()=>({text:async()=>{throw Error('R2 body reset')}} as unknown as R2ObjectBody);
 await expect(recoverV3Response(f.bucket,f.intent)).rejects.toBeInstanceOf(ResponseCheckpointPending);
});
