/** Test-only D1 profiler. It records every statement a code path executes,
 * the rows D1 reports reading, and SQLite's query plan for each distinct SQL.
 * It never changes results: `first()` is served from the same native `all()`. */
export interface ProfiledStatement {sql:string;binds:unknown[];rowsRead:number;rowsWritten:number;durationMs:number}
export interface PlanFinding {sql:string;detail:string}

const WRITE=/^\s*(?:WITH[\s\S]*?\)\s*)?(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
export function isWriteSql(sql:string):boolean {return WRITE.test(sql)}

export function profileD1(db:D1Database){
 const log:ProfiledStatement[]=[];
 const record=(sql:string,binds:unknown[],meta:Partial<D1Meta>|undefined,started:number)=>log.push({sql,binds,
  rowsRead:Number(meta?.rows_read??0),rowsWritten:Number(meta?.rows_written??0),durationMs:performance.now()-started});
 const wrap=(native:D1PreparedStatement,sql:string,binds:unknown[]):D1PreparedStatement=>({
  bind:(...values:unknown[])=>wrap(native.bind(...values),sql,values),
  async first(column?:string){const started=performance.now();const result=await native.all<Record<string,unknown>>();record(sql,binds,result.meta,started);
   const row=result.results[0]??null;return (column===undefined?row:row?.[column]??null) as never},
  async all(){const started=performance.now();const result=await native.all();record(sql,binds,result.meta,started);return result as never},
  async run(){const started=performance.now();const result=await native.run();record(sql,binds,result.meta,started);return result as never},
  async raw(options?:{columnNames?:boolean}){const started=performance.now();const result=await native.all();record(sql,binds,result.meta,started);
   return native.raw(options as never) as never},
  __native:native,__sql:sql,__binds:binds,
 } as unknown as D1PreparedStatement);
 const proxy=new Proxy(db,{get(target,key){
  if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),sql,[]);
  if(key==='batch')return async(statements:D1PreparedStatement[])=>{
   const started=performance.now();
   const natives=statements.map(s=>(s as unknown as {__native?:D1PreparedStatement}).__native??s);
   const results=await target.batch(natives);
   results.forEach((result,i)=>{const s=statements[i] as unknown as {__sql?:string;__binds?:unknown[]};record(s.__sql??'UNKNOWN',s.__binds??[],result.meta,started)});
   return results;
  };
  if(key==='withSession')return ()=>proxy;
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return {db:proxy as D1Database,log,reset:()=>{log.length=0}};
}

/** Full scans of retained tables and temporary sorts are the plan shapes that
 * grow with history. Scans of json_each / CTE materializations are bounded. */
export async function planFindings(db:D1Database,statements:ProfiledStatement[]):Promise<PlanFinding[]>{
 const seen=new Set<string>(),findings:PlanFinding[]=[];
 for(const statement of statements){
  if(seen.has(statement.sql)||isWriteSql(statement.sql)||!/^\s*(SELECT|WITH)/i.test(statement.sql))continue;seen.add(statement.sql);
  let plan:{detail:string}[];
  try{plan=(await db.prepare('EXPLAIN QUERY PLAN '+statement.sql).bind(...statement.binds).all<{detail:string}>()).results}catch{continue}
  for(const row of plan)if(/^SCAN (?!json_each|CONSTANT|recent|latest|expired|selected)/.test(row.detail)&&!/USING (?:COVERING )?INDEX/.test(row.detail)||/TEMP B-TREE/.test(row.detail))
   findings.push({sql:statement.sql.replace(/\s+/g,' ').slice(0,180),detail:row.detail});
 }
 return findings;
}

export function summarize(log:ProfiledStatement[]){
 return {statements:log.length,rowsRead:log.reduce((n,s)=>n+s.rowsRead,0),rowsWritten:log.reduce((n,s)=>n+s.rowsWritten,0),
  writes:log.filter(s=>isWriteSql(s.sql)).length,dbMs:Math.round(log.reduce((n,s)=>n+s.durationMs,0))};
}
