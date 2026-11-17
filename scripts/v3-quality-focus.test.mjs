import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const summary=JSON.parse(readFileSync(new URL('../benchmarks/results/v3-quality-focus/summary.json',import.meta.url),'utf8'));
test('recorded quality comparison binds four identical-input pairs and reconciles eight settled calls',()=>{
 assert.equal(summary.calls,8);assert.equal(summary.unsettled,0);assert.equal(summary.records.length,8);assert.ok(summary.actualUsd<=summary.maximumApprovedUsd);assert.ok(summary.conservativeReservationsUsd<=summary.maximumApprovedUsd);
 for(let i=0;i<8;i+=2){assert.equal(summary.records[i].fixedInputHash,summary.records[i+1].fixedInputHash);assert.equal(summary.records[i].model,summary.records[i+1].model);assert.notEqual(summary.records[i].requestHash,summary.records[i+1].requestHash)}
 assert.ok(Math.abs(summary.records.reduce((s,r)=>s+r.costUsd,0)-summary.actualUsd)<1e-10);
});
test('recorded interpretation rejects unsuccessful candidates without claiming a single brevity pair qualifies',()=>{
 assert.match(summary.outcomes.selection,/^REJECT/);assert.match(summary.outcomes.update,/^REJECT/);assert.match(summary.outcomes.brevity,/NOT_QUALIFIED/);assert.equal(summary.productionChanges,false);
 assert.equal(summary.records.find(r=>r.id==='update-development-candidate').invalidUpdateRefCount,1);
});
test('trial runner cannot create its own approval or silently enable model retries',()=>{
 const source=readFileSync(new URL('../benchmarks/quality-focus/run.ts',import.meta.url),'utf8');
 assert.ok(source.includes("if(!existsSync(dir+approvalName))throw Error('EXPLICIT_APPROVAL_FILE_REQUIRED')"));assert.ok(source.includes('retries:0'));assert.ok(!source.includes('save(approvalName,'));
});
