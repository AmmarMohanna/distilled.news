import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,testPolicy} from '../v1-intake/test-utils';
import {enrollV1Source} from './product';
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
it('approved source identity changes cannot silently rebind an existing FeedSource',async()=>{
 await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 await ctx.db.prepare("UPDATE sources SET source_url='https://example.com/other.xml' WHERE id='feed-source-1'").run();
 await expect(enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now())).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await expect(new V1IntakeStore(ctx.db).snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
