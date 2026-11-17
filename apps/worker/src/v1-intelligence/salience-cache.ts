import {salienceResultSchema,type SalienceResult} from './salience';
/** Evaluation rows contain report columns outside the scorer contract. Validate
 * the canonical result explicitly; never relax the live provider schema. */
export function cachedSalienceResult(row:SalienceResult):SalienceResult {
 const {components,provenance,usage,fallback,confidence,judgment}=row;
 return salienceResultSchema.parse({components,provenance,usage,fallback,confidence,judgment});
}
