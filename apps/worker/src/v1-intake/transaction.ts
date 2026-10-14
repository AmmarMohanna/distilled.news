import { HandoffError } from '@distilled/contracts';
import { type ScopeSnapshot, type Table, type Write, V1IntakeStore } from './store';
import {intakeStorageCause} from './diagnostics';
/** In-batch overlay makes multiple decisions on one item observe preceding effects. */
export class IntakeTransaction {
  readonly writes = new Map<string,Write>();
  reads=0;
  constructor(readonly store:V1IntakeStore,readonly snapshot:ScopeSnapshot) {}
  async read<T>(table:Table,id:string):Promise<T|undefined> {
    const staged=this.writes.get(JSON.stringify([table,id]));
    if(staged) return staged.value as T;
    this.reads++;const row=await this.store.read<T>(table,id);
    if(row && row.feedSourceId!==this.snapshot.scope.feedSourceId) throw new HandoffError('IDEMPOTENCY_CONFLICT');
    return row?.value;
  }
  write(table:Table,id:string,value:unknown,itemKey?:string,immutable=false) { this.writes.set(JSON.stringify([table,id]),{table,id,value,itemKey,immutable}) }
}
export async function transact<T>(store:V1IntakeStore,feedSourceId:string,run:(tx:IntakeTransaction)=>Promise<T>):Promise<T> {
  const started=Date.now();let reads=0,writes=0;
  try {
    for(let attempt=0;attempt<12;attempt++) {
      const tx=new IntakeTransaction(store,await store.snapshot(feedSourceId));
      const result=await run(tx);
      reads+=tx.reads;writes=tx.writes.size;
      if(await store.commit(tx.snapshot,[...tx.writes.values()])) return result;
    }
    console.warn(JSON.stringify({type:'V1_INTAKE_CAS_EXHAUSTED',feedSourceId,attempts:12,reads,writes,elapsedMs:Date.now()-started}));
    throw new HandoffError('TEMPORARY_UNAVAILABLE');
  } catch(error) { if(error instanceof HandoffError) throw error;console.error(JSON.stringify({type:'V1_INTAKE_LOOKUP_FAILED',feedSourceId,cause:intakeStorageCause(error),elapsedMs:Date.now()-started}));throw new HandoffError('TEMPORARY_UNAVAILABLE') }
}
