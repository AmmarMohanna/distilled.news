/** Local execution bound; durable account admission remains the global authority.
 * All started tasks settle before returning, including after one rejects. */
export function inferenceConcurrency(value?:string):number {
 const n=value===undefined?2:Number(value);
 if(!value&&value!==undefined||!Number.isSafeInteger(n)||n<1||n>3)throw Error('INVALID_INFERENCE_CONCURRENCY');
 return n;
}
export async function boundedSettledMap<T,R>(items:readonly T[],limit:number,run:(item:T,index:number)=>Promise<R>):Promise<PromiseSettledResult<R>[]> {
 inferenceConcurrency(String(limit));
 const results:PromiseSettledResult<R>[]=new Array(items.length);let next=0;
 const worker=async()=>{while(next<items.length){const i=next++;try{results[i]={status:'fulfilled',value:await run(items[i],i)}}catch(reason){results[i]={status:'rejected',reason}}}};
 await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results;
}
