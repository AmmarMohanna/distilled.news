import {describe,it,expect} from 'vitest';
import {assertFrozenInputs} from './engine-value/frozen-input';
import {digest} from './validation/offline';
describe('frozen paid research inputs',()=>{
 const f={id:'case',input:{articles:[{id:'s',text:'Original source'}]}};const pins=[{id:f.id,inputSha256:digest(JSON.stringify(f))}];
 it('accepts exact evidence and rejects changes under the same identity',()=>{expect(()=>assertFrozenInputs([{f}],pins)).not.toThrow();expect(()=>assertFrozenInputs([{f:{...f,input:{articles:[]}}}],pins)).toThrow('FROZEN_INPUT_HASH_CHANGED');});
 it('rejects missing and duplicate cases before any runtime exists',()=>{expect(()=>assertFrozenInputs([],pins)).toThrow('FROZEN_INPUT_ROSTER_CHANGED');expect(()=>assertFrozenInputs([{f},{f}],pins)).toThrow('FROZEN_INPUT_ROSTER_CHANGED');});
});