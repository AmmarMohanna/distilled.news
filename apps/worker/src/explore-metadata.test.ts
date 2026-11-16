import {it,expect} from 'vitest';
import {personalNewsBriefing} from '@distilled/core';
import {D1Repository} from './repository';
import {createIntakeDatabase} from './v1-intake/test-utils';

it('lists public card metadata with indexed timestamps and voter isolation, without loading editions',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  const repo=new D1Repository(local.db);
  const owner=await repo.createAccount({email:'owner@example.invalid',username:'owner',passwordHash:'test',role:'user'});
  const make=(id:string)=>({...personalNewsBriefing,id,slug:id,title:id,ownerAccountId:owner.id,ownerUsername:owner.username,publicFeedEnabled:true,paused:false});
  await repo.upsertBriefing(make('public-card'));await repo.upsertBriefing({...make('private-card'),publicFeedEnabled:false});
  await repo.upsertBriefing({...make('paused-card'),paused:true});
  await repo.setBriefingStar('public-card','voter-a',true);
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('public-card',JSON.stringify({revision:1})).run();
  const publish=async(id:string,status:string,at:string)=>local.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('publication_status',?,'public-card',?)").bind(id,JSON.stringify({id,feedId:'public-card',status,publishedAt:at})).run();
  await publish('live','PUBLISHED','2026-11-16T18:00:00Z');await publish('withdrawn','WITHDRAWN','2026-11-16T19:00:00Z');
  const cards=await repo.listExploreBriefings(101,0,undefined,'voter-a');
  expect(cards.map(feed=>feed.id)).toEqual(['public-card']);
  expect(cards[0]).toMatchObject({viewerHasStarred:true,latestUpdatedAt:'2026-11-16T18:00:00Z'});
  expect((await repo.listExploreBriefings(101,0,undefined,'voter-b'))[0].viewerHasStarred).toBe(false);
  expect((await repo.listExploreBriefings(101))[0].viewerHasStarred).toBe(false);
  expect(await repo.listExploreBriefings(101,0,owner.id,'voter-a')).toEqual([]);
  const plan=await local.db.prepare("EXPLAIN QUERY PLAN SELECT json_extract(json,'$.publishedAt') FROM v1_feed_documents WHERE feed_id=? AND kind='publication_status' AND json_extract(json,'$.status')='PUBLISHED' ORDER BY json_extract(json,'$.publishedAt') DESC LIMIT 1").bind('public-card').all<{detail:string}>();
  expect(plan.results.map(row=>row.detail).join(' ')).toContain('v1_explore_publication_time');
 }finally{await local.dispose()}
},30000);
