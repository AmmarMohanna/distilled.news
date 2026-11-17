import {it,expect} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {admittedSourceExecution} from './source-execution-admission';

it('admits two helper streams, defers a third, and releases only on completion/cancellation',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  let calls=0;
  const run=async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([65]));}}));};
  const first=await admittedSourceExecution(ctx.db,run),second=await admittedSourceExecution(ctx.db,run);
  await expect(admittedSourceExecution(ctx.db,run)).rejects.toMatchObject({code:'BACKPRESSURE',diagnostic:{detail:'HELPER_LOCAL_CAPACITY_BUSY'}});
  expect(calls).toBe(2);
  await first.body!.cancel();
  const third=await admittedSourceExecution(ctx.db,async()=>new Response('done'));
  expect(await third.text()).toBe('done');await second.body!.cancel();
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM source_execution_slots WHERE lease_until>0').first()).toEqual({n:0});
 }finally{await ctx.dispose();}
},60000);
it('recovers expired transport capacity and releases failed requests without touching jobs',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  await ctx.db.prepare('INSERT INTO source_execution_slots VALUES(0,?,?)').bind('expired',1).run();
  await expect(admittedSourceExecution(ctx.db,async()=>{throw Error('transport failed');},()=>2)).rejects.toThrow('transport failed');
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM source_execution_slots WHERE lease_until>0').first()).toEqual({n:0});
 }finally{await ctx.dispose();}
},60000);
it('a late response cannot release a replacement transport lease',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  let at=1;const open=()=>admittedSourceExecution(ctx.db,async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([65]));}})),()=>at);
  const old=await open();at=90002;const replacement=await open(),other=await open();
  await old.body!.cancel();await expect(open()).rejects.toMatchObject({code:'BACKPRESSURE'});
  await replacement.body!.cancel();await other.body!.cancel();
 }finally{await ctx.dispose();}
},60000);
