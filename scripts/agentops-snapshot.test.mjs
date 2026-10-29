import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectSnapshots,prometheus} from './agentops-snapshot.mjs';
const page=(view,items=[],summary)=>({schemaVersion:'pipeline-trace-v1',feed:{id:'private-feed'},window:{start:'2026-10-29T00:00:00Z',end:'2026-10-29T01:00:00Z'},view,items,summary,page:{total:items.length,nextCursor:null}});
test('deduplicates replay and uses request result, never diagnostic SUCCESS as publication',()=>{
 const p=page('overview',[],{publication:{briefingRequest:{id:'r',state:'DONE',result:'DEFERRED',diagnosticState:'SUCCESS'}}});
 const result=projectSnapshots([p,p]);assert.equal(result.values.publication_deferred,1);assert.equal(result.values.publication_published,0);
 assert(!prometheus(result).includes('private-feed'));
});
test('unknown costs stay missing; operations dedup by feed/kind/id and conflicting replay fails',()=>{
 const op={id:'o',recordKind:'semantic_intents',phase:'EDITOR',reportedCostUsd:null,providerReportedCostUsd:null,heldExposureUsd:2,latencyMs:null};
 const p=page('operations',[op]);const result=projectSnapshots([p,p]);
 assert.equal(result.values.held_exposure_usd,2);assert.equal(result.values.settled_cost_usd,undefined);assert.equal(result.values.unknown_cost_operations,1);
 assert.throws(()=>projectSnapshots([p,page('operations',[{...op,heldExposureUsd:3}])]),/CONFLICT/);
});
test('partial or unscoped pages fail closed and emitted output contains no content',()=>{
 const p=page('operations',[]);p.page.nextCursor='cursor';assert.throws(()=>projectSnapshots([p]),/INCOMPLETE/);
 assert.throws(()=>projectSnapshots([{...page('overview'),window:null}]),/WINDOW/);
 const r=projectSnapshots([page('operations',[{id:'o',recordKind:'model_intents',phase:'SECRET',reportedCostUsd:0,tokensIn:2,rawResponse:'secret'}])]);
 assert(!prometheus(r).includes('secret'));assert.equal(r.values.settled_cost_usd,0);
});
test('published timestamp proxy retains negative-clock diagnostic; missing request is unknown',()=>{
 const p=page('overview',[],{publication:{briefingRequest:null}});
 assert.equal(projectSnapshots([p]).values.publication_unknown,1);
 const a=page('overview',[],{publication:{briefingRequest:{id:'a',state:'DONE',result:'PUBLISHED'},recordedEditions:[{id:'e',scheduledFor:'2026-10-29T01:00:00Z',publishedAt:'2026-10-29T00:59:00Z'}]}});
 assert.throws(()=>projectSnapshots([a]),/NEGATIVE/);
});
