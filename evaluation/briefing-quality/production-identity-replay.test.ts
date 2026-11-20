import fs from 'node:fs';
import {expect,it} from 'vitest';
import {groundedReview} from './worker/src/grounding';
import {metrics} from './worker/src/protocol';
import {auditLegacyArabicClaimInventory as auditClaimInventory} from './worker/src/claim-inventory';
const dir='evaluation/briefing-quality/fixtures/production-identity';
for(const file of fs.readdirSync(dir)){
 const f=JSON.parse(fs.readFileSync(`${dir}/${file}`,'utf8'));
 it(`replays original validation outcome ${f.provenance.expected} (${file.slice(0,8)})`,()=>{
  const before=structuredClone(f);
  if(f.provenance.expected==='accepted'){
   const r=groundedReview(f.raw,f.c,f.d);
   expect(metrics(r,f.d,f.c).claimSupport.value).toBe(1);
   // The bad name WAS extracted. Completeness alone cannot fix this false pass.
   expect(r.claims[0].text).toContain('نجيب سلام');
   expect(auditClaimInventory(f.c,r)).toMatchObject({unassessedIdentities:[],identityBindings:[expect.objectContaining({code:'ARABIC_NAME_UNBOUND'})]});
  }else expect(()=>groundedReview(f.raw,f.c,f.d)).toThrow(f.provenance.expected);
  expect(f).toEqual(before);
 });
}
