import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

// Scripted replies check transport/repair mechanics, NOT model semantic quality.
const sources=[article('qantara','A large explosion was reported in Qantara, southern Lebanon. The channel attributed it to an Israeli operation.'),article('karak','A video posted online shows what the channel describes as an attack on a church in Karak.')];
const items=[
  {headline:'Large explosion reported in Qantara',body:'A large explosion was reported in Qantara, southern Lebanon, attributed to an Israeli operation.',sources:['S2'],relation:'new',updates:null,importance:1},
  {headline:'Video appears to show attack on church in Karak',body:'A video appears to show an attack on a church in Karak.',sources:['S1'],relation:'new',updates:null,importance:2}
];
it('delivers concise items unchanged with their source ownership and no extra calls',async()=>{
  const mock=scripted({edit:[{items}],verify:[{results:items.map((_,i)=>({i,verdict:'ok',issues:[]}))}]});
  const result=await generateBriefing({feed:FEED,...WINDOW,articles:sources},mock.port,MODELS);
  expect(result.status).toBe('published');
  expect(result.items.map(i=>i.body)).toEqual(items.map(i=>i.body));
  expect(result.items.map(i=>i.sourceIds)).toEqual([['qantara'],['karak']]);
  expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify']);
});
it('still routes strengthened responsibility through targeted repair and recheck',async()=>{
  const mock=scripted({edit:[{items:[{...items[0],body:'Israel caused the explosion in Qantara. No one was injured.'}]}],verify:[{results:[{i:0,verdict:'fix',issues:['Responsibility is attributed, not established; the source does not say no one was injured.']}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:items[0].headline,body:items[0].body,drop:false}]}]});
  const result=await generateBriefing({feed:FEED,...WINDOW,articles:sources},mock.port,MODELS);
  expect(result.status).toBe('published');
  expect(result.items[0].body).toBe(items[0].body);
  expect(result.items[0].sourceIds).toEqual(['qantara']);
  expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});
