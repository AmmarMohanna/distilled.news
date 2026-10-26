/** Blank NDJSON lines keep slow discovery streams active. Existing readers
 * ignore them. Every write remains tied to the stream handler's lifetime. */
export function sourceStreamHeartbeat(output:{write:(value:string)=>Promise<unknown>;aborted:boolean}){
 const pending=new Set<Promise<unknown>>();
 const tick=()=>{
  if(output.aborted)return;
  const write=output.write('\n');pending.add(write);
  void write.then(()=>pending.delete(write),()=>pending.delete(write));
 };
 const timer=setInterval(tick,10_000);tick();
 return async()=>{clearInterval(timer);await Promise.allSettled([...pending]);};
}
