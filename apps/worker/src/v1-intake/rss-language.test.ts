import {expect,it} from 'vitest';
import {prepareRssHandoff} from './rss-handoff';
import type {ConnectorBatch} from '@distilled/connectors';
import type {CollectionCoverage} from '@distilled/contracts';
const scope={feedId:'feed',feedSourceId:'fs',sourceId:'source',feedRevision:1,enabled:true,restrictions:{}};
const coverage:CollectionCoverage={id:'coverage',feedId:'feed',feedSourceId:'fs',fetchRunId:'run',fetchStartSequence:1,requestedBounds:{},observedBounds:{},status:'PARTIAL',continuationState:'NONE',createdAt:'2026-10-04T00:00:00Z'};
const batch:ConnectorBatch={connector:'rss',observations:[{upstreamId:'item',operation:'upsert',text:'Parliament approved reform.',timestampKind:'unknown',representation:'feed_text',contentCompleteness:'unknown'}],coverage:{completeness:'partial',reason:'finite_feed'},retry:{kind:'none'},telemetry:{requests:0,latencyMs:0,providerCostUsd:0}};
it('inherits verified source language into a durable payload with metadata provenance',async()=>{
 let payload:any;
 const request=await prepareRssHandoff(batch,{scope,coverage,trustedSourceLanguage:{language:'en',metadataRef:'source:verified-v1'}},{put:async(_key,body)=>{payload=JSON.parse(String(body));return {} as R2Object}});
 expect(request.observations[0].languageHint).toBe('en');expect(payload.languageResolution).toEqual({language:'en',origin:'TRUSTED_SOURCE',metadataRef:'source:verified-v1'});
});
