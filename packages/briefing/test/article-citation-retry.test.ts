import {describe,it,expect} from 'vitest';
import {generateBriefing} from '../src/engine';
import {FEED,FUND,MODELS,WINDOW,article,scripted} from './helpers';
const input={feed:FEED,...WINDOW,articles:[article('a1',FUND)]};
const valid={headline:'Fund proposed subject to approval',body:'',sources:['S1'],relation:'new',importance:1};
describe('invalid selected article citations',()=>{
 it.each([{refs:['publisher-1']},{refs:['S99']},{refs:[]},{refs:['S1','publisher-1']}])('corrects unusable citations  instead of silently publishing partial/empty output',async ({refs})=>{
  const {port,calls}=scripted({edit:[{items:[{...valid,sources:refs}]},{items:[valid]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
  const result=await generateBriefing(input,port,MODELS);
  expect(result.status).toBe('published');expect(result.items[0].sourceIds).toEqual(['a1']);
  expect(calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);
  expect(calls[1].request.user).toContain('INVALID_ARTICLE_CITATIONS');expect(calls[1].request.user).toContain('never publisher IDs');
  expect(calls[1].request.user).not.toBe(calls[0].request.user);expect(result.usage.calls).toBe(3);
 });
 it('does not silently drop a bad item beside a valid one',async()=>{
  const {port,calls}=scripted({edit:[{items:[valid,{...valid,sources:['publisher-1']}]},{items:[valid]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
  expect((await generateBriefing(input,port,MODELS)).status).toBe('published');expect(calls.map(c=>c.stage)).toEqual(['edit','edit','verify']);
 });
 it('stops after the one existing corrective attempt, without verification or an empty-success result',async()=>{
  const invalid={items:[{...valid,sources:['publisher-1']}]};const {port,calls}=scripted({edit:[invalid,invalid]});
  await expect(generateBriefing(input,port,MODELS)).rejects.toThrow('INVALID_ARTICLE_CITATIONS');expect(calls.map(c=>c.stage)).toEqual(['edit','edit']);
 });
 it('keeps a genuine empty editor selection valid with no correction call',async()=>{
  const {port,calls}=scripted({edit:[{items:[]}]});expect((await generateBriefing(input,port,MODELS)).status).toBe('empty');expect(calls).toHaveLength(1);
 });
});

import retainedCitationFailure from './fixtures/v3-invalid-publisher-citations.json';
it('replays the exact retained Arabic selected items as a citation error, never an empty editorial decision',async()=>{
 const {port,calls}=scripted({edit:[retainedCitationFailure.response,retainedCitationFailure.response]});
 await expect(generateBriefing(input,port,MODELS)).rejects.toThrow('INVALID_ARTICLE_CITATIONS');expect(calls).toHaveLength(2);
});
