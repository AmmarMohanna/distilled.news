import {sha256,type SourceObservation} from '@distilled/contracts';

/** Identity is stored separately; this covers content and revision semantics. */
export const itemFingerprint=(o:SourceObservation)=>sha256(JSON.stringify([
  o.contentHash,o.representation,o.contentCompleteness,o.sourceRevision??null,o.authoritativeCurrentState
]));
