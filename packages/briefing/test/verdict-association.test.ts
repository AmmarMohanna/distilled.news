import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

const input={feed:FEED,...WINDOW,articles:[article('shared','Northstar announced a safety review. Northstar separately announced a laboratory opening. These are independent developments reported together.')]};
const drafts=[
  {headline:'Northstar begins safety review',body:'Northstar announced a safety review.',sources:['S1'],relation:'new',importance:1},
  {headline:'Northstar announces laboratory',body:'Northstar separately announced a laboratory opening.',sources:['S1'],relation:'new',importance:2}
];

it('does not accept conflicting duplicate verdicts using the last value',async()=>{
  const mock=scripted({edit:[{items:drafts}],verify:[
    {results:[{i:0,verdict:'fix',issues:['An intentionally conflicting verdict']},{i:0,verdict:'ok'},{i:1,verdict:'ok'}]},
    {results:[{i:0,verdict:'drop',issues:['Rechecked item zero']},{i:1,verdict:'ok'}]}
  ]});
  const result=await generateBriefing(input,mock.port,MODELS);
  expect(result.items.map(i=>i.headline)).toEqual([drafts[1].headline]);
  expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','verify']);
});

it('maps out-of-order ordinary shared-evidence verdicts to the correct item',async()=>{
  const mock=scripted({edit:[{items:drafts}],verify:[{results:[{i:1,verdict:'ok'},{i:0,verdict:'drop',issues:['Test disposition for item zero']}]}]});
  const result=await generateBriefing(input,mock.port,MODELS);
  expect(result.items.map(i=>i.headline)).toEqual([drafts[1].headline]);
  expect(result.items[0].sourceIds).toEqual(['shared']);
  expect(result.dropped[0].headline).toBe(drafts[0].headline);
  expect(mock.calls).toHaveLength(2);
});

it.each([null,'0',false])('does not coerce invalid verdict index %j into approval of item zero',async badIndex=>{
  const mock=scripted({edit:[{items:[drafts[0]]}],verify:[
    {results:[{i:badIndex,verdict:'ok'}]},
    {results:[{i:0,verdict:'drop',issues:['Correctly numbered replacement']}]}]});
  const result=await generateBriefing(input,mock.port,MODELS);
  expect(result.items).toEqual([]);
  expect(mock.calls).toHaveLength(3);
});
