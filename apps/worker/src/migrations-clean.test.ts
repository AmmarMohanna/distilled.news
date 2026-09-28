import {readFileSync,readdirSync} from "node:fs";
import {Miniflare} from "miniflare";
import {expect,it} from "vitest";

it("applies the complete migration chain to clean D1 with workflow and decision stores intact",async()=>{
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
  try{
    const db=await mf.getD1Database("DB");
    const directory=new URL("../migrations/",import.meta.url);
    const names=readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
    for(const name of names){
      const sql=readFileSync(new URL(name,directory),"utf8");
      const statements=sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(value=>value.replace(/--[^\r\n]*/g,"").trim());
      if(statements.length)await db.batch(statements.map(statement=>db.prepare(statement)));
    }
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    for(const table of ["upstream_resources","web_operator_workflows","source_acquisition_state","browser_use_discovery_runs","bounded_decision_events","public_acquisition_requests","authenticated_x_acquisition_requests","acquired_source_items","source_acquisition_leases"]){
      expect(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first()).not.toBeNull();
    }
    const columns=await db.prepare("PRAGMA table_info(bounded_decision_events)").all<{name:string}>();
    expect(columns.results.map(column=>column.name)).toEqual(expect.arrayContaining(["decision_kind","choice_count","selected_probability","cost_usd"]));
  }finally{await mf.dispose()}
},60000);
