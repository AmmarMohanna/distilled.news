import {expect,it} from 'vitest';
import {batchesBySourceSize} from '../src/engine';
it('batches proof-heavy reader text even when its cited evidence fits, retaining every story and reference',()=>{
 const drafts=Array.from({length:9},(_,i)=>({headline:'Distinct development '+i,body:'A supported factual detail. '.repeat(35),refs:['S'+i]})),byRef=new Map(drafts.map((d,i)=>[d.refs[0],{text:'Complete retained source '+i}]));
 const legacy=batchesBySourceSize(drafts.map((_,i)=>i),drafts as any,byRef as any,64000),current=batchesBySourceSize(drafts.map((_,i)=>i),drafts as any,byRef as any,64000,true);
 expect(legacy).toHaveLength(1);expect(current.length).toBeGreaterThan(1);expect(current.flat()).toEqual(drafts.map((_,i)=>i));expect(new Set(current.flat()).size).toBe(9);
});
it('does not split a reader story or discard an individually large proof',()=>{
 const drafts=[{headline:'One source-supported development',body:'Detail '.repeat(5000),refs:['S1']}],byRef=new Map([['S1',{text:'Complete retained source'}]]);
 expect(batchesBySourceSize([0],drafts as any,byRef as any,64000,true)).toEqual([[0]]);
});
