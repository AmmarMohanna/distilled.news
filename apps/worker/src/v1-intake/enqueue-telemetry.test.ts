import {it,expect} from 'vitest';
import {enqueue} from './intake';
import type {IntakeTransaction} from './transaction';
import type {AcceptedInput,DownstreamJob} from './types';
it('records a wall-clock enqueue proxy in the existing job write without changing identity',()=>{
 let record:DownstreamJob|undefined;
 const tx={write:(_kind:string,_id:string,value:DownstreamJob)=>{record=value;}} as unknown as IntakeTransaction;
 const input={observation:{id:'observation',feedId:'feed',feedSourceId:'source',sourceItemKey:'item'}} as AcceptedInput;
 const before=Date.now();enqueue(tx,input,'ACQUIRE');const after=Date.now();
 expect(record!.id).toBe(JSON.stringify(['ACQUIRE','observation','']));
 expect(Date.parse((record as unknown as {enqueuedAt:string}).enqueuedAt)).toBeGreaterThanOrEqual(before);
 expect(Date.parse((record as unknown as {enqueuedAt:string}).enqueuedAt)).toBeLessThanOrEqual(after);
 expect(record!.state).toBe('PENDING');expect(record!.attempts).toBe(0);
});
