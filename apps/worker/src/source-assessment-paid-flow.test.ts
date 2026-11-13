import {expect,it,vi} from 'vitest';
import {assessSource} from './source-assessment';
import {paidAssessmentArticles} from './source-assessment-paid';
import type {Env} from './types';
vi.mock('./source-assessment-paid',()=>({paidAssessmentAvailable:()=>true,paidAssessmentArticles:vi.fn(async()=>[{url:'https://lovin.co/beirut/en/interview/',title:'Georges Khabbaz interview',body:'Georges Khabbaz discusses his latest film and theater productions in an interview about his career and current entertainment projects.'}])}));
const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true',OPENROUTER_API_KEY:'test',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'} as Env;
it('offers but never invokes paid retrieval during an ordinary blocked source check',async()=>{
 vi.mocked(paidAssessmentArticles).mockClear();
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('Blocked',{status:403}));
 expect(await assessSource(env,{title:'Georges Khabbaz',description:'Film and theater'},'https://lovin.co/',fetcher,{ownerAccountId:'owner'})).toMatchObject({status:'unverified',freeAccessUnavailable:true});
 expect(paidAssessmentArticles).not.toHaveBeenCalled();
});
it('uses explicit paid retrieval without repeating known-failing public requests and still audits relevance',async()=>{
 vi.mocked(paidAssessmentArticles).mockClear();
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
  const state=JSON.parse(JSON.parse(init!.body as string).messages[1].content);
  return Response.json({choices:[{message:{content:JSON.stringify(state.passage?{exactTopic:'YES',reason:'The interview covers his film and theater projects.'}:{realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'NO',concern:'NO',evidenceId:'E1',reason:'Relevant interview.'})}}]});
 });
 expect(await assessSource(env,{title:'Georges Khabbaz',description:'Film and theater'},'https://lovin.co/',fetcher,{ownerAccountId:'owner'},undefined,{approvedRetrievalBudgetUsd:0.10})).toMatchObject({status:'accepted',evidenceUrl:'https://lovin.co/beirut/en/interview/'});
 expect(paidAssessmentArticles).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
});
