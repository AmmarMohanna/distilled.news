const fs=require('node:fs'),path=require('node:path');
async function backfill({token,accountId,databaseId,statePath,maxPages=100,paceMs=350}){
 if(!token||!/^[a-f0-9]{32}$/.test(accountId)||!/^[a-f0-9-]{36}$/.test(databaseId)||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>5000)throw Error('INVALID_BACKFILL_CONFIGURATION');
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const query=async(sql,params=[])=>{for(let attempt=0;attempt<3;attempt++){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+databaseId+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(45000)});const j=await r.json();await wait(paceMs);if(r.ok&&j.success)return j.result[0];const codes=j.errors?.map(e=>e.code)??[];if(attempt<2&&(codes.includes(7429)||r.status===429)){await wait(5000);continue;}throw Error('D1_BACKFILL_FAILED:'+JSON.stringify(j.errors));}throw Error('BACKFILL_RETRY_EXHAUSTED')};
 await query('SELECT id FROM v1_revision_selection_index LIMIT 0');await query('SELECT id FROM v1_observation_time_index LIMIT 0');
 fs.mkdirSync(path.dirname(statePath),{recursive:true});
 let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{cursor:'',pages:0,revisionRows:0,observationRows:0};
 for(let page=0;page<maxPages;page++){
  const rows=(await query("SELECT e.id AS evidence_id,r.id AS revision_id FROM v1_evidence e JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE e.id>? AND json_extract(e.json,'$.state')='ACTIVE' ORDER BY e.id LIMIT 75",[state.cursor])).results;
  if(!rows.length){state.completed=true;break;}
  const ids=[...new Set(rows.map(r=>r.revision_id))],marks=ids.map(()=>'?').join(',');
  const revisions=await query("INSERT OR IGNORE INTO v1_revision_selection_index SELECT id,feed_source_id,json_extract(json,'$.evidenceId'),json_extract(json,'$.publishedAt'),json_extract(json,'$.acceptedAt'),json_extract(json,'$.sourceObservationId') FROM v1_revisions WHERE id IN ("+marks+")",ids);
  const observations=await query("INSERT OR IGNORE INTO v1_observation_time_index SELECT i.id,i.feed_source_id,json_extract(i.json,'$.observation.observedAt') FROM v1_revision_selection_index m JOIN v1_inputs i ON i.id=m.source_observation_id AND i.feed_source_id=m.feed_source_id WHERE m.id IN ("+marks+")",ids);
  state={...state,cursor:rows.at(-1).evidence_id,pages:state.pages+1,revisionRows:state.revisionRows+(revisions.meta?.changes??0),observationRows:state.observationRows+(observations.meta?.changes??0),updatedAt:new Date().toISOString(),completed:false};
  fs.writeFileSync(statePath,JSON.stringify(state,null,2));if(state.pages%10===0)console.log(JSON.stringify({pages:state.pages,revisionRows:state.revisionRows,observationRows:state.observationRows}));
 }
 fs.writeFileSync(statePath,JSON.stringify(state,null,2));return {completed:state.completed??false,pages:state.pages,revisionRows:state.revisionRows,observationRows:state.observationRows};
}
module.exports={backfill};
if(require.main===module)backfill({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:process.env.CLOUDFLARE_D1_DATABASE_ID,statePath:process.argv[2]??'.local-reports/evidence-selection-backfill.json',maxPages:Number(process.argv[3]??100)}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});
