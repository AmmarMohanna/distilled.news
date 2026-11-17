import {expect,it,vi} from 'vitest';
import {personalNewsBriefing} from '@distilled/core';
import {createApp} from './app';
import {D1Repository,InMemoryRepository} from './repository';
import {createIntakeDatabase} from './v1-intake/test-utils';
import type {Env} from './types';
const request=(app:ReturnType<typeof createApp>,path:string)=>app.request(path,{}, {ADMIN_SESSION_SECRET:'test'} as Env);

it('invalidates a page token after a removal without an overlapping next page',async()=>{
 const repo=new InMemoryRepository(),owner=await repo.createAccount({email:'catalog@example.invalid',username:'publisher',passwordHash:'test',role:'user'});
 for(let i=0;i<102;i++)await repo.upsertBriefing({...personalNewsBriefing,id:'catalog-'+i,slug:'feed-'+i,title:'Feed '+i,ownerAccountId:owner.id,publicFeedEnabled:true,stars:102-i});
 const app=createApp({repository:repo});
 const response=await request(app,'/api/explore/feeds');expect(response.status).toBe(200);
 const first=await response.json() as {revision:string;feeds:Array<{id:string}>};expect(first.revision).toEqual(expect.any(String));expect(first.feeds).toHaveLength(100);
 const removed=(await repo.getBriefingById('catalog-5'))!;await repo.upsertBriefing({...removed,paused:true});
 const stale=await request(app,'/api/explore/feeds?offset=100&revision='+encodeURIComponent(first.revision));expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({code:'EXPLORE_CHANGED'});
 const next=await(await request(app,'/api/explore/feeds')).json() as typeof first;expect(next.revision).not.toBe(first.revision);expect(next.feeds.some(feed=>feed.id==='catalog-100')).toBe(true);
 const last=await(await request(app,'/api/explore/feeds?offset=100&revision='+encodeURIComponent(next.revision))).json() as typeof first;
 expect(new Set([...next.feeds,...last.feeds].map(feed=>feed.id)).size).toBe(101);
});

it('rejects a page when the catalog changes during the listing query',async()=>{
 const repo=new InMemoryRepository(),owner=await repo.createAccount({email:'race@example.invalid',username:'publisher',passwordHash:'test',role:'user'});
 const feed=await repo.upsertBriefing({...personalNewsBriefing,id:'catalog-race',ownerAccountId:owner.id,publicFeedEnabled:true});
 const list=repo.listExploreBriefings.bind(repo);vi.spyOn(repo,'listExploreBriefings').mockImplementationOnce(async(...args)=>{const page=await list(...args);await repo.upsertBriefing({...feed,paused:true});return page;});
 const response=await request(createApp({repository:repo}),'/api/explore/feeds');expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'EXPLORE_CHANGED'});
});

it('increments the D1 catalog revision for eligibility, identity and ranking changes, not routine scheduling',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  const repo=new D1Repository(ctx.db),owner=await repo.createAccount({email:'d1-catalog@example.invalid',username:'publisher',passwordHash:'test',role:'user'});
  const initial=await repo.getExploreRevision();
  let feed=await repo.upsertBriefing({...personalNewsBriefing,id:'catalog-d1',slug:'catalog-d1',ownerAccountId:owner.id,publicFeedEnabled:true});
  let revision=await repo.getExploreRevision();expect(revision).not.toBe(initial);
  feed=await repo.upsertBriefing({...feed,nextBriefingAt:'2027-01-01T00:00:00Z'});expect(await repo.getExploreRevision()).toBe(revision);
  await repo.setBriefingStar(feed.id,'voter',true);expect(await repo.getExploreRevision()).not.toBe(revision);revision=await repo.getExploreRevision();
  await repo.setBriefingStar(feed.id,'voter',true);expect(await repo.getExploreRevision()).toBe(revision);
  feed=await repo.upsertBriefing({...feed,stars:1,paused:true});expect(await repo.getExploreRevision()).not.toBe(revision);revision=await repo.getExploreRevision();
  feed=await repo.upsertBriefing({...feed,paused:false});expect(await repo.getExploreRevision()).not.toBe(revision);revision=await repo.getExploreRevision();
  await ctx.db.prepare('UPDATE accounts SET username=? WHERE id=?').bind('renamed-publisher',owner.id).run();expect(await repo.getExploreRevision()).not.toBe(revision);revision=await repo.getExploreRevision();
  await ctx.db.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').bind('2026-11-17T00:00:00Z',owner.id).run();expect(await repo.getExploreRevision()).not.toBe(revision);revision=await repo.getExploreRevision();
  await repo.deleteBriefing(feed.id);expect(await repo.getExploreRevision()).not.toBe(revision);
 }finally{await ctx.dispose();}
},60000);
