/** Evaluation-only, single isolated gateway and one unaccounted completed call.
 * A log cost alone is NEVER financial confirmation. Actual USD comes from billing. */
export function confirmedEvaluationCharge(p:{billing:any;inventory:any;inventoryComplete:boolean;gatewayIds:string[];current:{id:string;estimatedCostUsd:number;reservationUsd:number;bucketStartMs:number};prior:{id:string;costUsd:number;bucketStartMs:number}[]}):number{
 const denied=()=>{throw Error('BILLING_DELTA_UNCONFIRMED')};
 const logs=p.inventory.result,history=p.billing.result?.history;
 if(p.billing.success!==true||p.inventory.success!==true||!Array.isArray(logs)||!Array.isArray(history)||history.length!==1||p.gatewayIds.length!==1||p.gatewayIds[0]!=='default'||p.inventoryComplete!==true||logs.length!==p.prior.length+1)return denied();
 const expected=new Set([...p.prior.map(r=>r.id),p.current.id]);if(expected.size!==logs.length||new Set(logs.map((r:any)=>r.id)).size!==logs.length||logs.some((r:any)=>!expected.has(r.id)))return denied();
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 if(!valid(history[0].aggregated_value)||!valid(p.current.estimatedCostUsd)||!valid(p.current.reservationUsd)||!valid(p.current.bucketStartMs)||p.prior.some(r=>!valid(r.costUsd)||!valid(r.bucketStartMs))||logs.some((r:any)=>!valid(r.cost))||Math.abs(logs.find((r:any)=>r.id===p.current.id).cost-p.current.estimatedCostUsd)>1e-9)return denied();
 const prior=p.prior.filter(r=>r.bucketStartMs===p.current.bucketStartMs).reduce((n,r)=>n+r.costUsd,0),delta=history[0].aggregated_value-prior;
 if(!valid(delta)||delta>p.current.reservationUsd||Math.abs(delta-p.current.estimatedCostUsd)>1e-9||p.prior.some(r=>Math.abs(logs.find((l:any)=>l.id===r.id).cost-r.costUsd)>1e-9))return denied();
 return Number(delta.toFixed(12));
}
