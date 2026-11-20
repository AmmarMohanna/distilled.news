import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,WINDOW} from './helpers';
const input={feed:{...FEED,interest:'New AI coding tools and infrastructure research'},...WINDOW,articles:[article('a','A new coding model is available in a developer tool today.'),article('b','Researchers released a dataset describing compute concentration today.')]};
const options={editorSelectionPolicy:'preserve-selected-developments-v1' as any,maxEditorChars:1,prepare:{nearDuplicate:1.01}};
function port(reject=false){return {complete:async(q:any)=>{let raw:any;
 if(q.system.startsWith('You are the editor')){const ref=q.user.match(/\[(S\d+)\]/)[1];raw={items:[{headline:ref==='S1'?'New coding model released':'Compute concentration dataset released',body:'',sources:[ref],relation:'new',updates:null,importance:2}]};}
 else if(q.system.startsWith('You are the senior editor'))raw={items:[{from:[0],headline:'New coding model released',body:'',relation:'new',updates:null,importance:2}],cut:[{from:[1],why:'background dataset, less urgent'}]};
 else{const indices=[...q.user.matchAll(/^#(\d+) \[/gm)].map(m=>Number(m[1]));raw={results:indices.map(i=>({i,verdict:reject?'drop':'ok',issues:reject?['Not established by the evidence']:[]}))};}
 return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
}}}
it('does not let consolidation silently replace the editor selection with a narrower importance threshold',async()=>{
 const r=await generateBriefing(input,port(),MODELS,options);expect(r.items).toHaveLength(2);expect(r.items.flatMap(i=>i.sourceIds).sort()).toEqual(['a','b']);expect(r.omitted).toEqual([]);
});
it('keeps the original consolidation behavior for previously frozen windows',async()=>{
 const r=await generateBriefing(input,port(),MODELS,{...options,editorSelectionPolicy:undefined});expect(r.items).toHaveLength(1);expect(r.omitted[0].stage).toBe('consolidation');
});
it('still requires factual verification of every restored draft',async()=>{
 const r=await generateBriefing(input,port(true),MODELS,options);expect(r.items).toEqual([]);expect(r.dropped.flatMap(d=>d.sourceIds).sort()).toEqual(['a','b']);
});
