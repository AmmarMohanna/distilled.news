import {hashContent,HandoffError,type SourceObservation} from '@distilled/contracts';
import {R2SourcePayloadStore} from '@distilled/connectors';
import {z} from 'zod';

const payloadSchema=z.object({body:z.string().max(512000),title:z.string().optional(),canonicalUrl:z.string().optional(),publishedAt:z.string().optional(),language:z.string().optional(),representation:z.string(),contentCompleteness:z.string(),publisherId:z.string().optional(),
 sourceTitle:z.string().optional(),excerpt:z.string().optional(),author:z.string().optional(),updatedAt:z.string().optional(),firstSeenAt:z.string().optional()}).strict();
/** Connector content-addressed references are scoped capabilities, verified at every read. */
export async function readConnectorPayload(bucket:R2Bucket,o:SourceObservation) {
 if(!o.suppliedPayloadRef?.startsWith('source-payloads/'))return undefined;
 const bytes=await new R2SourcePayloadStore(bucket).get({feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId},o.suppliedPayloadRef);
 if(bytes.byteLength>512000)throw new HandoffError('INVALID_REQUEST');
 const p=payloadSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
 if(p.representation!==o.representation||p.contentCompleteness!==o.contentCompleteness||p.canonicalUrl!==o.canonicalUrl||(p.publisherId!==undefined&&p.publisherId!==o.publisherId)||await hashContent({representation:o.representation,title:p.title,body:p.body})!==o.contentHash)throw new HandoffError('INVALID_REQUEST');
 return {title:p.title,body:p.body,language:p.language,publishedAt:p.publishedAt};
}
