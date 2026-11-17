import {digest} from './manifest.mjs';
/** Totals are supplied by the existing authoritative ledgers, not reconstructed
 * from HTTP calls. Four categories must be explicitly covered, even if zero. */
export function reconcileAccounting({modelLedger,external,observedAt},now=Date.now()){
 if(!Array.isArray(modelLedger)||!Array.isArray(external)||!Number.isFinite(Date.parse(observedAt))||now-Date.parse(observedAt)>60000||Date.parse(observedAt)>now)throw Error('CURRENT_ACCOUNTING_REQUIRED');
 const groups=['source-assessment','artwork','browser-tools','external-collectors'];
 for(const kind of groups)if(external.filter(e=>e.kind===kind).length!==1)throw Error('ALL_SETUP_AND_TOOL_COST_CATEGORIES_REQUIRED');
 const ids=new Set();let settledUsd=0,outstandingReservedUsd=0,uncertainOperations=0,modelCalls=0;
 for(const row of modelLedger){
  if(ids.has(row.id)||!row.id)throw Error('DUPLICATE_LEDGER_ID');ids.add(row.id);
  if(!Number.isFinite(row.reservedUsd)||row.reservedUsd<0||!Number.isSafeInteger(row.calls)||row.calls<0)throw Error('LEDGER_COUNTS_UNKNOWN');
  modelCalls+=row.calls;
  if(row.reported===true){if(!Number.isFinite(row.settledUsd)||row.settledUsd<0)throw Error('SETTLEMENT_UNKNOWN');settledUsd+=row.settledUsd;}
  else{if(!['RESERVED','IN_FLIGHT','UNCERTAIN'].includes(row.outcome))throw Error('HELD_OPERATION_STATE_UNKNOWN');outstandingReservedUsd+=row.reservedUsd;if(row.outcome==='UNCERTAIN')uncertainOperations++;}
 }
 for(const e of external){
  if(!groups.includes(e.kind)||!e.evidenceHash||e.coverage!=='COMPLETE'||typeof e.includedInModelLedger!=='boolean'||!Number.isFinite(e.settledUsd)||e.settledUsd<0||!Number.isFinite(e.heldUsd)||e.heldUsd<0||!Number.isSafeInteger(e.uncertainOperations)||e.uncertainOperations<0)throw Error('EXTERNAL_COST_COVERAGE_UNKNOWN');
  // Never add duplicate charges already represented by model reservations.
  if(!e.includedInModelLedger){settledUsd+=e.settledUsd;outstandingReservedUsd+=e.heldUsd;uncertainOperations+=e.uncertainOperations;}
 }
 return {complete:true,observedAt,evidenceHash:digest({modelLedger,external,observedAt}),settledUsd,outstandingReservedUsd,uncertainOperations,modelCalls};
}
