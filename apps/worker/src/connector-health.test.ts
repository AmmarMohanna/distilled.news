import {expect,it} from 'vitest';
import {connectorOperationalAlerts} from './connector-health';
it('clears credential and budget warnings after a later accepted batch',()=>{
 for(const failure of ['AUTH_REQUIRED','BUDGET_EXCEEDED']){
  expect(connectorOperationalAlerts({nextRunAt:null,failure:{failure,sequence:3},acceptedSequence:2})).toEqual([{code:failure,severity:'error'}]);
  expect(connectorOperationalAlerts({nextRunAt:null,failure:{failure,sequence:3},acceptedSequence:4})).toEqual([]);
 }
});
it('keeps potentially billed historical calls visible after a later successful poll',()=>{
 expect(connectorOperationalAlerts({nextRunAt:null,acceptedSequence:10,uncertainPaidAttempts:1})).toEqual([{code:'PAID_RECONCILIATION_REQUIRED',severity:'warning'}]);
});
it('reports blocked jobs and overdue backlog without warning about future work',()=>{
 const now=new Date('2026-10-10T12:00:00Z');
 expect(connectorOperationalAlerts({job:{state:'BLOCKED',lastError:'BOUNDED_LIMIT'},nextRunAt:'2026-10-10T11:00:00Z',acceptedSequence:0},now)).toEqual([{code:'SOURCE_BLOCKED',severity:'error'},{code:'POLL_BACKLOG_OVERDUE',severity:'warning'}]);
 expect(connectorOperationalAlerts({nextRunAt:'2026-10-10T12:05:00Z',acceptedSequence:0},now)).toEqual([]);
});
