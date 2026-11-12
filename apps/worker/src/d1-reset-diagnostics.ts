/** Failure-only D1 diagnostics. Never retain/log bind values or database errors.
 * Wrappers preserve native receivers and unwrap statements before native batch. */
const databases=new WeakMap<D1Database,D1Database>();
const statements=new WeakMap<object,{native:D1PreparedStatement;sql:string}>();
function failureType(error:unknown):'D1_CPU_RESET'|'D1_OVERLOADED'|undefined{
 for(let depth=0;error&&depth<4;depth++){
  if(/D1 DB is overloaded\. Too many resources consumed within a 10 second window\./i.test(String(error)))return 'D1_OVERLOADED';
  if(/\b7429\b|exceeded its CPU time limit|D1[^\n]*CPU[^\n]*reset/i.test(String(error)))return 'D1_CPU_RESET';
  error=typeof error==='object'?(error as {cause?:unknown}).cause:undefined;
 }
 return undefined;
}
function structure(sql:string):string{
 // One lexical pass handles comment markers inside quoted values correctly.
 return sql.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]/g,
  token=>token.startsWith('--')||token.startsWith('/*')?' ':'?')
 .replace(/\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi,'?').replace(/\s+/g,' ').trim();
}
async function report(error:unknown,method:string,sqls:readonly string[],started:number):Promise<void>{
 try{
  const type=failureType(error);if(!type)return;
  const durationMs=Math.max(0,performance.now()-started);
  const entries=await Promise.all(sqls.map(async sql=>{
   const normalized=structure(sql),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
   return {hash:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),sql:normalized.slice(0,160)};
  }));
  console.error(JSON.stringify({type,method,durationMs,statementCount:entries.length,statements:entries}));
 }catch{/* Diagnostics must never replace the original database failure. */}
}
function observe(method:string,sqls:readonly string[],run:()=>unknown):Promise<unknown>{
 const started=performance.now();let result:unknown;
 try{result=run();}catch(error){void report(error,method,sqls,started);throw error;}
 return Promise.resolve(result).catch(async error=>{await report(error,method,sqls,started);throw error;});
}
function statement(native:D1PreparedStatement,sql:string):D1PreparedStatement{
 const wrapped=new Proxy(native,{get(target,key){
  const value=Reflect.get(target,key,target);
  if(key==='bind')return (...args:unknown[])=>statement(Reflect.apply(value,target,args),sql);
  if(['first','all','run','raw'].includes(String(key))&&typeof value==='function')return (...args:unknown[])=>observe(String(key),[sql],()=>Reflect.apply(value,target,args));
  return typeof value==='function'?value.bind(target):value;
 }});
 statements.set(wrapped,{native,sql});return wrapped;
}
export function withD1ResetDiagnostics(db:D1Database):D1Database{
 if(!db)return db;
 const existing=databases.get(db);if(existing)return existing;
 const wrapped=new Proxy(db,{get(target,key){
  const value=Reflect.get(target,key,target);
  if(key==='prepare')return (sql:string)=>statement(Reflect.apply(value,target,[sql]),sql);
  if(key==='batch')return (...args:unknown[])=>{
   const batch=Array.isArray(args[0])?args[0]:undefined;
   const sqls=batch?.map(item=>statements.get(item)?.sql??'UNKNOWN_NATIVE_STATEMENT')??[];
   const forwarded=batch?[batch.map(item=>statements.get(item)?.native??item),...args.slice(1)]:args;
   return observe('batch',sqls,()=>Reflect.apply(value,target,forwarded));
  };
  if(key==='exec')return (...args:unknown[])=>observe('exec',typeof args[0]==='string'?[args[0]]:[],()=>Reflect.apply(value,target,args));
  return typeof value==='function'?value.bind(target):value;
 }});
 databases.set(db,wrapped);databases.set(wrapped,wrapped);return wrapped;
}
