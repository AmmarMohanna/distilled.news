import {expect,it} from 'vitest';
import {extractClaimMentions,assertClaimSpan} from './claims';
const revision={id:'revision',feedId:'feed',contentHash:'hash',body:'The result is not confirmed. Officials may announce it tomorrow.',acceptedAt:'2026-10-04T00:00:00Z'} as any;
it('an explicit lack of confirmation cannot be normalized into confirmed certainty',async()=>{
 const {mentions}=await extractClaimMentions(revision);
 const unconfirmed=mentions.find(m=>m.sourceText.includes('not confirmed'))!;expect(unconfirmed.certainty.kind).toBe('ALLEGED');expect(unconfirmed.certainty.hedges).toContain('not confirmed');
});
it('rejects an out-of-bounds span even when substring clipping returns the same source text',async()=>{
 const {mentions}=await extractClaimMentions({...revision,body:'A result was announced.'});
 expect(()=>assertClaimSpan({...mentions[0],span:{...mentions[0].span,end:10000}},{...revision,body:'A result was announced.'})).toThrow('SCOPE_DENIED');
});
