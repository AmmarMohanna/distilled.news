import {expect,it} from 'vitest';
import {connectorOperationalAlerts,connectorCollectionAlerts,SOURCE_NO_SUCCESS_AFTER_MS,SOURCE_UNPROVEN_AFTER_CHECKS} from './connector-health';
it('clears credential and budget warnings after a later accepted batch',()=>{
 for(const failure of ['AUTH_REQUIRED','BUDGET_EXCEEDED']){
  expect(connectorOperationalAlerts({nextRunAt:null,failure:{failure,sequence:3},acceptedSequence:2})).toEqual([{code:failure,severity:'error'}]);
  expect(connectorOperationalAlerts({nextRunAt:null,failure:{failure,sequence:3},acceptedSequence:4})).toEqual([]);
 }
});
it('keeps potentially billed historical calls visible after a later successful poll',()=>{
 expect(connectorOperationalAlerts({nextRunAt:null,acceptedSequence:10,uncertainPaidAttempts:1})).toEqual([{code:'PAID_RECONCILIATION_REQUIRED',severity:'warning'}]);
});
it('retains historical attempt counts without an active warning after explicit acceptance',()=>{
 expect(connectorOperationalAlerts({nextRunAt:null,acceptedSequence:10,uncertainPaidAttempts:5,unresolvedPaidOperations:0})).toEqual([]);
 expect(connectorOperationalAlerts({nextRunAt:null,acceptedSequence:10,uncertainPaidAttempts:5,unresolvedPaidOperations:1})).toEqual([{code:'PAID_RECONCILIATION_REQUIRED',severity:'warning'}]);
});
it('reports blocked jobs and overdue backlog without warning about future work',()=>{
 const now=new Date('2026-10-10T12:00:00Z');
 expect(connectorOperationalAlerts({job:{state:'BLOCKED',lastError:'BOUNDED_LIMIT'},nextRunAt:'2026-10-10T11:00:00Z',acceptedSequence:0},now)).toEqual([{code:'SOURCE_BLOCKED',severity:'error'},{code:'POLL_BACKLOG_OVERDUE',severity:'warning'}]);
 expect(connectorOperationalAlerts({nextRunAt:'2026-10-10T12:05:00Z',acceptedSequence:0},now)).toEqual([]);
});
it('warns when a source keeps being checked without an accepted batch for two days',()=>{
 const now=new Date('2026-11-18T12:00:00Z'),base={nextRunAt:null,acceptedSequence:0};
 const collection={firstCheckedAt:'2026-11-01T00:00:00Z',lastCheckedAt:'2026-11-18T11:00:00Z',lastAcceptedAt:'2026-11-16T10:00:00Z',checks:40,observations:120};
 expect(connectorOperationalAlerts({...base,collection},now)).toEqual([{code:'SOURCE_NO_RECENT_SUCCESS',severity:'warning'}]);
 // Accepted yesterday, even with no new items: a quiet source, not a failing one.
 expect(connectorOperationalAlerts({...base,collection:{...collection,lastAcceptedAt:'2026-11-17T12:00:00Z'}},now)).toEqual([]);
 // The latest check was the accepted one.
 expect(connectorOperationalAlerts({...base,collection:{...collection,lastCheckedAt:'2026-11-16T10:00:00Z'}},now)).toEqual([]);
 // Never accepted: measured from the first check.
 expect(connectorOperationalAlerts({...base,collection:{...collection,lastAcceptedAt:null,firstCheckedAt:'2026-11-18T00:00:00Z'}},now)).toEqual([]);
 expect(connectorOperationalAlerts({...base,collection:{...collection,lastAcceptedAt:null}},now)).toEqual([{code:'SOURCE_NO_RECENT_SUCCESS',severity:'warning'}]);
});
it('warns when a source has been checked repeatedly but never produced an item',()=>{
 const now=new Date('2026-11-18T12:00:00Z'),base={nextRunAt:null,acceptedSequence:3};
 const collection={firstCheckedAt:'2026-11-18T06:00:00Z',lastCheckedAt:'2026-11-18T11:00:00Z',lastAcceptedAt:'2026-11-18T11:00:00Z',checks:3,observations:0};
 expect(connectorOperationalAlerts({...base,collection},now)).toEqual([{code:'SOURCE_NEVER_COLLECTED',severity:'warning'}]);
 expect(connectorOperationalAlerts({...base,collection:{...collection,checks:2}},now)).toEqual([]);
 expect(connectorOperationalAlerts({...base,collection:{...collection,observations:1}},now)).toEqual([]);
});
it('agrees with the Grafana snapshot rule on every case',async()=>{
 const {collectionAlertCodes,SOURCE_NO_SUCCESS_AFTER_MS:grafanaAfter,SOURCE_UNPROVEN_AFTER_CHECKS:grafanaChecks}=await import('../../../ops/observability/collection-alerts.mjs');
 expect([grafanaAfter,grafanaChecks]).toEqual([SOURCE_NO_SUCCESS_AFTER_MS,SOURCE_UNPROVEN_AFTER_CHECKS]);
 const now=new Date('2026-11-18T12:00:00Z');
 const times=[null,'2026-11-01T00:00:00Z','2026-11-16T10:00:00Z','2026-11-17T12:00:00Z','2026-11-18T11:00:00Z'];
 for(const firstCheckedAt of times)for(const lastCheckedAt of times)for(const lastAcceptedAt of times)for(const checks of [0,2,3])for(const observations of [0,1]){
  const history={firstCheckedAt,lastCheckedAt,lastAcceptedAt,checks,observations};
  expect(collectionAlertCodes(history,now.getTime()),JSON.stringify(history)).toEqual(connectorCollectionAlerts(history,now));
 }
});
