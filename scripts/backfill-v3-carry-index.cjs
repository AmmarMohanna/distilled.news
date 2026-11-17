const fs=require('node:fs'),path=require('node:path');
function validResult(value){const r=value?.result;return typeof value?.windowEnd==='string'&&r&&['items','skipped','omitted','dropped'].every(k=>Array.isArray(r[k]))&&['items','omitted','dropped'].every(k=>r[k].every(v=>v&&Array.isArray(v.sourceIds)&&v.sourceIds.every(id=>typeof id==='string')))&&r.skipped.every(v=>v&&typeof v==='object')}
async function backfill({query,statePath,maxPages=100}){
 if(typeof query!=='function'||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>5000)throw Error('INVALID_BACKFILL_CONFIGURATION');
 fs.mkdirSync(path.dirname(statePath),{recursive:true});let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{feedAfter:'',feed:null,resultAfter:'',pages:0,results:0,readyFeeds:0,blocked:[]};
 const save=()=>{state.updatedAt=new Date().toISOString();const temp=statePath+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,statePath)};
 await query('SELECT feed_id FROM v3_carry_index_state LIMIT 0');
 for(let step=0;step<maxPages;step++){
 if(!state.feed){const next=(await query('SELECT f.id FROM v1_feeds f LEFT JOIN v3_carry_index_state s ON s.feed_id=f.id WHERE f.id>? AND COALESCE(s.ready,0)=0 ORDER BY f.id LIMIT 1',[state.feedAfter])).results[0];if(!next){state.scanComplete=true;save();break;}state.feed=next.id;state.resultAfter='';}
 const metadata=(await query("SELECT id,length(CAST(json AS BLOB)) bytes FROM v1_feed_documents WHERE feed_id=? AND kind='v3_window_results' AND id>? ORDER BY id LIMIT 25",[state.feed,state.resultAfter])).results;
 if(!metadata.length){await query('INSERT INTO v3_carry_index_state(feed_id,ready) SELECT id,1 FROM v1_feeds WHERE id=? ON CONFLICT(feed_id) DO UPDATE SET ready=1',[state.feed]);state.readyFeeds++;state.feedAfter=state.feed;state.feed=null;state.resultAfter='';state.pages++;save();continue;}
 const picked=[];let bytes=0;for(const row of metadata){if(picked.length&&bytes+row.bytes>1000000)break;picked.push(row.id);bytes+=row.bytes;}
 const records=(await query("SELECT id,json FROM v1_feed_documents WHERE feed_id=? AND kind='v3_window_results' AND id IN ("+picked.map(()=>'?').join(',')+') ORDER BY id',[state.feed,...picked])).results;
 const bad=records.find(row=>!validResult(JSON.parse(row.json)));if(bad){state.blocked.push({feedId:state.feed,resultId:bad.id,reason:'UNSUPPORTED_LEGACY_RESULT_SHAPE'});state.feedAfter=state.feed;state.feed=null;state.resultAfter='';state.pages++;save();continue;}
 for(const row of records){await query('INSERT OR IGNORE INTO v3_carry_decisions SELECT * FROM v3_carry_projection WHERE result_id=? AND feed_id=?',[row.id,state.feed]);state.results++;}
 // Canonical results are immutable. Concurrent inserts, including IDs behind this cursor, are indexed by the migration trigger.
 state.resultAfter=picked.at(-1);state.pages++;save();
 }
 return {...state,completed:state.scanComplete===true&&state.blocked.length===0};
}
module.exports={backfill,validResult};
if(require.main===module){const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,database=process.env.CLOUDFLARE_D1_DATABASE_ID;
 if(!token||!/^[a-f0-9]{32}$/.test(account??'')||!/^[a-f0-9-]{36}$/.test(database??''))throw Error('INVALID_BACKFILL_CREDENTIAL_CONFIGURATION');
 const query=async(sql,params=[])=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success)throw Error('D1_BACKFILL_FAILED:'+JSON.stringify(j.errors));await new Promise(resolve=>setTimeout(resolve,100));return j.result[0]};
 backfill({query,statePath:process.argv[2]??'.local-reports/v3-carry-backfill.json',maxPages:Number(process.argv[3]??100)}).then(result=>{console.log(JSON.stringify(result));if(result.blocked.length)process.exitCode=2}).catch(e=>{console.error(e.message);process.exitCode=1});
}
