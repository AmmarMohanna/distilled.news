/** Staging operator wrapper. Adds an atomic per-feed mission ceiling to the
 * existing financial admission transaction; never replaces account admission. */
export function stagingMissionDb(db:D1Database,feedId:string,ceilingUsd:number,metrics={queries:0,sqlCpuMs:0,responseBytes:0,wallMs:0}):D1Database {
 if(!feedId.startsWith('staging-fresh-')||!Number.isFinite(ceilingUsd)||ceilingUsd<=0||ceilingUsd>10)throw Error('INVALID_STAGING_MISSION_BUDGET');
 const record=(rows:D1Result[])=>{metrics.queries+=rows.length;for(const r of rows){metrics.sqlCpuMs+=Number((r.meta as any)?.timings?.sql_duration_ms??r.meta?.duration??0);metrics.responseBytes+=new TextEncoder().encode(JSON.stringify(r.results??[])).length;}};
 const unwrap=new WeakMap<object,{statement:D1PreparedStatement;sql:string;params:unknown[]}>();
 const prepare=(sql:string,params:unknown[]=[]):D1PreparedStatement=>{
  const native=db.prepare(sql).bind(...params),wrapped=new Proxy(native,{get(target,key){
   if(key==='bind')return (...values:unknown[])=>prepare(sql,values);
   if(['run','all','first','raw'].includes(String(key))&&/INSERT\s+INTO\s+v1_model_spending_reservations/i.test(sql))return ()=>{throw Error('MISSION_RESERVATION_REQUIRES_ATOMIC_BATCH')};
   if(['run','all','first'].includes(String(key)))return async(column?:string)=>{const at=performance.now();try{const r=await target.all();record([r]);return key==='first'?(column?r.results[0]?.[column]:r.results[0]??null):r;}finally{metrics.wallMs+=performance.now()-at}};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});unwrap.set(wrapped,{statement:native,sql,params});return wrapped;
 };
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return prepare;
  if(key==='batch')return async(statements:D1PreparedStatement[])=>{
   const entries=statements.map(s=>unwrap.get(s)??{statement:s,sql:'',params:[]});
   const reservations=entries.filter(s=>/INSERT\s+INTO\s+v1_model_spending_reservations/i.test(s.sql));
   if(!reservations.length){const at=performance.now();try{const r=await db.batch(entries.map(s=>s.statement));record(r);return r;}finally{metrics.wallMs+=performance.now()-at}}
   if(reservations.length!==1)throw Error('MISSION_REQUIRES_SINGLE_RESERVATION');
   const params=reservations[0].params;
   if(params[5]!==feedId||typeof params[6]!=='number'||params[6]<0)throw Error('MISSION_RESERVATION_SCOPE_MISMATCH');
   const guard='staging-mission:'+crypto.randomUUID();
   const check=db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN (SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=?)+?<=? THEN 1 ELSE 0 END`).bind(guard,feedId,params[6],ceilingUsd);
   const at=performance.now();let results:D1Result[];try{results=await db.batch([check,...entries.map(s=>s.statement),db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)]);record(results);}finally{metrics.wallMs+=performance.now()-at}
   return results.slice(1,-1);
  };
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }}) as D1Database;
}
