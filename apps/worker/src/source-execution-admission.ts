import {SourceProviderError} from '@distilled/connectors';

/** Deployment-local admission for the private helper's two execution slots.
 * This is transport capacity only; it never grants provider or evidence authority.
 * The helper still owns its global capacity and Telegram session serialization. */
export async function admittedSourceExecution(db:D1Database,run:()=>Promise<Response>,now=Date.now):Promise<Response>{
 const token=crypto.randomUUID(),at=now(),leaseMs=90000;
 const row=await db.prepare(`INSERT INTO source_execution_slots(slot,token,lease_until)
 SELECT available.slot,?,? FROM (SELECT 0 slot UNION ALL SELECT 1) available
 WHERE NOT EXISTS(SELECT 1 FROM source_execution_slots s WHERE s.slot=available.slot AND s.lease_until>?)
 ORDER BY available.slot LIMIT 1
 ON CONFLICT(slot) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=? RETURNING slot`)
 .bind(token,at+leaseMs,at,at).first();
 if(!row)throw new SourceProviderError('BACKPRESSURE',new Date(at+5000+Math.floor(Math.random()*3000)).toISOString());
 // The HTTP adapter bounds the complete response read. Keep the lease until
 // its stream closes/cancels, rather than releasing when headers arrive.
 let released=false;
 const release=async()=>{if(released)return;released=true;await db.prepare('UPDATE source_execution_slots SET lease_until=0 WHERE token=?').bind(token).run();};
 try{
  const response=await run();
  if(!response.body){await release();return response;}
  const reader=response.body.getReader();
  const stream=new ReadableStream<Uint8Array>({
   async pull(controller){try{const result=await reader.read();if(result.done){await release();controller.close();}else controller.enqueue(result.value);}catch(error){await release();controller.error(error);}},
   async cancel(reason){try{await reader.cancel(reason);}finally{await release();}}
  });
  return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(error){await release();throw error;}
}
