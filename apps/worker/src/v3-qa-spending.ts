import {sha256} from '@distilled/contracts';
import {modelSpendingStatements,settleModelSpending} from './v1-intelligence/model-spending';
import {modelCapability} from './v1-intelligence/model-capacity';

/** QA transport only. The application still owns its normal durable operations.
 * This reuses the real provider account's ledger when QA data lives elsewhere. */
export function qaAccountedFetch(db:D1Database,receipts:D1Database,scope:string,feedId:string,windowEnd:string,limitUsd:number,validUntil:string,fetcher:typeof fetch=fetch):typeof fetch{
 const complete:typeof fetch=async(url,init)=>{
  if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||init?.method!=='POST'||typeof init.body!=='string')throw Error('QA_PROVIDER_REQUEST_DENIED');
  const body=JSON.parse(init.body),model=body.model;
  if(!['openai/gpt-4.1','openai/gpt-4.1-mini'].includes(model)||!scope.startsWith('v3-overnight-')||!Number.isFinite(limitUsd)||limitUsd<=0||limitUsd>19)throw Error('QA_SCOPE_DENIED');
  const capability=modelCapability(model)!;
  const reservationUsd=new TextEncoder().encode(init.body).length*capability.inputUsdPerToken+body.max_tokens*capability.outputUsdPerToken;
  if(!Number.isSafeInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>capability.maxOutputTokens)throw Error('QA_OUTPUT_LIMIT_INVALID');
  const id=scope+':'+await sha256(JSON.stringify({feedId,windowEnd,body})),receiptId=id+':response',accountId='openrouter-distilled-news-staging';
  const receipt=await receipts.prepare("SELECT json FROM v1_feed_documents WHERE kind='v3_qa_provider_responses' AND id=? AND feed_id=?").bind(receiptId,feedId).first<{json:string}>();
  if(receipt){const saved=JSON.parse(receipt.json),prior=await db.prepare('SELECT token FROM v1_model_spending_reservations WHERE id=?').bind(id).first<{token:string}>();if(!prior)throw Error('QA_RECEIPT_RESERVATION_MISSING');await settleModelSpending(db,id,prior.token,{costUsd:JSON.parse(saved.body).usage.cost,reported:true});return new Response(saved.body,{headers:{'content-type':'application/json'}})}
  if(await db.prepare('SELECT id FROM v1_model_spending_reservations WHERE id=?').bind(id).first())throw Error('QA_UNSETTLED_OR_UNRECOVERED_OPERATION');
  const reservation={id,accountId,feedId:scope,model,token:crypto.randomUUID(),reservedCostUsd:reservationUsd,leaseUntil:Date.now()+180000,createdAt:new Date().toISOString(),providerLimits:{provider:'openrouter' as const,maxConcurrent:3,requestsPerMinute:20}};
  const guard=crypto.randomUUID(),statements=await modelSpendingStatements(db,reservation);
  await db.batch([db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN julianday('now')<julianday(?) AND (SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=?)+?<=? AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=? AND COALESCE(s.reported,0)=0) THEN 1 ELSE 0 END`).bind(guard,validUntil,scope,reservationUsd,limitUsd,scope),...statements,db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)]);
  const response=await fetcher(url,init),raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{throw Error('QA_UNCERTAIN_PROVIDER_RESPONSE')}
  if(!response.ok||typeof data.usage?.cost!=='number'||!Number.isFinite(data.usage.cost)||data.usage.cost<0)throw Error('QA_PROVIDER_OUTCOME_REQUIRES_REVIEW');
  await receipts.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('v3_qa_provider_responses',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(receiptId,feedId,JSON.stringify({id:receiptId,feedId,reservationId:id,model,generationId:data.id,body:raw,createdAt:new Date().toISOString()})).run();
  await settleModelSpending(db,id,reservation.token,{costUsd:data.usage.cost,reported:true});
  return new Response(raw,{status:response.status,headers:{'content-type':'application/json'}});
 };
 // Keep this bounded evaluation scope serial: a failed account operation must
 // stop subsequent sends, while the product engine retains its normal batching.
 let tail=Promise.resolve();
 return (url,init)=>{const result=tail.then(()=>complete(url,init));tail=result.then(()=>undefined,()=>undefined);return result};
}
