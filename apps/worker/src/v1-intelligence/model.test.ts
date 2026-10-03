import {expect,it} from 'vitest';
import {createStoredEvidenceModel} from './model';
import type {Env} from '../types';
it('uses the existing bounded transport, sends only selected evidence and applies the caller token limit',async()=>{
 let body:any;
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic-test-key'} as Env,async(_,init)=>{
  body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({language:'en',stories:[]})}}],usage:{prompt_tokens:80,completion_tokens:10,cost:.001}}));
 })!;
 const result=await model.synthesize({feed:{id:'f',revision:1,title:'Feed',interests:[],outputLanguage:'en'},selectionId:'s',stories:[]},{maxOutputTokens:321,signal:new AbortController().signal});
 expect(body.max_tokens).toBe(321);expect(body.tools).toBeUndefined();expect(body.messages[1].content).not.toContain('synthetic-test-key');
 expect(result.usage).toEqual({tokensIn:80,tokensOut:10,cost:.001,confirmed:true});
 expect(createStoredEvidenceModel({} as Env)).toBeUndefined();
});
it('grounding submits only offered claims and treats missing provider cost as unconfirmed',async()=>{
 let body:any;
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic'} as Env,async(_,init)=>{
  body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"supportedClaimIds":["c"]}'}}],usage:{prompt_tokens:50,completion_tokens:8}}));
 })!;
 const result=await model.verify!([{id:'c',text:'Supported fact',support:[{evidenceRevisionId:'r',quote:'Supported fact'}],context:[{evidenceRevisionId:'r',text:'Supported fact',truncated:false}]}],{maxOutputTokens:99,signal:new AbortController().signal});
 expect(body.max_tokens).toBe(99);expect(result.supportedClaimIds).toEqual(['c']);expect(result.usage.confirmed).toBe(false);
});
