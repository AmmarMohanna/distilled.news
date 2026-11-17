import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

/** Recover lineage only; never resolve, refund or redispatch a paid request. */
export function attribution(operation,runs){
 if(operation.provider_id!=='x_twitterapi_io'||operation.payload_ref||operation.status!==-1||operation.feed_id||operation.feed_source_id)throw Error('NOT_UNATTRIBUTED_X_HOLD');
 const matches=runs.filter(r=>createHash('sha256').update(JSON.stringify([{feedId:r.feed_id,feedSourceId:r.feed_source_id,sourceId:r.source_id},r.run_id])).digest('hex')===operation.operation_id);
 if(matches.length!==1)throw Error('UNIQUE_IMMUTABLE_LINEAGE_REQUIRED');
 return matches[0];
}

export async function main(){
 const [account,database,operationId]=process.argv.slice(2).filter(x=>x!=='--apply');
 const token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!database||!operationId||!token)throw Error('Usage: <account> <database> <operation-id> [--apply]; requires CLOUDFLARE_API_TOKEN');
 async function query(sql,params=[]){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const body=await response.json();if(!response.ok||!body.success)throw Error('D1_OPERATION_FAILED');return body.result[0].results;
 }
 const [operation]=await query('SELECT provider_id,operation_id,request_hash,ceiling_usd,status,payload_ref,feed_id,feed_source_id FROM connector_provider_operations WHERE provider_id=? AND operation_id=?',['x_twitterapi_io',operationId]);
 if(!operation)throw Error('OPERATION_NOT_FOUND');
 const run=attribution(operation,await query('SELECT feed_id,feed_source_id,source_id,run_id FROM connector_fetch_runs'));
 console.log(JSON.stringify({operationId,feedId:run.feed_id,sourceId:run.feed_source_id,apply:process.argv.includes('--apply'),reservationUnchanged:true,outcomeStillUnknown:true}));
 if(!process.argv.includes('--apply'))return;
 const changed=await query(`UPDATE connector_provider_operations SET feed_id=?,feed_source_id=? WHERE provider_id=? AND operation_id=? AND request_hash=? AND status=-1 AND payload_ref IS NULL AND feed_id IS NULL AND feed_source_id IS NULL AND EXISTS (SELECT 1 FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=? AND source_id=? AND run_id=?) RETURNING operation_id`,[run.feed_id,run.feed_source_id,operation.provider_id,operationId,operation.request_hash,run.feed_id,run.feed_source_id,run.source_id,run.run_id]);
 if(changed.length!==1)throw Error('ATTRIBUTION_STATE_CHANGED');
 const [after]=await query('SELECT ceiling_usd,status,payload_ref,feed_id,feed_source_id FROM connector_provider_operations WHERE provider_id=? AND operation_id=?',[operation.provider_id,operationId]);
 if(after.ceiling_usd!==operation.ceiling_usd||after.status!==operation.status||after.payload_ref!==operation.payload_ref||after.feed_id!==run.feed_id||after.feed_source_id!==run.feed_source_id)throw Error('ATTRIBUTION_VERIFICATION_FAILED');
 console.log('ATTRIBUTED_WITH_PAYMENT_HOLD_RETAINED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
