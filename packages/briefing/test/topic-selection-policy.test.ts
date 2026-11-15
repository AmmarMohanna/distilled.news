import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {editorUser} from '../src/prompts';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';
import type {ModelRequest} from '../src/model';
const policy='reader-topic-boundaries-v1' as const;
const science=article('wildfire','A published environmental study measured wildfire activity during lockdowns. Satellite observations were used to count fire detections. No computing product or AI company development was reported.');

it('preserves editor request text and never adds a topic operation to unmarked frozen inputs',async()=>{
 const base={feed:FEED,articles:[],prior:[],...WINDOW,promptVersion:4 as const};
 expect(editorUser({...base,feed:{...FEED,topicSelectionPolicy:policy}})).toBe(editorUser(base));
 const model=scripted({edit:[{items:[]}]});
 await generateBriefing({feed:FEED,...WINDOW,articles:[science]},model.port,MODELS);
 expect(model.calls.map(c=>c.stage)).toEqual(['edit']);
});
it('excludes unrelated sources before editing while retaining a decision for every source',async()=>{
 const model=scripted({topic:[(request:ModelRequest)=>{
  expect(request.model).toBe(MODELS.verifier);
  const input=JSON.parse(request.user);expect(input.interest).toBe(FEED.interest);expect(input.articles[0].text).toBe(science.text);
  return {results:[{id:input.articles[0].id,relation:'none',reason:'The development is an environmental finding, not a computing or AI-company development.'}]};
 }]});
 const result=await generateBriefing({feed:{...FEED,topicSelectionPolicy:policy},...WINDOW,articles:[science]},model.port,MODELS,{editorAccountingPolicy:'complete-source-decisions-v2'});
 expect(result.status).toBe('empty');expect(result.items).toEqual([]);
 expect(result.omitted).toEqual([expect.objectContaining({sourceIds:['wildfire'],reason:expect.stringContaining('Off-topic:')})]);
 expect(result.sourceDecisions?.[0].outcomes).toEqual([expect.objectContaining({decision:'omitted'})]);
 expect(model.calls.map(c=>c.stage)).toEqual(['topic']);
});
it('retains relevant Arabic regional news and uses the existing editor and factual verifier',async()=>{
 const model=scripted({topic:[{results:[{id:'S1',relation:'direct',reason:'The security development is in the requested Middle East region.'}]}],edit:[{items:[{headline:'البحرين تعلن اعتراض طائرات مسيرة',body:'أعلنت السلطات في البحرين اعتراض طائرات مسيرة استهدفت قاعدة عسكرية.',sources:['S1'],relation:'new',importance:1}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:{interest:'السياسة في الشرق الأوسط',language:'ar',windowMinutes:30,topicSelectionPolicy:policy},...WINDOW,articles:[article('bahrain','Bahrain authorities said they intercepted drones targeting a military base. The statement was issued by the foreign ministry and concerns security developments in Bahrain.')]},model.port,MODELS);
 expect(result.status).toBe('published');expect(result.items[0].sourceIds).toEqual(['bahrain']);
 expect(model.calls.map(c=>c.stage)).toEqual(['topic','edit','verify']);
});
it('defers uncertain relevance without publishing or silently consuming the source',async()=>{
 const model=scripted({topic:[{results:[{id:'S1',relation:'uncertain',reason:'The supplied text does not establish the requested connection.'}]}]});
 const result=await generateBriefing({feed:{...FEED,topicSelectionPolicy:policy},...WINDOW,articles:[science]},model.port,MODELS);
 expect(result.status).toBe('rejected');expect(result.items).toEqual([]);expect(result.dropped[0]).toMatchObject({sourceIds:['wildfire'],carry:true});
});
it('rejects an incomplete topic response rather than passing unchecked sources to the editor',async()=>{
 const model=scripted({topic:[{results:[]},{results:[]}]});
 await expect(generateBriefing({feed:{...FEED,topicSelectionPolicy:policy},...WINDOW,articles:[science]},model.port,MODELS)).rejects.toThrow();
 expect(model.calls.every(c=>c.stage==='topic')).toBe(true);
});
