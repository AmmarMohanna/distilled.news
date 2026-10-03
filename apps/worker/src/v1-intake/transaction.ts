import { HandoffError } from '@distilled/contracts';
import { type ScopeSnapshot, type Table, type Write, V1IntakeStore } from './store';
/** In-batch overlay makes multiple decisions on one item observe preceding effects. */
export class IntakeTransaction {
  readonly writes = new Map<string,Write>();
  constructor(readonly store:V1IntakeStore,readonly snapshot:ScopeSnapshot) {}
  async read<T>(table:Table,id:string):Promise<T|undefined> {
    const staged=this.writes.get(JSON.stringify([table,id]));
    if(staged) return staged.value as T;
    const row=await this.store.read<T>(table,id);
    if(row && row.feedSourceId!==this.snapshot.scope.feedSourceId) throw new HandoffError('IDEMPOTENCY_CONFLICT');
    return row?.value;
  }
  write(table:Table,id:string,value:unknown,itemKey?:string,immutable=false) { this.writes.set(JSON.stringify([table,id]),{table,id,value,itemKey,immutable}) }
}
export async function transact<T>(store:V1IntakeStore,feedSourceId:string,run:(tx:IntakeTransaction)=>Promise<T>):Promise<T> {
  try {
    for(let attempt=0;attempt<12;attempt++) {
      const tx=new IntakeTransaction(store,await store.snapshot(feedSourceId));
      const result=await run(tx);
      if(await store.commit(tx.snapshot,[...tx.writes.values()])) return result;
    }
    throw new HandoffError('TEMPORARY_UNAVAILABLE');
  } catch(error) { if(error instanceof HandoffError) throw error; throw new HandoffError('TEMPORARY_UNAVAILABLE') }
}
