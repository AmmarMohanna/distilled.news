import {digest} from '../validation/offline';
/** Validate against the original input pin before creating a paid runtime or reusing output. */
export function assertFrozenInputs(entries:{f:{id:string};[key:string]:unknown}[],pins:{id:string;inputSha256:string}[]){
 if(entries.length!==pins.length||new Set(entries.map(e=>e.f.id)).size!==pins.length)throw Error('FROZEN_INPUT_ROSTER_CHANGED');
 for(const e of entries){const pin=pins.find(p=>p.id===e.f.id);if(!pin||digest(JSON.stringify(e.f))!==pin.inputSha256)throw Error('FROZEN_INPUT_HASH_CHANGED');}
}