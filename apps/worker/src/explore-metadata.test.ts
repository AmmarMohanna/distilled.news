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
  const personal=await repo.listBriefings(owner.id,'voter-a');
  expect(personal).toHaveLength(3);
  expect(personal.find(feed=>feed.id==='public-card')).toMatchObject({viewerHasStarred:true,latestUpdatedAt:'2026-11-16T18:00:00Z'});
  expect((await repo.listBriefings(owner.id,'voter-b')).find(feed=>feed.id==='public-card')).toMatchObject({viewerHasStarred:false});
  expect(await repo.listBriefings('other-account','voter-a')).toEqual([]);
  const plan=await local.db.prepare("EXPLAIN QUERY PLAN SELECT json_extract(json,'$.publishedAt') FROM v1_feed_documents WHERE feed_id=? AND kind='publication_status' AND json_extract(json,'$.status')='PUBLISHED' ORDER BY json_extract(json,'$.publishedAt') DESC LIMIT 1").bind('public-card').all<{detail:string}>();
  expect(plan.results.map(row=>row.detail).join(' ')).toContain('v1_explore_publication_time');
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  expect(await repo.listExploreHighlights("trending", yearAgo, 8, "voter-a")).toMatchObject([
    { id: "public-card", latestEditionId: "live", viewerHasStarred: true }
  ]);
  expect((await repo.listExploreHighlights("new", yearAgo, 8)).map(item => item.id)).toEqual(["public-card"]);
  expect(await repo.listExploreHighlights("trending", "2099-01-01T00:00:00.000Z", 8)).toEqual([]);
  await repo.upsertBriefing(make('second-public-card'));
  await repo.setBriefingStar('second-public-card','voter-a',true);
  await repo.setBriefingStar('private-card','private-voter',true);
  await repo.setBriefingStar('paused-card','paused-voter',true);
  const channel = { username: owner.username, publicFeedCount: 2, followerCount: 0 };
  expect(await repo.listExploreChannels(8)).toEqual([channel]);
  expect(await repo.listExploreChannels(1, owner.id)).toEqual([channel]);
  expect(await repo.listExploreChannels(1, 'missing-owner')).toEqual([]);
  const follower = await repo.createAccount({email:'follower@example.invalid',username:'follower',passwordHash:'test',role:'user'});
  const beforeFollow = await repo.getExploreRevision();
  await repo.setChannelFollow(owner.id, follower.id, true);
  await repo.setChannelFollow(owner.id, follower.id, true);
  expect(await repo.hasChannelFollow(owner.id, follower.id)).toBe(true);
  expect((await repo.listExploreBriefings(1, 0, undefined, undefined, owner.id, follower.id))[0].viewerFollowsChannel).toBe(true);
  expect((await repo.listExploreBriefings(1, 0, undefined, undefined, owner.id))[0].viewerFollowsChannel).toBe(false);
  expect(await repo.listExploreChannels(1, owner.id)).toEqual([{ ...channel, followerCount: 1 }]);
  expect(await repo.getExploreRevision()).not.toBe(beforeFollow);
  await repo.setChannelFollow(owner.id, follower.id, false);
  expect(await repo.hasChannelFollow(owner.id, follower.id)).toBe(false);
  expect(await repo.listExploreChannels(1, owner.id)).toEqual([channel]);
 }finally{await local.dispose()}
},30000);
