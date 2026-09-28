import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {expect,it,vi} from 'vitest';
import {D1Repository} from './repository';
import {processQueueMessage,ProcessingLeaseBusy} from './processor';
import {D1CatchUpStore,generateCatchUp,publicDevelopment} from './development-feed';
import {publishDueBriefingEditions,publishManualBriefingEdition} from './editions';
import {createSession} from './auth';
import {createApp} from './app';
import {extractiveClaims,normalizedDocumentUrl,sameDocument,validateGroundedClaims,type NormalizedMessage,type SummaryAdapter,type EventReviewAdapter} from '@distilled/core';
import type {Env} from './types';

it('retains documents, incrementally clusters specific developments, grounds claims, publishes, and acknowledges cross-feed changes through fresh D1 contexts',async()=>{
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB']});
  try{
    const db=await mf.getD1Database('DB');
    const directory=new URL('../migrations/',import.meta.url);
    for(const name of readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const sql=readFileSync(new URL(name,directory),'utf8').split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(value=>value.replace(/--[^\r\n]*/g,'').trim());
      if(sql.length)await db.batch(sql.map(value=>db.prepare(value)));
    }
    const repo=new D1Repository(db),now=new Date(),later=new Date(now.getTime()+1000);
    const owner=await repo.createAccount({email:'pipeline@example.com',username:'pipeline',role:'user',passwordHash:'not-a-login',emailVerifiedAt:now.toISOString()},now);
    const feed=await repo.ensureDefaultBriefing(owner,now);
    const first={...feed,interestProfile:'',intensity:'low' as const,nextBriefingAt:later.toISOString()};
    await repo.upsertBriefing(first,now);
    const second={...first,id:'second-feed',slug:'second',title:'Second feed'};await repo.upsertBriefing(second,now);
    const bbc=await repo.upsertConfiguredSource({briefingId:feed.id,title:'BBC',provider:'rss',kind:'rss_feed',sourceUrl:'https://bbc.example/rss',enabled:true},now);
    const aj=await repo.upsertConfiguredSource({briefingId:feed.id,title:'Al Jazeera',provider:'web',kind:'web_page',sourceUrl:'https://aljazeera.example',enabled:true},now);
    const other=await repo.upsertConfiguredSource({briefingId:second.id,title:'Other publisher',provider:'rss',kind:'rss_feed',sourceUrl:'https://other.example/rss',enabled:true},now);
    const summary={summarize:vi.fn(async()=>''),summarizeGrounded:vi.fn(async(input)=>extractiveClaims(input.evidence.slice(-1)))} satisfies SummaryAdapter;
    const review={isImportant:vi.fn(async()=>true),areSameEvent:vi.fn(async({left,right})=>left.some((e:{text:string})=>/Polo/.test(e.text))&&right.some((e:{text:string})=>/Polo/.test(e.text)))} satisfies EventReviewAdapter;
    let count=0;
    const ingest=async(source:typeof bbc,text:string,url:string,at=now)=>{
      const id=`raw-${++count}`;
      const raw:NormalizedMessage={id,messageId:id,source:{id:source.id,title:source.title,type:'channel',provider:source.provider,kind:source.kind},text,links:[url],media:[],postedAt:now.toISOString(),receivedAt:at.toISOString(),sourceUrl:url,expiresAt:new Date(now.getTime()+15*86400000).toISOString(),news:{tenantId:owner.id,acquiredItemId:`document-${count}`,upstreamResourceId:`upstream-${source.id}`,canonicalIdentity:url,contentHash:`hash-${count}`,headline:text}};
      await repo.saveRawMessage(source.briefingId,raw,at);const jobId=await repo.createProcessingJob(source.briefingId,id,at);
      await processQueueMessage(new D1Repository(db),{jobId,briefingId:source.briefingId,rawMessageId:id},at,summary,review);return{raw,jobId};
    };
    const article=await ingest(bbc,'Hurricane Polo was upgraded to category 3 as Mexico ordered evacuations in Baja California.','https://bbc.example/articles/polo');
    await ingest(aj,'Authorities ordered evacuations in Baja California after Hurricane Polo reached category 3.','https://aljazeera.example/news/polo');
    let items=await new D1Repository(db).getExistingItems(feed.id,now);
    expect(items).toHaveLength(1);expect(items[0].evidence).toHaveLength(2);expect(items[0].development?.membership.some(member=>['SEMANTIC_REVIEW','DETERMINISTIC'].includes(member.method))).toBe(true);
    expect(await repo.getRawMessage(article.raw.id)).toMatchObject({news:{acquiredItemId:'document-1',tenantId:owner.id}});
    const calls=summary.summarizeGrounded.mock.calls.length;
    await processQueueMessage(new D1Repository(db),{jobId:article.jobId,briefingId:feed.id,rawMessageId:article.raw.id},later,summary,review);
    await ingest(bbc,article.raw.text,'https://bbc.example/articles/polo?utm_campaign=repeat');
    expect(summary.summarizeGrounded).toHaveBeenCalledTimes(calls);
    // Another named storm in the same region is a distinct development.
    await ingest(bbc,'Hurricane Rosa killed 18 people after making landfall in Baja California, Mexico.','https://bbc.example/articles/rosa');
    items=await repo.getExistingItems(feed.id,now);expect(items).toHaveLength(2);
    await ingest(other,'Police arrested 2 suspects after a court hearing in Sydney.','https://other.example/articles/arrests');
    const store=new D1CatchUpStore(db),snapshot=await generateCatchUp(new D1Repository(db),store,owner.id,later,1);
    expect(snapshot.cards).toHaveLength(1);expect(snapshot.truncated).toBe(true);
    expect(await store.acknowledge('foreign-owner',snapshot.id,later)).toBe(false);
    expect(await store.acknowledge(owner.id,snapshot.id,later)).toBe(true);
    expect((await generateCatchUp(repo,new D1CatchUpStore(db),owner.id,later)).cards.length).toBe(2); // omitted cards remain unread
    const all=await generateCatchUp(repo,store,owner.id,later);await store.acknowledge(owner.id,all.id,later);
    expect((await generateCatchUp(repo,store,owner.id,later)).cards).toHaveLength(0);
    const changedAt=new Date(now.getTime()+2000);
    await ingest(aj,'Hurricane Polo caused 12 injuries as Mexico ordered additional evacuations in Baja California.','https://aljazeera.example/news/polo-impact',changedAt);
    const delta=await generateCatchUp(repo,new D1CatchUpStore(db),owner.id,new Date(now.getTime()+3000));
    expect(delta.cards).toHaveLength(1);expect(delta.cards[0].summary).toContain('12 injuries');
    expect(delta.cards[0].changes.some(change=>change.kind==='NEW_INFORMATION')).toBe(true);
    expect(delta.cards[0].sources.every(source=>source.url.startsWith('https://'))).toBe(true);
    items=await repo.getExistingItems(feed.id,new Date(now.getTime()+3000));expect(items).toHaveLength(2);
    const edition=await publishManualBriefingEdition({repo,briefing:first,now:new Date(now.getTime()+4000),summaryAdapter:summary});
    expect(edition?.sections.some(section=>section.claims?.length)).toBe(true);
    const finalCalls=summary.summarizeGrounded.mock.calls.length;
    await publishManualBriefingEdition({repo:new D1Repository(db),briefing:first,now:new Date(now.getTime()+4000),summaryAdapter:summary});
    expect(summary.summarizeGrounded).toHaveBeenCalledTimes(finalCalls);
    expect(await repo.listBriefingEditions(feed.id,true,new Date(now.getTime()+4000))).toHaveLength(1);
    const env={DB:db,ADMIN_SESSION_SECRET:'test-session-secret'} as unknown as Env;
    const cookie=`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,owner)}`;
    const app=createApp();
    const response=await app.request(`/api/me/briefings/${feed.id}/developments`,{headers:{cookie}},env);
    expect(response.status).toBe(200);const dto=JSON.stringify(await response.json());
    expect(dto).toContain('claims');expect(dto).not.toMatch(/workflow|acquisitionRun|BrowserUse|contentHash|tenantId|upstream/);
    expect((await app.request('/v1/news-pipeline/evaluate',{method:'POST'},env)).status).toBe(404);
    const rawId=article.raw.id,leased=await repo.createProcessingJob(feed.id,rawId,now);
    expect(await repo.claimProcessingJob(leased,feed.id,now)).toBe(true);
    const queued=await repo.createProcessingJob(feed.id,rawId,now);
    await expect(processQueueMessage(repo,{jobId:queued,briefingId:feed.id,rawMessageId:rawId},now,summary)).rejects.toBeInstanceOf(ProcessingLeaseBusy);
    expect(await repo.claimProcessingJob(queued,feed.id,new Date(now.getTime()+300001))).toBe(true);
  }finally{await mf.dispose()}
},60000);

it('validates real quote support, rejects invented sources/numbers, and preserves query identity',()=>{
  expect(normalizedDocumentUrl('https://www.example.com/article?id=1&utm_source=x#title')).toBe('https://example.com/article?id=1');
  const raw={id:'a',source:{id:'publisher'},messageId:'1',text:'same article',sourceUrl:'https://example.com/article?id=1'} as NormalizedMessage;
  expect(sameDocument(raw,{...raw,id:'b',messageId:'2',sourceUrl:'https://example.com/article?id=2'})).toBe(false);
  const evidence=[{messageId:'actual',text:'Police confirmed 12 injuries after the hurricane.'}] as any;
  expect(()=>validateGroundedClaims([{id:'',text:'Police confirmed 99 injuries.',support:[{messageId:'actual',quote:evidence[0].text}]}],evidence)).toThrow('UNSUPPORTED_CLAIM_NUMBER');
  expect(()=>validateGroundedClaims([{id:'',text:'Police confirmed 12 injuries.',support:[{messageId:'invented',quote:evidence[0].text}]}],evidence)).toThrow('UNSUPPORTED_CLAIM_REFERENCE');
});
