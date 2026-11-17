import type {StateSlot} from './semantic-state';
import {equivalentFact} from './editorial';
import {numbers,numberSequence,maskQuantities} from './fidelity';
/** Equal skeletons mean the text between values is identical, so the i-th value of each side fills the
 * same slot. Comparing positionally (never as a sorted set) keeps entity/attribute association: values
 * exchanged between two entities are a change even though the multiset of numbers is unchanged. */
const valuesDiffer=(previous:string,current:string)=>{const a=numberSequence(previous),b=numberSequence(current);return a.length!==b.length||a.some((v,i)=>v!==b[i])};
const MARKER=/^(may|might|could|will|not|never|alleged|confirmed|planned|cancelled|retracted)$/,STATUS=/^(planned|cancelled|retracted)$/;
/** Marker-free proposition skeleton plus each epistemic marker at its position in that skeleton. Equal
 * skeletons mean the surrounding words are identical, so a marker at the same position qualifies the same
 * claim in both texts: swapping may/will between two entities is a change even though the marker multiset is not. */
function profile(text:string){
 const words:string[]=[],markers:[number,string][]=[];
 const prepared=maskQuantities(text).replace(/\b(raised|raising)\b/g,'raise').replace(/\b(launched|launching)\b/g,'launch').replace(/\b(the|a|an)\b/g,'').replace(/[.!?]/g,'');
 for(const token of prepared.split(/\s+/).filter(Boolean)){
  const bare=token.replace(/[,;:]+$/,'');
  if(MARKER.test(bare)){markers.push([words.length,['may','might','could'].includes(bare)?'possible':bare]);if(STATUS.test(bare))words.push('<status>')}
  else words.push(token);
 }
 return {skeleton:words.join(' '),markers:JSON.stringify(markers)};
}
/** A cheap positive proof only. Unmatched syntax is uncertainty, not protection.
 * Align the same proposition skeleton before comparing values/epistemic state.
 * Semantic effects/structured slots remain the authoritative richer path. */
export function provenMaterialDelta(previous:string,current:string):boolean {
 if(equivalentFact(previous,current))return false;
 const before=profile(previous),after=profile(current);
 if(before.skeleton!==after.skeleton)return false;
 return valuesDiffer(previous,current)||before.markers!==after.markers||/\braised\b/i.test(previous)!==/\braised\b/i.test(current)||/\blaunched\b/i.test(previous)!==/\blaunched\b/i.test(current);
}

/** Same-entity/attribute/as-of slots are already aligned by the caller. Numeric
 * notation/case differences are not value changes; unknown textual values need
 * a semantic effect rather than raw string inequality granting protection. */
export function provenSlotValueDelta(previous:string,current:string):boolean {
 const before=[...numbers(previous)].sort(),after=[...numbers(current)].sort();
 if(before.length&&after.length)return JSON.stringify(before)!==JSON.stringify(after);
 const status=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[.!?]/g,'').trim();
 const states=new Set(['planned','cancelled','approved','rejected','launched','withdrawn','retracted','confirmed','alleged']);
 return states.has(status(previous))&&states.has(status(current))&&status(previous)!==status(current);
}

/** The supported entity/attribute/time alignment is checked by the caller.
 * An attribution string changing is not itself evidence of an epistemic change;
 * substantive actor/confirmation changes remain the semantic judgment's job. */
export function provenSlotMeaningDelta(previous:Pick<StateSlot,'value'|'certainty'|'attribution'>,current:Pick<StateSlot,'value'|'certainty'|'attribution'>):boolean {
 return provenSlotValueDelta(previous.value,current.value)||previous.certainty.kind!==current.certainty.kind;
}

/** Several current slots sharing the prior slot's entity/attribute/as-of make alignment ambiguous: an
 * unchanged aligned value may remain, so no deterministic change is proven and the semantic layer decides. */
export function alignedSlotDelta(previous:Pick<StateSlot,'value'|'certainty'|'attribution'>,aligned:Pick<StateSlot,'value'|'certainty'|'attribution'>[]):boolean {
 return aligned.length===1&&provenSlotMeaningDelta(previous,aligned[0]);
}
