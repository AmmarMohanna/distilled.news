import fs from 'node:fs/promises';
import path from 'node:path';
const out='.local-reports/demo-platform-20261021';
await fs.mkdir(out,{recursive:true});
const token=(await fs.readFile(path.join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const base='https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026';
async function cf(url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('CF_'+r.status+':'+JSON.stringify(d.errors));return d.result;}
const settings=await cf('/workers/scripts/distilled-news-sources-qa/settings');
await fs.writeFile(out+'/deployed-settings-before.json',JSON.stringify(settings,null,2));
const bindings=settings.bindings??[],database=bindings.find(x=>x.name==='DB');
const variables=Object.fromEntries(bindings.filter(x=>x.type==='plain_text'&&/^(BRIEFING_|PRODUCT_FEEDS_ENABLED$|SOURCE_QUEUE_SCHEDULING_ENABLED$|V1_DOWNSTREAM_ENABLED$|V1_REAL_MODEL_REQUIRED$|SOURCE_CONNECTORS_ENABLED$|SOURCE_FULL_ARTICLES_ENABLED$|SOURCE_GOOGLE_RESOLUTION_ENABLED$|STAGING_ASSETS_PREFIX$|V1_PUBLICATION_VALIDATION_CONTRACT$|V1_EDITORIAL_|SOURCE_EXECUTION_URL$)/.test(x.name)).map(x=>[x.name,x.text]));
const state=database?await cf('/d1/database/'+database.id+'/query',{sql:"SELECT id,username,role,email_verified_at,disabled_at FROM accounts ORDER BY created_at LIMIT 10;SELECT name FROM d1_migrations ORDER BY name;SELECT id,title,paused FROM briefings ORDER BY created_at DESC LIMIT 10;",params:[]}):[];
await fs.writeFile(out+'/deployed-state-before.json',JSON.stringify(state,null,2));
const deployment=await cf('/workers/scripts/distilled-news-sources-qa/deployments');
await fs.writeFile(out+'/deployments-before.json',JSON.stringify(deployment,null,2));
console.log(JSON.stringify({database,variables,bindingNames:bindings.map(x=>({name:x.name,type:x.type})),state:state.map(x=>x.results),deployment:deployment.deployments?.[0]}));
