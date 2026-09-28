import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe,expect,it } from "vitest";
import { expireAcquisitionDiagnostics } from "./acquisition-diagnostic-retention";

describe("acquisition diagnostic retention",()=>{
  it("expires old terminal reports while preserving running and recent requests",async()=>{
    const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    try{
      const db=await mf.getD1Database("DB");
      for(const name of ["0028_browser_use_discovery_runs.sql","0029_public_acquisition_requests.sql","0030_authenticated_x_acquisition_requests.sql","0031_bounded_decision_events.sql"]){
        const sql=readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");
        for(const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
      }
      for(const table of ["public_acquisition_requests","authenticated_x_acquisition_requests"]){
        const profileColumn=table.startsWith("authenticated")?",authenticated_profile_id":"";
        const profileValue=table.startsWith("authenticated")?",'profile'":"";
        for(const [id,state,date] of [["old","completed","2026-07-01T00:00:00Z"],["recent","failed","2026-09-15T00:00:00Z"],["running","running","2026-07-01T00:00:00Z"]]){
          await db.prepare(`INSERT INTO ${table}(request_id,idempotency_key,owner_account_id${profileColumn},request_json,state,created_at,completed_at) VALUES(?,?,?${profileValue},?,?,?,?)`)
            .bind(`${table}-${id}`,id,"owner","{}",state,date,state==="running"?null:date).run();
        }
      }
      for(const [id,date] of [["old","2026-05-01T00:00:00Z"],["recent","2026-09-15T00:00:00Z"]])await db.prepare("INSERT INTO browser_use_discovery_runs(run_id,acquisition_run_id,tenant_id,resource_id,state,started_at,completed_at) VALUES(?,?,?,'resource','ACTIVE',?,?)")
        .bind(id,id,"owner",date,date).run();
      await expireAcquisitionDiagnostics(db,new Date("2026-09-28T00:00:00Z"));
      for(const table of ["public_acquisition_requests","authenticated_x_acquisition_requests"]){
        const rows=await db.prepare(`SELECT request_id FROM ${table} ORDER BY request_id`).all<{request_id:string}>();
        expect(rows.results.map(row=>row.request_id)).toEqual([`${table}-recent`,`${table}-running`]);
      }
      const telemetry=await db.prepare("SELECT run_id FROM browser_use_discovery_runs").all<{run_id:string}>();
      expect(telemetry.results.map(row=>row.run_id)).toEqual(["recent"]);
    }finally{await mf.dispose()}
  });
});
