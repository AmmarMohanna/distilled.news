import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as reference from './metrics.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('./metric-catalog.json',import.meta.url),'utf8'));
test('catalog definitions are unique, explicit about populations and evidence, and distinguish planned metrics',()=>{
  assert.equal(new Set(catalog.metrics.map(m=>m.id)).size,catalog.metrics.length);
  assert.ok(catalog.metrics.length>=20);
  for(const m of catalog.metrics){
    for(const key of ['id','unit','population','definition','evidence'])assert.ok(typeof m[key]==='string'&&m[key].trim(),m.id+':'+key);
    assert.ok(['protocol_only','arithmetic_only'].includes(m.implementation));
    if(m.referenceArithmetic!==null)assert.equal(typeof reference[m.referenceArithmetic],'function',m.id);
    if(m.implementation==='arithmetic_only')assert.ok(m.referenceArithmetic,m.id);
  }
});
test('catalog cannot present arithmetic as a completed live benchmark, independent quality labels or device delivery',()=>{
  assert.equal(catalog.status,'design_and_offline_reference_arithmetic_only');
  assert.equal(catalog.commonRules.collectorStatus,'not_implemented');
  assert.equal(catalog.commonRules.qualityLabelsStatus,'not_available_from_this_workstream');
  assert.equal(catalog.metrics.find(m=>m.id==='publication_to_device_receipt').implementation,'protocol_only');
  assert.ok(catalog.requiredSlices.includes('language'));
});
