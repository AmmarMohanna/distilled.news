/** Read-only HTTP routes get a D1 session that may be served by a read replica
 * (D1_READ_SESSIONS_ENABLED) and one retry for an idempotent read that D1
 * refuses as overloaded.
 *
 * Writes are never retried here: a statement is retried only when its SQL is a
 * plain SELECT/WITH with no write keyword anywhere in it, and a batch only when
 * every statement is. Writes issued through a session still go to the primary,
 * because D1 routes them there. */
import type {Env} from './types';

const READ_ONLY_ROUTES:readonly RegExp[]=[
 /^\/api\/feed\/[^/]+\/[^/]+(?:\/(?:editions\/[^/]+|search|developments|sketch|items\/[^/]+\/evidence))?$/,
 /^\/api\/explore\/feeds$/,
 /^\/api\/admin\/briefings\/[^/]+\/pipeline-trace$/,
];

export function isReadOnlyRoute(method:string,pathname:string):boolean {
 return (method==='GET'||method==='HEAD')&&READ_ONLY_ROUTES.some(route=>route.test(pathname));
}

/** A reader with a session cookie may be looking at something they just
 * changed, so their first query goes to the primary. Anonymous readers can be
 * served by any replica. */
export function readSessionConstraint(request:Request):'first-primary'|'first-unconstrained' {
 return /(?:^|;\s*)dn_session=/.test(request.headers.get('cookie')??'')?'first-primary':'first-unconstrained';
}

export function readRouteDatabase(env:Env,request:Request,wrap:(db:D1Database)=>D1Database=db=>db):D1Database {
 const {pathname}=new URL(request.url);
 if(!env.DB||!isReadOnlyRoute(request.method,pathname))return wrap(env.DB);
 let db=env.DB;
 if(env.D1_READ_SESSIONS_ENABLED==='true'&&typeof db.withSession==='function')
  db=db.withSession(readSessionConstraint(request)) as unknown as D1Database;
 return withReadRetry(wrap(db));
}

const WRITE_WORD=/\b(?:INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX)\b/i;
export function isIdempotentReadSql(sql:string):boolean {
 return /^\s*(?:SELECT|WITH)\b/i.test(sql)&&!WRITE_WORD.test(sql);
}

export function isRetryableOverload(error:unknown):boolean {
 for(let depth=0;error&&depth<4;depth++){
  if(/overloaded|temporarily unavailable|exceeded its CPU time limit|\breset\b/i.test(String(error)))return true;
  error=typeof error==='object'?(error as {cause?:unknown}).cause:undefined;
 }
 return false;
}

const pause=()=>new Promise(resolve=>setTimeout(resolve,100+Math.floor(Math.random()*200)));
async function once<T>(retry:boolean,run:()=>Promise<T>):Promise<T> {
 try{return await run();}
 catch(error){if(!retry||!isRetryableOverload(error))throw error;await pause();return run();}
}

const sqlOf=new WeakMap<object,{native:D1PreparedStatement;sql:string}>();
function statement(native:D1PreparedStatement,sql:string):D1PreparedStatement {
 const read=isIdempotentReadSql(sql);
 const wrapped=new Proxy(native,{get(target,key){
  const value=Reflect.get(target,key,target);
  if(key==='bind')return (...args:unknown[])=>statement(Reflect.apply(value,target,args),sql);
  if(['first','all','raw'].includes(String(key))&&typeof value==='function')return (...args:unknown[])=>once(read,()=>Reflect.apply(value,target,args) as Promise<unknown>);
  return typeof value==='function'?value.bind(target):value;
 }});
 sqlOf.set(wrapped,{native,sql});return wrapped;
}

export function withReadRetry(db:D1Database):D1Database {
 return new Proxy(db,{get(target,key){
  const value=Reflect.get(target,key,target);
  if(key==='prepare')return (sql:string)=>statement(Reflect.apply(value,target,[sql]),sql);
  if(key==='batch')return (list:D1PreparedStatement[],...rest:unknown[])=>{
   const known=list.map(item=>sqlOf.get(item));
   const read=known.every(entry=>entry&&isIdempotentReadSql(entry.sql));
   const natives=list.map((item,i)=>known[i]?.native??item);
   return once(read,()=>Reflect.apply(value,target,[natives,...rest]) as Promise<unknown>);
  };
  return typeof value==='function'?value.bind(target):value;
 }}) as D1Database;
}
