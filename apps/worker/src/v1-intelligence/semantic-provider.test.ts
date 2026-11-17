import {expect,it} from 'vitest';
import {OpenRouterJudgmentClient} from './salience';
import {parseSemanticAnswers} from './semantic-provider';
it('uses documented JEV choice, noul and ordinal score envelopes',async()=>{
 let request:any;
 const client=new OpenRouterJudgmentClient({kind:'JEV',model:'typesafe/jev-1.13',apiKey:'test-only',maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,fetcher:async(_url,options)=>{
  request=JSON.parse(String(options?.body));
  return new Response(JSON.stringify({answers:{relation:{type:'choice',choice:'SAME',confidence:.8,probabilities:{SAME:.9,NEW:.1}},entails:{type:'noul',noul:.9},priority:{type:'score',score:1.8,legend:{'0':'low','1':'medium','2':'high'},confidence:.8,probabilities:{'0':0,'1':.2,'2':.8}}},usage:{input_tokens:20,output_tokens:10,cost:.001}}));
 }});
 const result=await client.decide({text:'untrusted source'},{relation:{kind:'CHOICE',instructions:'Classify',criteria:{SAME:'same',NEW:'new'}},entails:{kind:'BOOLEAN',instructions:'Entails?'},priority:{kind:'SCORE',instructions:'Priority',levels:['low','medium','high']}});
 expect(request.questions.entails.type).toBe('noul');expect(request.questions.priority.criteria).toEqual(['low','medium','high']);
 expect(result.answers.entails).toEqual({kind:'BOOLEAN',probability:.9});expect(result.answers.priority).toMatchObject({kind:'SCORE',value:.9});expect(client.usage().calls).toBe(1);
});
it('rejects out-of-range boolean probabilities and inconsistent ordinal distributions',()=>{
 expect(()=>parseSemanticAnswers({a:{type:'noul',noul:1.1}},{a:{kind:'BOOLEAN',instructions:'entails'}})).toThrow();
 expect(()=>parseSemanticAnswers({a:{type:'score',score:2,confidence:1,probabilities:{'0':1,'1':0,'2':0}}},{a:{kind:'SCORE',instructions:'priority',levels:['low','medium','high']}})).toThrow();
});
