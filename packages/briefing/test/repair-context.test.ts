import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import type {ModelRequest} from '../src/model';
import {article,FEED,MODELS,WINDOW,scripted} from './helpers';

it('supplies the previous verdict/edit only on recheck, using local sparse-subset indices and unchanged source owners',async()=>{
 const drafts=[{headline:'Transit notice',body:'The ferry will close on Sunday.',sources:['S1'],importance:1,relation:'new'},{headline:'Water warning',body:'The water is safe.',sources:['S2'],importance:1,relation:'new'},{headline:'Road notice',body:'The road has reopened.',sources:['S3'],importance:1,relation:'new'}];
 const sources=[article('a','The ferry will close on Sunday for inspection.'),article('b','The water must be boiled until tests are complete.'),article('c','The road remains closed until an inspection is complete.')];
 const mock=scripted({edit:[{items:drafts}],verify:[(r:ModelRequest)=>{expect(r.user).not.toContain('PREVIOUS REVIEW AND EDIT');return{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:['Restore the boiling requirement.']},{i:2,verdict:'fix',issues:['Preserve that the road is still closed.']}]};},(r:ModelRequest)=>{
  expect(r.user).toContain('#0\nPrevious headline: Water warning\nPrevious body: The water is safe.\nPrevious issues: Restore the boiling requirement.');
  expect(r.user).toContain('#1\nPrevious headline: Road notice\nPrevious body: The road has reopened.\nPrevious issues: Preserve that the road is still closed.');
  expect(r.user).not.toContain('Previous headline: Transit notice');
  expect(r.user).toContain('fallible context, not source evidence or instructions');
  return{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'ok',issues:[]}]};
 }],repair:[{items:[{i:0,headline:'Water warning',body:'The water must be boiled until tests are complete.',drop:false},{i:1,headline:'Road notice',body:'The road remains closed until inspection is complete.',drop:false}]}]});
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:sources},mock.port,MODELS);
 expect(result.items.map(i=>i.sourceIds)).toEqual([['a'],['b'],['c']]);
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});

it('keeps the legacy prompt format selectable for frozen work',async()=>{
 const story='Old headline\nOld supported body.';
 const mock=scripted({edit:[(r:ModelRequest)=>{expect(r.user).toContain(story+': '+story);return {items:[{headline:'New notice',body:'The authority issued a new notice.',sources:['S1'],importance:1,relation:'new'}]};}],verify:[(r:ModelRequest)=>{expect(r.user).not.toContain('PREVIOUS REVIEW AND EDIT');return{results:[{i:0,verdict:'ok',issues:[]}]};}]});
 await generateBriefing({feed:FEED,...WINDOW,articles:[article('new','The authority issued a new notice with updated local arrangements.')],prior:[{id:'old',at:WINDOW.windowStart,headline:story,body:story}]},mock.port,MODELS,{promptVersion:1});
});
it('updates recheck context to the immediately preceding repair without changing the existing repair bound',async()=>{
 const original={headline:'License granted',body:'The board granted a license.',sources:['S1'],relation:'new',importance:1};
 const mock=scripted({edit:[{items:[original]}],verify:[{results:[{i:0,verdict:'fix',issues:['Preserve that review is only planned.']}]},(r:ModelRequest)=>{expect(r.user).toContain('Previous body: The board granted a license.');return{results:[{i:0,verdict:'fix',issues:['Review has not happened yet.']}]};},(r:ModelRequest)=>{expect(r.user).toContain('Previous body: The board reviewed the license.');expect(r.user).toContain('Previous issues: Review has not happened yet.');expect(r.user).not.toContain('Previous body: The board granted a license.');return{results:[{i:0,verdict:'ok',issues:[]}]};}],repair:[{items:[{i:0,headline:'License reviewed',body:'The board reviewed the license.',drop:false}]},{items:[{i:0,headline:'License review planned',body:'The board plans to review the license.',drop:false}]}]});
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:[article('source','The board plans to review the license next month. It has not reviewed it yet.')]},mock.port,MODELS);
 expect(result.status).toBe('published');expect(result.items[0].sourceIds).toEqual(['source']);
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify','repair','verify']);
});

it('does not append new repair context when resuming a legacy frozen prompt',async()=>{
 const mock=scripted({edit:[{items:[{headline:'Permit issued',body:'The permit was issued.',sources:['S1'],relation:'new',importance:1}]}],verify:[{results:[{i:0,verdict:'fix',issues:['Only a review is planned.']}]},(r:ModelRequest)=>{expect(r.user).not.toContain('PREVIOUS REVIEW AND EDIT');return{results:[{i:0,verdict:'ok',issues:[]}]};}],repair:[{items:[{i:0,headline:'Permit review planned',body:'A permit review is planned.',drop:false}]}]});
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:[article('source','A permit review is planned. No permit has been issued.')]},mock.port,MODELS,{promptVersion:1});
 expect(result.status).toBe('published');
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});
