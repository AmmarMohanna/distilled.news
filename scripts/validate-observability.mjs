import {readFileSync,readdirSync} from 'node:fs';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import {projectSnapshots} from './agentops-snapshot.mjs';import {prepareAlerts} from './prepare-grafana-alerts.mjs';
export function validateObservability(){
 const read=p=>JSON.parse(readFileSync(new URL('../ops/observability/'+p,import.meta.url),'utf8'));
 const catalog=read('metric-catalog.json'),names=new Set(catalog.metrics.map(m=>m.name));assert.equal(names.size,catalog.metrics.length);
 for(const m of catalog.metrics)for(const field of ['name','unit','sourceOfTruth','aggregation','interpretation','status'])assert(m[field],m.name+':'+field);
 const dashboard=read('dashboard.json');assert.equal(dashboard.panels.length,14);assert.equal(new Set(dashboard.panels.map(p=>p.id)).size,14);
 const alerts=read('grafana-alerts.json');assert.equal(alerts.groups[0].interval,'1m');
 const rules=prepareAlerts(alerts,{folderUID:'private',metricsUID:'metrics',logsUID:'logs'});
 for(const r of rules){assert(r.isPaused);assert(r.for);assert(r.labels.severity);assert.equal(r.labels.threshold_status,'provisional');assert(r.annotations.runbook_url.includes('RUNBOOKS.md#'));assert.equal(r.condition,'C');assert(r.data.some(q=>q.refId==='C'));}
 for(const text of [...dashboard.panels.flatMap(p=>p.targets.map(t=>t.expr)),...rules.flatMap(r=>r.data.map(d=>d.model.expr||''))])for(const token of text.match(/distilled_[a-z0-9_]+/g)||[])if(!token.endsWith('_'))assert(names.has(token),'Unknown metric '+token);
 const fixtureDir=new URL('../ops/observability/fixtures/',import.meta.url);
 const fixtures=readdirSync(fixtureDir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(new URL(f,fixtureDir),'utf8')));
 const projected=projectSnapshots(fixtures);for(const key of Object.keys(projected.values))assert(names.has('distilled_'+key));
 for(const outcome of ['published','quiet','deferred','failed','blocked','pending'])assert.equal(projected.values['publication_'+outcome],1);
 // Enforce installed Wrangler's actual observability shape, not a guessed version floor.
 const schema=JSON.parse(readFileSync(new URL('../apps/worker/node_modules/wrangler/config-schema.json',import.meta.url),'utf8')).definitions.Observability;
 for(const section of ['logs','traces'])for(const key of ['enabled','head_sampling_rate','persist','destinations'])assert(schema.properties[section].properties[key],section+'.'+key);
 return {metrics:names.size,panels:dashboard.panels.length,alerts:rules.length,syntheticOutcomes:fixtures.length,validation:'static structure and fixture arithmetic; Grafana server/query execution awaits credentials'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(validateObservability()));
