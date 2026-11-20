import{expect,it}from'vitest';
import{verificationWirePolicies}from'./replay-policies';
import{COMPACT_READER_CONTEXT}from'../../packages/briefing/src/source-bound-claims';
import{COMPACT_PROOF_WIRE}from'../../packages/briefing/src/compact-proofs';
it.each([
 ['original','Base verifier', 'original','original'],
 ['context only','Base verifier'+COMPACT_READER_CONTEXT,'compact-v1','original'],
 ['proof only','Base verifier'+COMPACT_PROOF_WIRE,'original','compact-proofs-v1'],
 ['combined','Base verifier'+COMPACT_READER_CONTEXT+COMPACT_PROOF_WIRE,'compact-v1','compact-proofs-v1'],
])('classifies independent request policies: %s',(_label,system,format,proofFormat)=>expect(verificationWirePolicies({system})).toEqual({format,proofFormat}));
