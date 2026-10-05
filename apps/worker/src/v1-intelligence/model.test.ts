import {expect,it} from 'vitest';
import {createStoredEvidenceModel} from './model';
import type {Env} from '../types';
it('constrains short writer identities and maps exact durable candidate/support references back',async()=>{
 const candidateId='["immutable-selection-hash","EVENT","event-version"]';let offered:any,unknown=false;
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic'} as Env,async(_,init)=>{
  offered=JSON.parse(String(init?.body));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({language:'en',stories:[{storyId:unknown?'unoffered':'story_1',claims:[{text:'Approved fact',supportIds:['span_1_1'],communicatedFactIds:['fact_1_1']}]}]})}}],usage:{prompt_tokens:80,completion_tokens:10,cost:.001}}));
 })!;
 const input={feed:{id:'f',revision:1,title:'Feed',interests:[],outputLanguage:'en'},selectionId:'s',stories:[{candidate:{id:candidateId,targetType:'EVENT' as const,targetVersionId:'event-version'},approvedFacts:[{id:'fact',text:'Approved fact',support:[{evidenceRevisionId:'exact-revision',quote:'Approved fact'}]}],evidence:[{id:'exact-revision',body:'Approved fact',language:'en'}]}]};
 const limits={maxOutputTokens:321,signal:new AbortController().signal},result=await model.synthesize(input,limits);
 expect(JSON.parse(offered.messages[1].content).input.stories[0].storyId).toBe('story_1');
 expect(offered.response_format.json_schema.schema.properties.stories.items.properties.storyId.enum).toEqual(['story_1']);
 expect(model.synthesisPayload!(input)).toEqual({payload:JSON.parse(offered.messages[1].content),schema:offered.response_format.json_schema.schema});
 expect(result.draft.stories[0]).toMatchObject({candidateId,claims:[{support:[{evidenceRevisionId:'exact-revision',quote:'Approved fact'}]}]});
 unknown=true;await expect(model.synthesize(input,limits)).rejects.toThrow('UNRECOGNIZED_WRITER_ID');
});
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
  body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"supportedClaimIds":["claim_1"]}'}}],usage:{prompt_tokens:50,completion_tokens:8}}));
 })!;
 const result=await model.verify!([{id:'c',text:'Supported fact',support:[{evidenceRevisionId:'r',quote:'Supported fact'}],context:[{evidenceRevisionId:'r',text:'Supported fact',truncated:false}]}],{maxOutputTokens:99,signal:new AbortController().signal});
 expect(body.max_tokens).toBe(99);expect(result.supportedClaimIds).toEqual(['c']);expect(result.usage.confirmed).toBe(false);
});
it('settles invalid source-only coverage as a negative verdict with confirmed usage',async()=>{
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic'} as Env,async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Copied source incorrectly.',readerSpans:[{claimId:'claim_1',text:'The minister resigned.'}]}]})}}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}})))!;
 const result=await model.verify!([{id:'c',candidateId:'story',text:'Unrelated prose.',support:[{evidenceRevisionId:'r',quote:'The minister resigned.'}],context:[],requiredFacts:[{id:'f',text:'The minister resigned.',evidenceRevisionIds:['r']}]}],{maxOutputTokens:200,signal:new AbortController().signal});
 expect(result.preservedFactIds).toEqual([]);expect(result.semanticChecks?.[0].communicated).toBe(false);
 expect(result.usage).toEqual({tokensIn:100,tokensOut:50,cost:.001,confirmed:true});
});
