import {it,expect} from 'vitest';
import {boundedSettledMap,inferenceConcurrency} from './parallel-inference';

it('bounds active work, drains failures, and collects in input order',async()=>{
 let active=0,peak=0;const finished:number[]=[];
 const results=await boundedSettledMap([30,5,10,1],2,async(ms,i)=>{
  active++;peak=Math.max(peak,active);
  try{await new Promise(r=>setTimeout(r,ms));finished.push(i);if(i===1)throw Error('uncertain');return i}
  finally{active--}
 });
 expect(peak).toBe(2);expect(active).toBe(0);expect(finished[0]).toBe(1);
 expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected','fulfilled','fulfilled']);
 expect(results[2]).toEqual({status:'fulfilled',value:2});
});
it('allows serial baseline and rejects unsafe limits',async()=>{
 expect(inferenceConcurrency()).toBe(2);expect(inferenceConcurrency('3')).toBe(3);
 for(const value of ['0','4','Infinity','2.5',''])expect(()=>inferenceConcurrency(value)).toThrow();
 let calls=0;await expect(boundedSettledMap([1],100,async()=>calls++)).rejects.toThrow();expect(calls).toBe(0);
 expect(await boundedSettledMap([],1,async()=>1)).toEqual([]);
});
