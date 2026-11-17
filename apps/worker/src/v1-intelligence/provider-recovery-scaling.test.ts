import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {readFileSync} from 'node:fs';
import {applyTestMigration} from '../test-migrations';
import {pendingProviderGenerationCandidates} from './provider-recovery';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const now=new Date('2026-10-03T12:00:00Z');
beforeEach(async()=>{ctx=await createIntakeDatabase({modelSpending:false});await new V1FeedStore(ctx.db).registerFeed(feedFixture)},30000);
afterEach(async()=>ctx.dispose(),30000);
const oldSql=`SELECT DISTINCT r.id,r.feed_id,(SELECT MAX(json_extract(a.json,'$.createdAt')) FROM v1_feed_documents a WHERE a.kind='model_provider_recovery_attempts' AND json_extract(a.json,'$.reservationId')=r.id) AS last_attempt FROM v1_model_spending_reservations r
 JOIN v1_feed_documents d ON d.kind='model_provider_receipts' AND d.feed_id=r.feed_id AND json_extract(d.json,'$.reservationId')=r.id
 LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
 WHERE COALESCE(s.reported,0)=0 AND r.lease_until<=? AND json_extract(d.json,'$.provider')='OPENROUTER' AND json_extract(d.json,'$.generationId') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents a WHERE a.kind='model_provider_recovery_attempts' AND json_extract(a.json,'$.reservationId')=r.id AND json_extract(a.json,'$.nextAttemptAt')>?)
 ORDER BY last_attempt,r.created_at LIMIT 3`;
async function seed(n:number){
 const statements:D1PreparedStatement[]=[];
 for(let i=0;i<n;i++){
  const id='reservation-'+i,createdAt=new Date(now.getTime()-86400000+i*1000).toISOString();
  statements.push(ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'fixture-account',null,'token', 'fixture-model','feed-1',.2,i%17===0?now.getTime()+1:0,createdAt,'{}'));
  if(i%11!==0)statements.push(ctx.db.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,?,?,?)').bind(id,'token',.01,i%13===0?0:1));
  for(let j=0;j<2;j++)statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('model_provider_receipts','receipt-'+i+'-'+j,'feed-1',JSON.stringify({reservationId:id,provider:i%19===0?'OTHER':'OPENROUTER',generationId:i%23===0?null:'gen-fixture'})));
  for(let j=0;j<3;j++)statements.push(ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('model_provider_recovery_attempts','attempt-'+i+'-'+j,'feed-1',JSON.stringify({reservationId:id,createdAt:new Date(now.getTime()-100000+i*10+j).toISOString(),...(i%29===0?{nextAttemptAt:new Date(now.getTime()+1).toISOString()}:j===1?{nextAttemptAt:now.toISOString()}:{})})));
 }
 for(let offset=0;offset<statements.length;offset+=90)await ctx.db.batch(statements.slice(offset,offset+90));
}
it('preserves complete recovery eligibility, global backoff, duplicate receipts and oldest-attempt order with linear history reads',async()=>{
 await seed(180);
 // Attempt rows are globally bound to reservation identity in the old query,
 // even when a malformed legacy record carries a foreign Feed. Preserve that
 // conservative backoff rather than making additional provider lookups.
 await new V1FeedStore(ctx.db).registerFeed({...feedFixture,id:'foreign-feed'});
 await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('model_provider_recovery_attempts','foreign-backoff','foreign-feed',JSON.stringify({reservationId:'reservation-11',createdAt:now.toISOString(),nextAttemptAt:new Date(now.getTime()+1).toISOString()})).run();
 const before=await ctx.db.prepare(oldSql).bind(now.getTime(),now.toISOString()).all();
 const after=await pendingProviderGenerationCandidates(ctx.db,now);
 expect(after.results).toEqual(before.results);
 expect(after.results).toHaveLength(3);
 expect(after.meta.rows_read).toBeLessThan(before.meta.rows_read/5);
 console.info(JSON.stringify({type:'PROVIDER_RECOVERY_QUERY_BENCHMARK',beforeRows:before.meta.rows_read,afterRows:after.meta.rows_read,beforeSqlMs:before.meta.duration,afterSqlMs:after.meta.duration,providerCalls:0}));
},60000);
it('keeps missing history eligible and missing handles ineligible without mutating financial or recovery rows',async()=>{
 await seed(12);
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='model_provider_recovery_attempts'").run();
 const before=await ctx.db.prepare(oldSql).bind(now.getTime()+1,now.toISOString()).all();
 const after=await pendingProviderGenerationCandidates(ctx.db,new Date(now.getTime()+1));
 expect(after.results).toEqual(before.results);
 expect(after.results).toEqual([{id:'reservation-11',feed_id:'feed-1',last_attempt:null}]);
 expect(after.meta.rows_written).toBe(0);
});

it('indexes recovery metadata and preserves exact candidates without loading unrelated retained documents',async()=>{
 await seed(180);
 const before=await pendingProviderGenerationCandidates(ctx.db,now);
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0071_provider_recovery_indexes.sql',import.meta.url),'utf8'));
 const after=await pendingProviderGenerationCandidates(ctx.db,now);
 expect(after.results).toEqual(before.results);
 const plans=await ctx.db.prepare("EXPLAIN QUERY PLAN SELECT json_extract(json,'$.reservationId'),MAX(json_extract(json,'$.createdAt')) FROM v1_feed_documents WHERE kind='model_provider_recovery_attempts' GROUP BY json_extract(json,'$.reservationId')").all<{detail:string}>();
 expect(plans.results.map(r=>r.detail).join(' ')).toContain('v1_provider_recovery_history');
 expect(after.meta.rows_read).toBeLessThan(before.meta.rows_read);
 console.info(JSON.stringify({type:'INDEXED_RECOVERY_BENCHMARK',beforeRows:before.meta.rows_read,afterRows:after.meta.rows_read,beforeMs:before.meta.duration,afterMs:after.meta.duration}));
});
