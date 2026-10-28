import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const evidence=JSON.parse(readFileSync(new URL('./fixtures/retained-verifier-evaluation.json',import.meta.url),'utf8'));
// Offline accounting of retained semantic judgments; no model calls and no claim
// that deterministic code can decide whether a news assertion is true.
function score(record:any){
 const results=record.output.results;
 if(!Array.isArray(results)||results.length!==record.expected.length||new Set(results.map((r:any)=>r.i)).size!==results.length||results.some((r:any)=>!record.expected.some((e:any)=>e.i===r.i)||!['ok','fix','drop','redundant'].includes(r.verdict)))return {invalid:true};
 let falseApprovals=0,falseRejections=0,reviewOnly=0;
 for(const expected of record.expected){const actual=results.find((r:any)=>r.i===expected.i);if(expected.verdict==='review'){reviewOnly++;continue;}if(expected.verdict==='ok'&&actual.verdict!=='ok')falseRejections++;if(expected.verdict==='fix'&&actual.verdict==='ok')falseApprovals++;}
 return {invalid:false,falseApprovals,falseRejections,reviewOnly};
}
it('retained mini judgments reveal false approvals rather than counting JSON validity as quality',()=>{
 const record=evidence.records.find((r:any)=>r.name==='isolated-dev-errors-gpt-4.1-mini');
 expect(score(record)).toMatchObject({invalid:false,falseApprovals:2});
});
it('cannot give a missing, duplicate or wrong-item response a clean score',()=>{
 const record=evidence.records[0];for(const results of [[],[{i:0,verdict:'ok'},{i:0,verdict:'ok'}],[{i:0,verdict:'ok'},{i:99,verdict:'ok'}]])expect(score({...record,output:{results}})).toEqual({invalid:true});
});
it('does not treat disputed labels as verified factual accuracy',()=>{
 const record=evidence.records.find((r:any)=>r.name==='isolated-dev-valid-gpt-4.1-mini');expect(score(record)).toMatchObject({reviewOnly:1,falseRejections:0});
 expect(evidence.labelAuthority).toContain('not human gold');
});
it('all comparison records preserve exact request hashes and confirmed measured charges',()=>{
 for(const record of evidence.records){expect(record.requestSha256).toMatch(/^[a-f0-9]{64}$/);expect(record.actualCostUsd).toBeGreaterThanOrEqual(0);expect(record.latencyMs).toBeGreaterThan(0);expect(score(record).invalid).toBe(false);}
});
