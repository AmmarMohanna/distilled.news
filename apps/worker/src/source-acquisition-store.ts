import type { SourceHighWaterState, SourceHighWaterStore } from "@distilled/agent-runtime";

type Row={scope_key:string;tenant_id:string;resource_id:string;last_successful_boundary?:string|null;unresolved_start?:string|null;unresolved_end?:string|null;state_version:number};
export class D1SourceHighWaterStore implements SourceHighWaterStore {
  constructor(private readonly db:D1Database,private readonly tenantId:string){}
  async get(key:string):Promise<SourceHighWaterState|undefined>{const row=await this.db.prepare("SELECT scope_key,tenant_id,resource_id,last_successful_boundary,unresolved_start,unresolved_end,state_version FROM source_acquisition_state WHERE scope_key=? AND tenant_id=?").bind(key,this.tenantId).first<Row>();if(!row)return undefined;return{key:row.scope_key,lastSuccessfulBoundary:row.last_successful_boundary??undefined,unresolvedWindow:row.unresolved_start&&row.unresolved_end?{startTime:row.unresolved_start,endTime:row.unresolved_end}:undefined};}
  async put(state:SourceHighWaterState):Promise<void>{
    if (!state.key.startsWith(`${this.tenantId}:`)) throw new Error("source state tenant fence mismatch");
    const resourceId=state.key.slice(this.tenantId.length+1);
    const iso=(value?:string)=>value?new Date(value).toISOString():null;
    const highWater=iso(state.lastSuccessfulBoundary);
    const unresolvedStart=iso(state.unresolvedWindow?.startTime);
    const unresolvedEnd=iso(state.unresolvedWindow?.endTime);
    const now=new Date().toISOString();
    await this.db.prepare(`INSERT INTO source_acquisition_state(scope_key,tenant_id,resource_id,last_successful_boundary,unresolved_start,unresolved_end,state_version,updated_at)
      VALUES(?,?,?,?,?,?,0,?) ON CONFLICT(scope_key) DO UPDATE SET
      last_successful_boundary=CASE WHEN excluded.last_successful_boundary IS NULL THEN source_acquisition_state.last_successful_boundary WHEN source_acquisition_state.last_successful_boundary IS NULL OR excluded.last_successful_boundary>source_acquisition_state.last_successful_boundary THEN excluded.last_successful_boundary ELSE source_acquisition_state.last_successful_boundary END,
      unresolved_start=CASE
        WHEN excluded.unresolved_end IS NULL THEN CASE WHEN excluded.last_successful_boundary>=source_acquisition_state.unresolved_end THEN NULL ELSE source_acquisition_state.unresolved_start END
        WHEN COALESCE(source_acquisition_state.last_successful_boundary,'')>=excluded.unresolved_end THEN source_acquisition_state.unresolved_start
        WHEN source_acquisition_state.unresolved_start IS NULL THEN excluded.unresolved_start
        ELSE MIN(source_acquisition_state.unresolved_start,excluded.unresolved_start) END,
      unresolved_end=CASE
        WHEN excluded.unresolved_end IS NULL THEN CASE WHEN excluded.last_successful_boundary>=source_acquisition_state.unresolved_end THEN NULL ELSE source_acquisition_state.unresolved_end END
        WHEN COALESCE(source_acquisition_state.last_successful_boundary,'')>=excluded.unresolved_end THEN source_acquisition_state.unresolved_end
        WHEN source_acquisition_state.unresolved_end IS NULL THEN excluded.unresolved_end
        ELSE MAX(source_acquisition_state.unresolved_end,excluded.unresolved_end) END,
      state_version=source_acquisition_state.state_version+1, updated_at=excluded.updated_at`)
      .bind(state.key,this.tenantId,resourceId,highWater,unresolvedStart,unresolvedEnd,now).run();
  }
}
