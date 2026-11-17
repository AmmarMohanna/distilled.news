import {HandoffError} from '@distilled/contracts';
import {z} from 'zod';
export const languageResolutionSchema=z.object({language:z.string().min(1).optional(),origin:z.enum(['ITEM_DECLARED','FEED_DECLARED','TRUSTED_SOURCE','UNKNOWN']),metadataRef:z.string().min(1).optional()}).strict().refine(v=>v.origin==='UNKNOWN'?v.language===undefined:normalizeLanguage(v.language)!==undefined,'Language origin must agree with the established language').refine(v=>v.origin!=='TRUSTED_SOURCE'||Boolean(v.metadataRef),'Inherited language requires a trusted metadata reference');

export type LanguageOrigin='ITEM_DECLARED'|'FEED_DECLARED'|'TRUSTED_SOURCE'|'UNKNOWN';
export interface LanguageResolution {language?:string;origin:LanguageOrigin;metadataRef?:string}
export function normalizeLanguage(value?:string):string|undefined {
 const text=value?.trim(),primary=text?.split(/[-_]/)[0].toLowerCase();
 return text && /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(text) && primary!=='und'?primary:undefined;
}
/** Feed metadata here means the source feed declaration, never briefing output language. */
export function resolveLanguage(input:{item?:string;feed?:string;trustedSource?:{language:string;metadataRef:string}}):LanguageResolution {
 const item=normalizeLanguage(input.item);if(item)return {language:item,origin:'ITEM_DECLARED'};
 const feed=normalizeLanguage(input.feed);if(feed)return {language:feed,origin:'FEED_DECLARED'};
 const source=normalizeLanguage(input.trustedSource?.language);
 if(source && input.trustedSource?.metadataRef)return {language:source,origin:'TRUSTED_SOURCE',metadataRef:input.trustedSource.metadataRef};
 return {origin:'UNKNOWN'};
}
export class SynthesisCompatibilityError extends HandoffError {
 constructor(readonly reason:'TRANSLATION_REQUIRED'|'EXTRACTIVE_CAPACITY_UNSUPPORTED'){super('INVALID_REQUEST');this.message=reason}
}
export function extractiveLanguageCompatibility(evidence?:string,output?:string):'SAME_LANGUAGE'|'UNKNOWN'|'TRANSLATION_REQUIRED' {
 const from=normalizeLanguage(evidence),to=normalizeLanguage(output);
 return !from?'UNKNOWN':from===to?'SAME_LANGUAGE':'TRANSLATION_REQUIRED';
}
