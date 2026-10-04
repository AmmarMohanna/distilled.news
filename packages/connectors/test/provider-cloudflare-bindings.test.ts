import { describe,it,expect,vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiptFixture } from '@distilled/contracts';
import { SOURCE_STORAGE_SCHEMA,sourceSqlFromD1,R2SourcePayloadStore } from '../src/source-runtime/storage';
import { PROVIDER_SOURCE_SCHEMA,D1ProviderSourceRepository } from '../src/source-runtime/provider-storage';
import { PROVIDER_BUDGET_SCHEMA,DurableProviderHttp } from '../src/source-runtime/provider-http';
import { FallbackSourceCollector } from '../src/source-runtime/provider-collector';
import type { SourceProvider } from '../src/source-runtime/provider-types';

describe('multi-source runtime on local Cloudflare bindings',()=>{
  it('fences concurrent paid dispatch and durably replays a provider handoff after restart',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'distilled-provider-'));
    const options={modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-06-01',
      d1Databases:{DB:'provider-db'},r2Buckets:['PAYLOADS'],d1Persist:join(directory,'d1'),r2Persist:join(directory,'r2')};
    let runtime=new Miniflare(options);
    const scope={feedId:'feed',feedSourceId:'fs',sourceId:'x'};
    const input={scope,runId:'run',source:{family:'x_profile' as const,locator:'NASA'},requestedBounds:{},limit:2};
    try{
      let db=await runtime.getD1Database('DB');await db.exec((SOURCE_STORAGE_SCHEMA+PROVIDER_SOURCE_SCHEMA+PROVIDER_BUDGET_SCHEMA).replace(/\n/g,' '));
      let sql=sourceSqlFromD1(db),payloads=new R2SourcePayloadStore(await runtime.getR2Bucket('PAYLOADS'));
      const dispatch=vi.fn(async()=>new Response('{"ok":true}'));
      const paid=new DurableProviderHttp(sql,payloads,dispatch);await paid.configureLimit('alternative',1);
      const results=await Promise.allSettled(Array.from({length:8},()=>paid.request(scope,'same-operation','alternative',0.2,'https://api.twitterapi.io/twitter/tweets',{})));
      expect(dispatch).toHaveBeenCalledTimes(1);expect(results.some(r=>r.status==='fulfilled')).toBe(true);
      const budget=await db.prepare('SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id=?').bind('alternative').first<{reserved_usd:number}>();
      expect(budget?.reserved_usd).toBeCloseTo(0.2);
      const fetch=vi.fn(async()=>({items:[{sourceItemKey:'x:1',upstreamId:'1',body:'Text',representation:'SOCIAL_POST' as const,contentCompleteness:'UNKNOWN' as const,identityValid:true}],
        raw:new TextEncoder().encode('raw'),requests:1,latencyMs:1,providerCostUsd:null}));
      const provider:SourceProvider={id:'primary',families:['x_profile'],fetch};
      const first=new FallbackSourceCollector(new D1ProviderSourceRepository(sql),payloads,{acceptBatch:async()=>{throw new Error('receipt lost');}},[provider]);
      await expect(first.collect(input,['primary'])).rejects.toThrow('receipt lost');
      await runtime.dispose();runtime=new Miniflare(options);
      db=await runtime.getD1Database('DB');sql=sourceSqlFromD1(db);payloads=new R2SourcePayloadStore(await runtime.getR2Bucket('PAYLOADS'));
      const second=new FallbackSourceCollector(new D1ProviderSourceRepository(sql),payloads,{acceptBatch:async b=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true,receipts:b.observations.map(receiptFixture)})},[provider]);
      const result=await second.collect(input,['primary']);expect(result.state).toBe('HANDED_OFF');expect(fetch).toHaveBeenCalledTimes(1);
    }finally{await runtime.dispose();rmSync(directory,{recursive:true,force:true});}
  },30000);
});
