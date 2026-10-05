import { describe, it, expect, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { HandoffError, receiptFixture, type CandidateIntakePort, type ConnectorHandoffRequest } from '@distilled/contracts';
import { D1SourceRepository, R2SourcePayloadStore, SOURCE_STORAGE_SCHEMA, type SqlDatabase, type SqlStatement, type ObjectBucket } from '../src/source-runtime/storage';
import { RssSourceCollector } from '../src/source-runtime/rss';
import { BoundedFeedHttp } from '../src/source-runtime/http';
import { normalizeRssSnapshot } from '../src/source-runtime/rss-normalize';
import { D1RssPollScheduler, RSS_POLL_SCHEMA } from '../src/source-runtime/scheduler';
import type { FeedHttpPort, RssRequest } from '../src/source-runtime/ports';

const directories: string[] = [], databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); for (const dir of directories.splice(0)) rmSync(dir,{recursive:true,force:true}); });
class SqliteBinding implements SqlDatabase {
  readonly db: DatabaseSync;
  constructor(path:string) { this.db = new DatabaseSync(path); databases.push(this.db); this.db.exec(SOURCE_STORAGE_SCHEMA); }
  prepare(sql:string): SqlStatement {
    let values: any[] = [];
    const execute = () => this.db.prepare(sql);
    const statement: SqlStatement = {
      bind: (...args) => { values=args; return statement; },
      first: async <T>() => (execute().get(...values) ?? null) as T|null,
      run: async () => execute().run(...values)
    };
    return statement;
  }
  async batch(statements:SqlStatement[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try { for (const s of statements) await s.run(); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
class FileBucket implements ObjectBucket {
  constructor(private root:string) {}
  async put(key:string,bytes:Uint8Array) {
    const path=join(this.root,key); mkdirSync(dirname(path),{recursive:true});
    try { writeFileSync(path,bytes,{flag:'wx'}); } catch(e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
  async get(key:string) {
    try { const bytes=readFileSync(join(this.root,key)); return {arrayBuffer:async()=>Uint8Array.from(bytes).buffer}; }
    catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
}
const scope={feedId:'feed-1',feedSourceId:'fs-1',sourceId:'source-1'};
const timestamp='2026-10-04T08:00:00.000Z';
const input:RssRequest={scope,runId:'run-1',url:'https://publisher.example/rss',maxItems:2};
const item=(id:string,body='Body')=>`<item><guid>${id}</guid><title>Title ${id}</title><link>https://publisher.example/${id}</link><description>${body}</description><pubDate>Sun, 04 Oct 2026 07:00:00 GMT</pubDate></item>`;
const xml=(rows:string)=>`<rss version="2.0"><channel><title>Feed</title>${rows}</channel></rss>`;
function setup(feed=xml(item('one'))) {
  const dir=mkdtempSync(join(tmpdir(),'distilled-rss-')); directories.push(dir);
  const db=new SqliteBinding(join(dir,'state.sqlite')), repository=new D1SourceRepository(db);
  const payloads=new R2SourcePayloadStore(new FileBucket(join(dir,'objects')));
  const http:FeedHttpPort={get:vi.fn(async()=>({status:200,headers:{etag:'"v1"'},bytes:new TextEncoder().encode(feed),telemetry:{requests:1,latencyMs:4,providerCostUsd:0}}))};
  const accepted:ConnectorHandoffRequest[]=[];
  const intake:CandidateIntakePort={acceptBatch:vi.fn(async b=>{accepted.push(b);return {contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:b.observations.map(receiptFixture)};})};
  const collector=new RssSourceCollector(repository,payloads,http,intake,()=>timestamp);
  return {dir,db,repository,payloads,http,intake,accepted,collector};
}

describe('durable RSS source handoff (SQLite SQL and filesystem payload surrogate)',()=>{
  it('persists observations and payloads before intake; declares excerpts honestly',async()=>{
    const s=setup();
    s.intake.acceptBatch=async batch=>{
      expect(await s.repository.loadBatch(scope,batch.handoffId)).toBeDefined();
      const payload=JSON.parse(new TextDecoder().decode(await s.payloads.get(scope,batch.proposals[0].suppliedPayloadRef!)));
      expect(payload.body).toBe('Body');
      expect(batch.observations[0]).toMatchObject({upstreamId:'one',publisherId:'publisher.example',representation:'ARTICLE_EXCERPT',authoritativeCurrentState:false});
      expect(batch.proposals[0].payloadHash).not.toBe(batch.observations[0].contentHash);
      return {contractVersion:batch.contractVersion,handoffId:batch.handoffId,durable:true as const,receipts:batch.observations.map(receiptFixture)};
    };
    const result=await s.collector.collect(input);
    expect(result.checkpoint).toBe('ADVANCED'); expect(result.coverage.status).toBe('PARTIAL');
    expect((await s.repository.checkpoint(scope))?.etag).toBe('"v1"');
  });
  it('resumes capped batches from the same durable snapshot without refetching',async()=>{
    const s=setup(xml(item('one')+item('two')+item('three')));
    const first=await s.collector.collect(input);
    expect(first.nextOffset).toBe(2); expect(await s.repository.checkpoint(scope)).toBeUndefined();
    const second=await new RssSourceCollector(new D1SourceRepository(new SqliteBinding(join(s.dir,'state.sqlite'))),
      new R2SourcePayloadStore(new FileBucket(join(s.dir,'objects'))),s.http,s.intake,()=>timestamp).collect(input,2);
    expect(second.checkpoint).toBe('ADVANCED'); expect(s.http.get).toHaveBeenCalledTimes(1);
    expect(s.accepted.at(-1)?.observations[0].upstreamId).toBe('three');
  });
  it('uncertain handoff retries the exact saved batch after restart',async()=>{
    const s=setup(); let original='';
    s.intake.acceptBatch=vi.fn(async b=>{original=JSON.stringify(b);throw new Error('response lost');});
    await expect(s.collector.collect(input)).rejects.toThrow('response lost');
    expect(await s.repository.checkpoint(scope)).toBeUndefined();
    s.intake.acceptBatch=async b=>{expect(JSON.stringify(b)).toBe(original);return {contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:b.observations.map(receiptFixture)};};
    const result=await new RssSourceCollector(new D1SourceRepository(new SqliteBinding(join(s.dir,'state.sqlite'))),s.payloads,s.http,s.intake).collect(input);
    expect(result.checkpoint).toBe('ADVANCED'); expect(s.http.get).toHaveBeenCalledTimes(1);
  });
  it('quarantine blocks validators and continuation until receipt resolution',async()=>{
    const s=setup(xml(item('one')+item('two')+item('three')));
    s.intake.acceptBatch=async b=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:b.observations.map(o=>({...receiptFixture(o),decision:'QUARANTINED',reasonCode:'QUARANTINE_MISSING_VALIDATION_FIELDS',checkpointResolution:'UNRESOLVED',candidateItemId:undefined}))});
    expect((await s.collector.collect(input)).checkpoint).toBe('BLOCKED');
    expect((await s.collector.collect(input,2)).checkpoint).toBe('BLOCKED');
    expect(await s.repository.checkpoint(scope)).toBeUndefined();
  });
  it('invalid response cannot advance a checkpoint',async()=>{
    const s=setup(); s.intake.acceptBatch=async b=>({contractVersion:b.contractVersion,handoffId:b.handoffId,durable:true as const,receipts:[]});
    await expect(s.collector.collect(input)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(await s.repository.checkpoint(scope)).toBeUndefined();
  });
  it('invalid rows remain observations with no proposal; missing dates remain missing',async()=>{
    const s=setup(xml('<item><title>No identity</title></item><item><guid>valid</guid><description>Excerpt</description></item>'));
    await s.collector.collect(input);
    expect(s.accepted[0].observations).toHaveLength(2); expect(s.accepted[0].proposals).toHaveLength(1);
    expect(s.accepted[0].observations[1].publishedAtHint).toBeUndefined();
  });
  it('same GUID stays stable across changed content, with distinct observation/hash',async()=>{
    const s=setup(); await s.collector.collect(input);
    s.http.get=async()=>({status:200,headers:{etag:'"v2"'},bytes:new TextEncoder().encode(xml(item('one','Updated'))),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});
    await s.collector.collect({...input,runId:'run-2'});
    const [a,b]=s.accepted.map(b=>b.observations[0]);
    expect(b.sourceItemKey).toBe(a.sourceItemKey); expect(b.id).not.toBe(a.id); expect(b.contentHash).not.toBe(a.contentHash);
  });
  it('absence from a later snapshot never emits DELETE',async()=>{
    const s=setup(); await s.collector.collect(input);
    s.http.get=async()=>({status:200,headers:{},bytes:new TextEncoder().encode(xml('')),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});
    await s.collector.collect({...input,runId:'run-2'});
    expect(s.accepted.at(-1)?.observations).toEqual([]);
  });
  it('allocations survive restart, share FeedSource scope, and are idempotent',async()=>{
    const s=setup(); const a=await s.repository.allocate(scope,'poll','config',timestamp);
    const other=new D1SourceRepository(new SqliteBinding(join(s.dir,'state.sqlite')));
    expect((await other.allocate(scope,'refresh','config',timestamp)).sequence).toBe(a.sequence+1);
    expect((await other.allocate(scope,'poll','config',timestamp)).sequence).toBe(a.sequence);
    await expect(other.allocate(scope,'poll','changed',timestamp)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    expect(await s.repository.claimFetch(scope,'poll')).toBe(true); expect(await other.claimFetch(scope,'poll')).toBe(false);
  });
  it('CAS prevents stale checkpoint overwrite and requires reload',async()=>{
    const s=setup(); const checkpoint={sequence:2,configurationKey:'c',etag:'new'};
    expect(await s.repository.commitCheckpoint(scope,0,checkpoint)).toBe(true);
    expect(await s.repository.commitCheckpoint(scope,0,{...checkpoint,sequence:1,etag:'old'})).toBe(false);
    expect(await s.repository.commitCheckpoint(scope,1,{...checkpoint,sequence:1,etag:'old'})).toBe(false);
    expect((await s.repository.checkpoint(scope))?.etag).toBe('new');
  });
  it('a failed allocated fetch cannot be retried under the same observation sequence',async()=>{
    const s=setup(); s.http.get=async()=>{throw new Error('crash');};
    await expect(s.collector.collect(input)).rejects.toThrow('crash');
    await expect(s.collector.collect(input)).rejects.toThrow('FETCH_OUTCOME_UNKNOWN');
    expect(await s.repository.checkpoint(scope)).toBeUndefined();
  });
  it('immutable batch identity rejects changed data',async()=>{
    const s=setup(); const result=await s.collector.collect(input);
    const batch=(await s.repository.loadBatch(scope,result.handoffId))!;
    batch.request.observations[0].titleHint='changed'; batch.request.proposals[0].titleHint='changed';
    await expect(s.repository.saveBatch(batch)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  });
  it('payload reads are scoped and integrity checked',async()=>{
    const s=setup(); const p=await s.payloads.put(scope,new TextEncoder().encode('original'),'text/plain');
    await expect(s.payloads.get({...scope,feedId:'other'},p.ref)).rejects.toMatchObject({code:'SCOPE_DENIED'});
    writeFileSync(join(s.dir,'objects',p.ref),'tampered');
    await expect(s.payloads.get(scope,p.ref)).rejects.toThrow('PAYLOAD_INTEGRITY_FAILURE');
  });
  it('304 is honest unknown-history coverage and does not advance',async()=>{
    const s=setup(); await s.collector.collect(input);
    s.http.get=vi.fn(async(_u,h)=>{expect(h['if-none-match']).toBe('"v1"');return {status:304,headers:{},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}};});
    const result=await s.collector.collect({...input,runId:'run-2'});
    expect(result.coverage.status).toBe('PARTIAL'); expect(result.checkpoint).toBe('UNCHANGED');
  });
  it('changed configuration does not reuse old conditional validators',async()=>{
    const s=setup(); await s.collector.collect(input);
    s.http.get=vi.fn(async(_u,h)=>{expect(h['if-none-match']).toBeUndefined();return {status:200,headers:{},bytes:new TextEncoder().encode(xml(item('two'))),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}};});
    await s.collector.collect({...input,runId:'run-2',url:'https://publisher.example/other'});
  });
  it('malformed XML produces persisted failed coverage and no validators',async()=>{
    const s=setup('<rss><channel><item>broken'); const result=await s.collector.collect(input);
    expect(result.coverage).toMatchObject({status:'UNKNOWN',failureReason:'UNKNOWN'});
    expect(await s.repository.checkpoint(scope)).toBeUndefined();
  });
  it('crash after receipt persistence and before checkpoint commit replays the saved handoff',async()=>{
    const s=setup(); const commit=s.repository.commitCheckpoint.bind(s.repository);
    s.repository.commitCheckpoint=async()=>{throw new Error('checkpoint crash');};
    await expect(s.collector.collect(input)).rejects.toThrow('checkpoint crash');
    s.repository.commitCheckpoint=commit;
    expect((await s.collector.collect(input)).checkpoint).toBe('ADVANCED');
    expect(s.http.get).toHaveBeenCalledTimes(1);
  });
  it('scheduler persists continuation and resumes it after restart',async()=>{
    const s=setup(xml(item('one')+item('two')+item('three'))); s.db.db.exec(RSS_POLL_SCHEMA);
    const scheduler=new D1RssPollScheduler(s.db,s.collector,async()=>true,()=>Date.parse(timestamp));
    await scheduler.schedule('job-1',input,timestamp);
    expect(await scheduler.runOne()).toBe('RETRY');
    const restarted=new D1RssPollScheduler(new SqliteBinding(join(s.dir,'state.sqlite')),s.collector,async()=>true,()=>Date.parse(timestamp));
    expect(await restarted.runOne()).toBe('DONE'); expect(await restarted.runOne()).toBe('IDLE');
    expect(s.http.get).toHaveBeenCalledTimes(1);
  });
  it('scheduler cancels a source that is no longer authorized before fetching',async()=>{
    const s=setup(); s.db.db.exec(RSS_POLL_SCHEMA);
    const scheduler=new D1RssPollScheduler(s.db,s.collector,async()=>false,()=>Date.parse(timestamp));
    await scheduler.schedule('job-1',input,timestamp);
    expect(await scheduler.runOne()).toBe('CANCELLED'); expect(s.http.get).not.toHaveBeenCalled();
  });
  it('scheduler honors a provider rate limit and allocates a fresh sequence for refetch',async()=>{
    const s=setup(); s.db.db.exec(RSS_POLL_SCHEMA); let time=Date.parse(timestamp);
    const scheduler=new D1RssPollScheduler(s.db,s.collector,async()=>true,()=>time);
    s.http.get=vi.fn(async()=>({status:429,headers:{'retry-after':'120'},bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}}));
    await scheduler.schedule('job-1',input,timestamp);
    expect(await scheduler.runOne()).toBe('RETRY'); time+=119_000;
    expect(await scheduler.runOne()).toBe('IDLE'); time+=1000;
    s.http.get=async()=>({status:200,headers:{},bytes:new TextEncoder().encode(xml(item('one'))),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});
    expect(await scheduler.runOne()).toBe('DONE'); expect((await s.repository.checkpoint(scope))?.sequence).toBe(2);
  });
});

describe('RSS normalization and bounded HTTP',()=>{
  it('Atom chooses alternate links and keeps edit metadata opaque',()=>{
    const items=normalizeRssSnapshot('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:example,1</id><link rel="self" href="https://publisher.example/api"/><link rel="alternate" href="/article"/><title>Title</title><summary>Excerpt</summary><updated>2026-10-04T07:00:00Z</updated></entry></feed>',input.url);
    expect(items[0]).toMatchObject({upstreamId:'tag:example,1',url:'https://publisher.example/article',sourceRevision:{comparability:'OPAQUE'}});
    expect(items[0].publishedAt).toBeUndefined();
  });
  it('rejects DTDs and HTML, collapses duplicate upstream IDs',()=>{
    expect(()=>normalizeRssSnapshot('<!DOCTYPE rss><rss/>',input.url)).toThrow('INVALID_FEED');
    expect(()=>normalizeRssSnapshot('<html/>',input.url)).toThrow('INVALID_FEED');
    expect(normalizeRssSnapshot(xml(item('one')+item('one')),input.url)).toHaveLength(1);
  });
  it('conflicting duplicate rows are visible to intake without choosing arbitrary content',async()=>{
    const s=setup(xml(item('one','A')+item('one','B'))); await s.collector.collect(input);
    expect(s.accepted[0].observations).toHaveLength(1); expect(s.accepted[0].proposals).toHaveLength(0);
    expect(s.accepted[0].observations[0].contentHash).toBeUndefined();
  });
  it('Atom XHTML text is retained',()=>{
    const result=normalizeRssSnapshot('<feed><entry><id>one</id><title>Title</title><content type="xhtml"><div><p>Useful <b>body</b></p></div></content></entry></feed>',input.url);
    expect(result[0].body).toBe('Useful body');
  });
  it('normalizes CDATA HTML and encoded markup without losing text',()=>{
    const result=normalizeRssSnapshot(xml('<item><guid>one</guid><title>A &amp; B</title><description><![CDATA[<p>Useful &amp; correct</p>]]></description></item><item><guid>two</guid><description>&lt;p&gt;Encoded body&lt;/p&gt;</description></item>'),input.url);
    expect(result[0].title).toBe('A & B'); expect(result[0].body).toBe('Useful & correct'); expect(result[1].body).toBe('Encoded body');
  });
  it('bounded retry respects Retry-After without exceeding wait budget',async()=>{
    const dispatch=vi.fn(async()=>new Response('',{status:429,headers:{'retry-after':'120'}})),sleep=vi.fn();
    const response=await new BoundedFeedHttp(dispatch,{sleep}).get(input.url,{});
    expect(response.status).toBe(429); expect(dispatch).toHaveBeenCalledTimes(1); expect(sleep).not.toHaveBeenCalled();
  });
  it('retries transient errors and measures all requests',async()=>{
    const dispatch=vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(new Response(xml('')));
    const response=await new BoundedFeedHttp(dispatch,{sleep:async()=>{}}).get(input.url,{});
    expect(response.telemetry.requests).toBe(2); expect(new TextDecoder().decode(response.bytes)).toBe(xml(''));
  });
  it('redirects are not followed and oversize streams are rejected',async()=>{
    const redirect=vi.fn(async(_url,init)=>{expect(init.redirect).toBe('manual');return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}});});
    expect((await new BoundedFeedHttp(redirect).get(input.url,{})).status).toBe(302);
    await expect(new BoundedFeedHttp(async()=>new Response('too long'),{maxBytes:2}).get(input.url,{})).rejects.toThrow('FEED_TOO_LARGE');
  });
  it('enforces a deadline even when dispatch does not honor abort',async()=>{
    const response=await new BoundedFeedHttp(()=>new Promise(()=>{}),{timeoutMs:10,attempts:1}).get(input.url,{});
    expect(response.status).toBe(0); expect(response.telemetry.requests).toBe(1);
  });
});
