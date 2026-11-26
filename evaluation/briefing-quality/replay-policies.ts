import type {ModelRequest} from '../../packages/briefing/src/model';
import {COMPACT_READER_CONTEXT} from '../../packages/briefing/src/source-bound-claims';
import {COMPACT_PROOF_WIRE} from '../../packages/briefing/src/compact-proofs';

/** Independent wire dimensions; another appended policy must not mask either. */
export function verificationWirePolicies(request:Pick<ModelRequest,'system'>){
 return {
  format:request.system.includes(COMPACT_READER_CONTEXT)?'compact-v1':'original',
  proofFormat:request.system.includes(COMPACT_PROOF_WIRE)?'compact-proofs-v1':'original'
 };
}
