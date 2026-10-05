import { describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { receiptFixture } from '@distilled/contracts';
import { sourceRepositoryFromD1, R2SourcePayloadStore, SOURCE_STORAGE_SCHEMA } from '../src/source-runtime/storage';
import { RssSourceCollector } from '../src/source-runtime/rss';

describe('RSS with local Cloudflare D1/R2 bindings',()=>{
  it('persists across runtime restart and allocates unique sequences concurrently',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'distilled-cloudflare-rss-'));
    const options={modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-06-01',
      d1Databases:{DB:'source-db'},r2Buckets:['PAYLOADS'],d1Persist:join(directory,'d1'),r2Persist:join(directory,'r2')};
    let runtime=new Miniflare(options);
    const scope={feedId:'feed',feedSourceId:'source-link',sourceId:'rss'};
    try {
      let db=await runtime.getD1Database('DB');
      await db.exec(SOURCE_STORAGE_SCHEMA.replace(/\n/g,' '));
      let repository=sourceRepositoryFromD1(db);
      let payloads=new R2SourcePayloadStore(await runtime.getR2Bucket('PAYLOADS'));
      const runs=await Promise.all(Array.from({length:8},(_,i)=>repository.allocate(scope,`run-${i}`,'config','2026-10-04T08:00:00.000Z')));
      expect(new Set(runs.map(r=>r.sequence)).size).toBe(8);
      expect(runs.map(r=>r.sequence).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8]);
      const value=await payloads.put(scope,new TextEncoder().encode('durable'),'text/plain');
      await runtime.dispose(); runtime=new Miniflare(options);
      db=await runtime.getD1Database('DB'); repository=sourceRepositoryFromD1(db);
      payloads=new R2SourcePayloadStore(await runtime.getR2Bucket('PAYLOADS'));
      expect((await repository.allocate(scope,'run-0','config','2026-10-04T09:00:00.000Z')).sequence).toBe(runs[0].sequence);
      expect(new TextDecoder().decode(await payloads.get(scope,value.ref))).toBe('durable');
      const collector=new RssSourceCollector(repository,payloads,{get:async()=>({status:200,headers:{etag:'"local"'},
        bytes:new TextEncoder().encode('<rss><channel><item><guid>one</guid><title>Title</title><description>Body</description></item></channel></rss>'),
        telemetry:{requests:1,latencyMs:1,providerCostUsd:0}})},
        {acceptBatch:async batch=>({contractVersion:batch.contractVersion,handoffId:batch.handoffId,durable:true,receipts:batch.observations.map(receiptFixture)})});
      expect((await collector.collect({scope,url:'https://publisher.example/rss',runId:'integration-run'})).checkpoint).toBe('ADVANCED');
      expect((await repository.checkpoint(scope))?.etag).toBe('"local"');
    } finally { await runtime.dispose(); rmSync(directory,{recursive:true,force:true}); }
  },30_000);
});
