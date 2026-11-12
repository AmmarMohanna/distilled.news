import {describe,it,expect} from 'vitest';
import {sourceRead,failureDetails} from './worker/src/failures';
describe('evaluator read failures',()=>{
 it('classifies a SOURCE_DB reset without retaining private error text',async()=>{
  const error=Object.assign(new Error('D1_ERROR: private query: Database reset because its code was updated. [code: 7429]'),{cause:new Error('private evidence')});
  const failure=await sourceRead(async()=>{throw error}).catch(e=>e);
  expect(failure.message).toBe('SOURCE_DB_TRANSIENT_FAILURE');
  expect(failureDetails(failure)).toEqual({code:'SOURCE_DB_TRANSIENT_FAILURE',type:'Error',causeType:'Error',providerCode:'7429'});
  expect(JSON.stringify(failureDetails(failure))).not.toContain('private');
 });
 it.each([false,true])('classifies an explicit D1 CPU reset at the source boundary (nested=%s)',async nested=>{
  const reset=new Error('D1_ERROR: D1 DB exceeded its CPU time limit and was reset.');
  const error=nested?new Error('D1 query failed',{cause:reset}):reset;
  const failure=await sourceRead(async()=>{throw error}).catch(e=>e);
  expect(failure.message).toBe('SOURCE_DB_TRANSIENT_FAILURE');
  expect(failureDetails(failure).providerCode).toBeNull();
 });
 it('does not retry semantic errors or generic D1 query errors',async()=>{
  for(const message of ['FABRICATED_OR_FOREIGN_EVIDENCE','D1_ERROR: no such table: private','unrelated network error']){
   const failure=new Error(message);await expect(sourceRead(async()=>{throw failure})).rejects.toBe(failure);
  }
 });
});
