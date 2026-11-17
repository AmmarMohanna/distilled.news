import {expect,it,vi} from 'vitest';
import {readAssessmentArticles} from './source-assessment-http';
import {assessSource} from './source-assessment';
import type {Env} from './types';
const url='https://publisher.example/';
const body='Georges Khabbaz discusses his new film, theater performances and television projects in a substantive interview. '.repeat(3);
const setup=(reply:(url:string)=>Record<string,unknown>)=>{
 const service=vi.fn(async(_target:unknown,init:RequestInit)=>{
  const request=JSON.parse(init.body as string);expect(request.kind).toBe('public_article');
  return Response.json(reply(request.input.url));
 });
 const env={SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3)} as unknown as Env;
 return {env,service};
};
it('reads a blocked publisher through the existing anonymous route without promoting its listing',async()=>{
 const {env,service}=setup(target=>target===url?{status:200,url:target,pageKind:'listing',body:'Listing text must not become evidence.',articleLinks:['https://foreign.example/story','https://127.0.0.1/private',url+'one',url+'two',url+'three']}:{status:200,url:target,pageKind:'article',body});
 expect(await readAssessmentArticles(env,url)).toEqual([{url:url+'one',body},{url:url+'two',body}]);
 expect(service).toHaveBeenCalledTimes(3);
});
it.each([{status:403},{status:200,url:'https://foreign.example/',pageKind:'article',body},{status:200,url,pageKind:'article',body,authenticationRequired:true},{status:200,url,pageKind:'article',body,accessRestricted:true}])('does not treat an inaccessible or different identity as verified evidence (%j)',async reply=>{
 const {env,service}=setup(()=>reply);
 expect(await readAssessmentArticles(env,url)).toEqual([]);expect(service).toHaveBeenCalledTimes(1);
});
it.each(['YES','NO'] as const)('retains the independent relevance audit after anonymous fallback succeeds (%s)',async verdict=>{
 const {env,service}=setup(target=>({status:200,url:target,pageKind:'article',body}));
 const fetcher=vi.fn<typeof fetch>(async(target,init)=>{
  if(!String(target).includes('openrouter.ai'))return new Response('Blocked',{status:403});
  const state=JSON.parse(JSON.parse(init!.body as string).messages[1].content);
  return Response.json({choices:[{message:{content:JSON.stringify(state.passage?{exactTopic:verdict,reason:'Selected-passage verdict.'}:{realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'NO',concern:'NO',reason:'Related interview.',evidenceId:'E1'})}}]});
 });
 const result=await assessSource({...env,SOURCE_CONNECTORS_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'}, {title:'Georges Khabbaz',description:'Films and theater'},url,fetcher);
 expect(result.status).toBe(verdict==='YES'?'accepted':'rejected');
 expect(service).toHaveBeenCalledTimes(1);
});
