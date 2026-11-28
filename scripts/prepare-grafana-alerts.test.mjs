import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepareAlerts,prepareProductionAlerts} from './prepare-grafana-alerts.mjs';
test('API conversion preserves paused rules and explicitly binds private folder/datasources',()=>{
 const input=JSON.parse(readFileSync(new URL('../ops/observability/grafana-alerts.json',import.meta.url),'utf8'));
 assert.throws(()=>prepareAlerts(input,{}));
 const rules=prepareAlerts(input,{folderUID:'private',metricsUID:'metrics',logsUID:'logs'});
 assert.equal(rules.length,13);assert(rules.every(r=>r.isPaused&&r.folderUID==='private'&&r.ruleGroup==='distilled-provisional'));
 assert(rules.flatMap(r=>r.data).some(d=>d.datasourceUid==='logs'));assert(rules.flatMap(r=>r.data).some(d=>d.datasourceUid==='metrics'));
 assert(!JSON.stringify(rules).includes('distilled-metrics'));assert(input.groups[0].rules[0].data[0].datasourceUid==='distilled-metrics');
});

test('production preparation emits six independent paused rules with fully scoped metrics',()=>{
 const read=file=>JSON.parse(readFileSync(new URL('../ops/observability/'+file,import.meta.url),'utf8'));
 const provisional=read('grafana-alerts.json'),technical=read('technical-alerts.json');
 const before=JSON.stringify({provisional,technical});
 const rules=prepareProductionAlerts(provisional,technical,{metricsUID:'cloud-prom'});
 assert.deepEqual(rules.map(rule=>rule.uid),[
  'distilled-prod-evaluator-progress','distilled-prod-deployment-observer','distilled-prod-uncertain',
  'distilled-prod-overdue-briefings','distilled-prod-source-no-recent-success','distilled-prod-snapshot-stale'
 ]);
 for(const rule of rules){
  assert.equal(rule.folderUID,'distilled-production-ops');
  assert.equal(rule.ruleGroup,'distilled-production-health');
  assert.equal(rule.isPaused,true);
  assert.equal(rule.labels.environment,'production');
  assert.equal(rule.noDataState,'NoData');
  const query=rule.data.find(value=>value.refId==='A');
  assert.equal(query.datasourceUid,'cloud-prom');
  const metrics=query.model.expr.match(/\bdistilled_[a-z0-9_]+/g);
  const selectors=query.model.expr.match(/\bdistilled_[a-z0-9_]+\{environment="production"[^}]*\}/g);
  assert.equal(selectors.length,metrics.length);
  for(const selector of selectors.filter(value=>value.startsWith('distilled_eval_')))assert.match(selector,/review_protocol="atomic-development-review-v2"/);
 }
 assert.match(rules[3].data[0].model.expr,/distilled_deployment_pending_briefings/);
 assert.match(rules[5].data[0].model.expr,/\[30m\]/);
 assert.deepEqual(rules[5].data[1].model.conditions[0].evaluator.params,[600]);
 for(const rule of [rules[2],rules[4]])assert.match(rule.annotations.description,/Activation blocked/);
 assert.equal(JSON.stringify({provisional,technical}),before);
 assert.throws(()=>prepareProductionAlerts(provisional,technical,{metricsUID:'bad/uid'}),/EXPLICIT_DATASOURCE/);
});
test('staging snapshot alerts respect the approved cadence without changing generic defaults',()=>{
 const input=JSON.parse(readFileSync(new URL('../ops/observability/grafana-alerts.json',import.meta.url),'utf8')),before=JSON.stringify(input),options={folderUID:'private',metricsUID:'metrics',logsUID:'logs'};
 const rules=prepareAlerts(input,{...options,snapshotCadenceMinutes:15});
 for(const uid of ['distilled-snapshot-stale','distilled-snapshot-observer'])assert.match(rules.find(r=>r.uid===uid).data[0].model.expr,/last_over_time\(.+\[20m\]\)/);
 assert.deepEqual(rules.find(r=>r.uid==='distilled-snapshot-stale').data[1].model.conditions[0].evaluator.params,[1200]);
 assert.deepEqual(prepareAlerts(input,options).find(r=>r.uid==='distilled-snapshot-stale').data[1].model.conditions[0].evaluator.params,[300]);
 assert.equal(JSON.stringify(input),before);assert(rules.every(r=>r.isPaused));
 assert.throws(()=>prepareAlerts(input,{...options,snapshotCadenceMinutes:0}),/CADENCE/);
});
