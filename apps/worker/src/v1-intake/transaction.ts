import { HandoffError } from '@distilled/contracts';
import { type ScopeSnapshot, type Table, type Write,type ReadKey,type Stored,type AcquisitionJobGuard, V1IntakeStore } from './store';
import {intakeStorageCause} from './diagnostics';
/** In-batch overlay makes multiple decisions on one item observe preceding effects. */
export class IntakeTransaction {
  readonly writes = new Map<string,Write>();
  readonly acquisitionGuards=new Map<string,AcquisitionJobGuard>();
  reads=0;
  private readonly cached=new Map<string,Stored<unknown>|undefined>();
  constructor(readonly store:V1IntakeStore,readonly snapshot:ScopeSnapshot) {}
  async read<T>(table:Table,id:string):Promise<T|undefined> {
    const staged=this.writes.get(JSON.stringify([table,id]));
    if(staged) return staged.value as T;
    const key=JSON.stringify([table,id]);
    const row=this.cached.has(key)?this.cached.get(key) as Stored<T>|undefined:await this.store.read<T>(table,id);
    if(!this.cached.has(key)){this.reads++;this.cached.set(key,row);}
    if(row && row.feedSourceId!==this.snapshot.scope.feedSourceId) throw new HandoffError('IDEMPOTENCY_CONFLICT');
    if(table==='jobs'&&row&&(row.value as {kind?:string}).kind==='ACQUIRE')this.acquisitionGuards.set(id,{id,feedSourceId:row.feedSourceId,serialized:row.serialized??JSON.stringify(row.value)});
    return row?.value;
  }
  async prefetch(keys:ReadKey[]):Promise<void> {
    const missing=keys.filter(key=>!this.cached.has(JSON.stringify([key.table,key.id]))&&!this.writes.has(JSON.stringify([key.table,key.id])));
    if(!missing.length)return;
    const values=await this.store.readMany(missing);this.reads+=values.size;
    for(const [key,value] of values)this.cached.set(key,value);
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
      if(await store.commit(tx.snapshot,[...tx.writes.values()],[...tx.acquisitionGuards.values()])) return result;
    }
    console.warn(JSON.stringify({type:'V1_INTAKE_CAS_EXHAUSTED',feedSourceId,attempts:12,reads,writes,elapsedMs:Date.now()-started}));
    throw new HandoffError('TEMPORARY_UNAVAILABLE');
  } catch(error) { if(error instanceof HandoffError) throw error;console.error(JSON.stringify({type:'V1_INTAKE_LOOKUP_FAILED',feedSourceId,cause:intakeStorageCause(error),elapsedMs:Date.now()-started}));throw new HandoffError('TEMPORARY_UNAVAILABLE') }
}
