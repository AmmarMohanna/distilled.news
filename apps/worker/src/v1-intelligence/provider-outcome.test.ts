import {it,expect} from 'vitest';
import {createStrongSemanticModel} from './semantic-model';
import type {Env} from '../types';
const env={OPENROUTER_API_KEY:'private-fixture-secret',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env;
it('retains bounded schema rejection evidence and settles only an explicit nonexecuted rejection',async()=>{
 const model=createStrongSemanticModel(env,(async()=>Response.json({error:{code:'invalid_json_schema',type:'invalid_request_error',message:'Invalid enum count; private-fixture-secret'}},{status:400,headers:{'x-request-id':'req-proof'}})) as typeof fetch)!;
 const error=await model.complete('f','COMPARATIVE_EDITORIAL_PLAN',{},{type:'object',properties:{},required:[],additionalProperties:false}).catch(e=>e);
 expect(error.providerDiagnostic).toMatchObject({httpStatus:400,code:'invalid_json_schema',requestId:'req-proof',execution:'REJECTED_BEFORE_EXECUTION'});
 expect(JSON.stringify(error.providerDiagnostic)).not.toContain(env.OPENROUTER_API_KEY);expect(model.usage()).toMatchObject({calls:1,costUsd:0,reported:true});
});
it('generic HTTP400 cannot release an UNKNOWN exposure',async()=>{
 const model=createStrongSemanticModel(env,(async()=>Response.json({error:{code:400,message:'Provider rejected request'}},{status:400})) as typeof fetch)!;
 const error=await model.complete('f','COMPARATIVE_EDITORIAL_PLAN',{},{type:'object',properties:{},required:[],additionalProperties:false}).catch(e=>e);
 expect(error.providerDiagnostic).toMatchObject({httpStatus:400,execution:'UNKNOWN'});expect(model.usage().reported).toBe(false);
});
it('known usage wins over rejection classification',async()=>{
 const model=createStrongSemanticModel(env,(async()=>Response.json({error:{code:'invalid_json_schema',message:'bad schema'},usage:{cost:.01,prompt_tokens:30}},{status:400})) as typeof fetch)!;
 const error=await model.complete('f','COMPARATIVE_EDITORIAL_PLAN',{},{type:'object',properties:{},required:[],additionalProperties:false}).catch(e=>e);
 expect(error.providerDiagnostic.execution).toBe('COMPLETED_WITH_KNOWN_USAGE');expect(model.usage()).toMatchObject({costUsd:.01,reported:true});
});
it('transport loss remains UNKNOWN',async()=>{
 const model=createStrongSemanticModel(env,(async()=>{throw new DOMException('network lost','AbortError')}) as typeof fetch)!;
 await expect(model.complete('f','COMPARATIVE_EDITORIAL_PLAN',{},{type:'object',properties:{},required:[],additionalProperties:false})).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');expect(model.usage().reported).toBe(false);
});

it('alternate judgment transport retains provider evidence and known usage',async()=>{
 const {OpenRouterJudgmentClient}=await import('./salience');
 const client=new OpenRouterJudgmentClient({kind:'GPT',apiKey:'secret-fixture',model:'openai/gpt-4.1-mini',maxCalls:1,maxCostUsd:.1,maxCallCostUsd:.02,fetcher:(async()=>Response.json({error:{code:'invalid_json_schema',type:'invalid_request_error',message:'Bad schema'}},{status:400,headers:{'x-request-id':'req-choice'}})) as typeof fetch});
 const error=await client.choose({},'Choose supported relation',{YES:'supported',NO:'unsupported'}).catch(e=>e);
 expect(error.providerDiagnostic).toMatchObject({httpStatus:400,execution:'REJECTED_BEFORE_EXECUTION',requestId:'req-choice'});expect(client.usage()).toMatchObject({calls:1,costUsd:0,reported:true});
});
