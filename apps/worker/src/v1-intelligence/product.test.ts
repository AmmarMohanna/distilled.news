import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,testPolicy} from '../v1-intake/test-utils';
import {enrollV1Source,synchronizeV1ProductSource} from './product';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','owner@example.invalid','owner@example.invalid','owner','user','hash',?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','news','News','banking reform',1,?,?)").bind(testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,last_seen_at,created_at,updated_at) VALUES('feed-source-1','feed-1','News RSS','channel','rss','rss_feed','https://feeds.bbci.co.uk/news/world/rss.xml',1,?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
});
afterEach(async()=>ctx?.dispose());
it('unchanged enrollment takes an indexed optional-product boundary read and one guarded product read',async()=>{
 const prior=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());let reads=0;
 const measured=new Proxy(ctx.db,{get(target,key){if(key==='prepare')return (sql:string)=>{reads++;return target.prepare(sql)};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await synchronizeV1ProductSource(measured,'feed-source-1',testPolicy.now());expect(reads).toBe(2);
 await ctx.db.prepare("UPDATE sources SET title='Changed title' WHERE id='feed-source-1'").run();
 await synchronizeV1ProductSource(measured,'feed-source-1',testPolicy.now());
 expect((await new V1IntakeStore(ctx.db).snapshot('feed-source-1')).scope.feedRevision).toBeGreaterThan(prior.scope.feedRevision);
 await ctx.db.prepare("UPDATE accounts SET disabled_at=? WHERE id='owner-1'").bind(testPolicy.now()).run();
 await expect(synchronizeV1ProductSource(measured,'feed-source-1',testPolicy.now())).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('only a selected source can be enrolled; configuration and canonical publisher identity are retained',async()=>{
 await expect(enrollV1Source(ctx.db,'feed-source-1','other-owner',testPolicy.now())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 const enrolled=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 expect(enrolled.scope.enabled).toBe(true);expect(enrolled.source.canonicalUrl).toContain('feeds.bbci.co.uk');
 expect(await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now())).toEqual(enrolled);
});
it('owner-approved live interval configuration persists timezone and fences old work',async()=>{
 const previous=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 const schedule={durationMinutes:120 as const,timezone:'Asia/Beirut',deliveryAnchor:'08:00'};
 await expect(enrollV1Source(ctx.db,'feed-source-1','other-owner',testPolicy.now(),schedule)).rejects.toMatchObject({code:'SCOPE_DENIED'});
 const enrolled=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now(),schedule);
 expect(enrolled.feed.briefingSchedule).toEqual(schedule);
 expect(enrolled.feed.revision).toBeGreaterThan(previous.feed.revision);
 expect(enrolled.scope.feedRevision).toBe(enrolled.feed.revision);
 expect(await ctx.db.prepare("SELECT v1_briefing_interval_minutes AS duration,briefing_timezone AS zone,briefing_time_of_day AS anchor FROM briefings WHERE id='feed-1'").first()).toEqual({duration:120,zone:'Asia/Beirut',anchor:'08:00'});
 expect((await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now())).feed).toEqual(enrolled.feed);
},15000);
it('ordinary product cadence edits replace an earlier explicit live interval',async()=>{
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now(),{durationMinutes:120,timezone:'UTC'});
 await ctx.db.prepare("UPDATE briefings SET briefing_cadence='daily' WHERE id='feed-1'").run();
 const daily=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 expect(daily.feed.briefingSchedule?.durationMinutes).toBe(1440);
 await ctx.db.prepare("UPDATE briefings SET briefing_cadence='weekly' WHERE id='feed-1'").run();
 const weekly=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 expect(weekly.feed.briefingSchedule).toBeUndefined();
},15000);
it('source disable and Feed deletion atomically revoke in-flight scopes and preserve canonical tombstones',async()=>{
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 await ctx.db.prepare("UPDATE sources SET enabled=0 WHERE id='feed-source-1'").run();
 await expect(new V1IntakeStore(ctx.db).snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await ctx.db.prepare("UPDATE sources SET enabled=1 WHERE id='feed-source-1'").run();
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 await ctx.db.prepare("DELETE FROM briefings WHERE id='feed-1'").run();
 expect(await new V1FeedStore(ctx.db).getFeed('feed-1')).toMatchObject({paused:true,deletedAt:expect.any(String)});
 await expect(new V1IntakeStore(ctx.db).snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect((await ctx.db.prepare('SELECT id FROM v1_source_catalog').all()).results).toHaveLength(1);
});
it('removing one source tombstones its intake scope while a newly approved source can reuse the catalog identity',async()=>{
 const original=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 await ctx.db.prepare("INSERT INTO v1_revisions(id,feed_source_id,item_key,json) VALUES('retained-revision','feed-source-1','item-1',?)").bind(JSON.stringify({id:'retained-revision',body:'Supported fact'})).run();
 await ctx.db.prepare("DELETE FROM sources WHERE id='feed-source-1'").run();
 const store=new V1IntakeStore(ctx.db);
 await expect(store.snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.getScope('feed-source-1')).toMatchObject({enabled:false,deletedAt:expect.any(String)});
 expect((await ctx.db.prepare('SELECT id FROM v1_source_catalog').all()).results).toEqual([{id:original.source.id}]);
 expect(await ctx.db.prepare("SELECT json FROM v1_revisions WHERE id='retained-revision'").first()).toEqual({json:JSON.stringify({id:'retained-revision',body:'Supported fact'})});
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,last_seen_at,created_at,updated_at) VALUES('feed-source-2','feed-1','News RSS','channel','rss','rss_feed','https://feeds.bbci.co.uk/news/world/rss.xml',1,?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 const replacement=await enrollV1Source(ctx.db,'feed-source-2','owner-1',testPolicy.now());
 expect(replacement.source.id).toBe(original.source.id);
 expect(replacement.scope.feedSourceId).toBe('feed-source-2');
 await expect(store.snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('approved source identity changes cannot silently rebind an existing FeedSource',async()=>{
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 await ctx.db.prepare("UPDATE sources SET source_url='https://example.com/other.xml' WHERE id='feed-source-1'").run();
 await expect(enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now())).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await expect(new V1IntakeStore(ctx.db).snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});

it('persists and synchronizes a creation-relative origin without changing legacy enrollment identities',async()=>{
 const {D1Repository}=await import('../repository');
 const repo=new D1Repository(ctx.db),legacy=(await repo.getBriefingById('feed-1'))!;
 const before=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 const binding=await ctx.db.prepare("SELECT configuration FROM v1_product_bindings WHERE feed_source_id='feed-source-1'").first<{configuration:string}>();
 expect(JSON.parse(binding!.configuration)).not.toHaveProperty('originAt');
 await synchronizeV1ProductSource(ctx.db,'feed-source-1','2026-10-03T12:05:00Z');
 expect(await new V1FeedStore(ctx.db).getFeed('feed-1')).toEqual(before.feed);
 const originAt='2026-10-03T12:05:40.123Z';
 await repo.upsertBriefing({...legacy,updateIntervalMinutes:30,briefingScheduleOriginAt:originAt},new Date(originAt));
 const saved=(await new D1Repository(ctx.db).getBriefingById('feed-1'))!;expect(saved.briefingScheduleOriginAt).toBe(originAt);
 const enrolled=await enrollV1Source(ctx.db,'feed-source-1','owner-1',originAt);
 expect(enrolled.feed.briefingSchedule).toMatchObject({durationMinutes:30,originAt});
 await expect(enrollV1Source(ctx.db,'feed-source-1','owner-1',originAt,{durationMinutes:30,timezone:legacy.briefingTimezone,originAt:'2026-10-03T12:06:00Z'})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 await synchronizeV1ProductSource(ctx.db,'feed-source-1','2026-10-03T12:35:40.123Z');
 expect(await new V1FeedStore(ctx.db).getFeed('feed-1')).toEqual(enrolled.feed);
 const {livePublicationWindow}=await import('./schedule');
 const closed=livePublicationWindow(enrolled.feed.briefingSchedule!,new Date('2026-10-03T12:35:40.123Z'));
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','retained-close','feed-1',?)").bind(JSON.stringify({id:'retained-close',window:closed,state:'PENDING',attempts:1})).run();
 const changed=await enrollV1Source(ctx.db,'feed-source-1','owner-1','2026-10-03T12:45:00Z',{durationMinutes:60,timezone:legacy.briefingTimezone});
 expect(changed.feed.briefingSchedule).toMatchObject({durationMinutes:60,originAt:'2026-10-03T12:35:40.123Z'});
});

it('an interval edit before any recorded close retains unprocessed coverage from creation',async()=>{
 const originAt='2026-10-03T12:05:40.123Z';
 await ctx.db.prepare("UPDATE briefings SET v1_briefing_interval_minutes=120,briefing_schedule_origin_at=? WHERE id='feed-1'").bind(originAt).run();
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',originAt);
 const changed=await enrollV1Source(ctx.db,'feed-source-1','owner-1','2026-10-03T15:00:00Z',{durationMinutes:30,timezone:'UTC'});
 expect(changed.feed.briefingSchedule).toMatchObject({durationMinutes:30,originAt});
 const {D1Repository}=await import('../repository');
 expect((await new D1Repository(ctx.db).getBriefingById('feed-1'))?.nextBriefingAt).toBe('2026-10-03T15:05:40.123Z');
});
it('persists a new clock policy and starts an edited cadence after the retained pending coverage',async()=>{
 const clockStartAt='2026-10-03T12:08:40.123Z';
 await ctx.db.prepare("UPDATE briefings SET v1_briefing_interval_minutes=30,briefing_schedule_clock_start_at=? WHERE id='feed-1'").bind(clockStartAt).run();
 const first=await enrollV1Source(ctx.db,'feed-source-1','owner-1',clockStartAt);
 expect(first.feed.briefingSchedule).toMatchObject({clockStartAt,durationMinutes:30});
 const {livePublicationWindow}=await import('./schedule');
 const window=livePublicationWindow(first.feed.briefingSchedule!,new Date('2026-10-03T12:25:00Z'));
 const pending=JSON.stringify({id:'pending-clock',window,state:'PENDING',attempts:1,engine:'v3'});
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','pending-clock','feed-1',?)").bind(pending).run();
 const changed=await enrollV1Source(ctx.db,'feed-source-1','owner-1','2026-10-03T12:40:00Z',{durationMinutes:60,timezone:'UTC'});
 expect(changed.feed.briefingSchedule).toMatchObject({clockStartAt:window.end,durationMinutes:60});
 expect(livePublicationWindow(changed.feed.briefingSchedule!,new Date('2026-10-03T13:55:00Z')).start).toBe(window.end);
 expect((await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='briefing_requests' AND id='pending-clock'").first<{json:string}>())?.json).toBe(pending);
 const {D1Repository}=await import('../repository');expect((await new D1Repository(ctx.db).getBriefingById('feed-1'))?.briefingScheduleClockStartAt).toBe(window.end);
 const plan=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT json_extract(json,'$.window.end') FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.window.clockStartAt')=? AND json_extract(json,'$.window.durationMinutes')=? ORDER BY json_extract(json,'$.window.end') DESC LIMIT 1").bind('feed-1',clockStartAt,30).all<{detail:string}>();
 expect(plan.results.map(r=>r.detail).join(' ')).toContain('v1_clock_schedule_requests');
});
