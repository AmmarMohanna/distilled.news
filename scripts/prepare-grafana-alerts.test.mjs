import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepareAlerts} from './prepare-grafana-alerts.mjs';
test('API conversion preserves paused rules and explicitly binds private folder/datasources',()=>{
 const input=JSON.parse(readFileSync(new URL('../ops/observability/grafana-alerts.json',import.meta.url),'utf8'));
 assert.throws(()=>prepareAlerts(input,{}));
 const rules=prepareAlerts(input,{folderUID:'private',metricsUID:'metrics',logsUID:'logs'});
 assert.equal(rules.length,11);assert(rules.every(r=>r.isPaused&&r.folderUID==='private'&&r.ruleGroup==='distilled-provisional'));
 assert(rules.flatMap(r=>r.data).some(d=>d.datasourceUid==='logs'));assert(rules.flatMap(r=>r.data).some(d=>d.datasourceUid==='metrics'));
 assert(!JSON.stringify(rules).includes('distilled-metrics'));assert(input.groups[0].rules[0].data[0].datasourceUid==='distilled-metrics');
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
