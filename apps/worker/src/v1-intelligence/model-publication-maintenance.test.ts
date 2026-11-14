import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {applyTestMigration} from '../test-migrations';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {checkBriefingModelStall,retirePausedUnstartedWindows} from './model-publication-maintenance';
import {settleModelSpending} from './model-spending';

it('retires stale unstarted paused windows and warns only when active waiting feeds have no confirmed model calls',async()=>{
 const {db,dispose}=await createIntakeDatabase();
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{
  await db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY,disabled_at TEXT); CREATE TABLE briefings (id TEXT PRIMARY KEY,paused INTEGER,owner_account_id TEXT);');
  await applyTestMigration(db,readFileSync(new URL('../../migrations/0094_model_wait_lookup.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO accounts VALUES('owner',NULL); INSERT INTO briefings VALUES('paused',1,'owner'),('live',0,'owner');");
  for(const feed of ['paused','live'])await db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(feed,JSON.stringify({id:feed,revision:1,paused:feed==='paused'})).run();
  const now=new Date(),old=new Date(+now-30*60_000).toISOString();
  for(const [id,feedId,end] of [['stale','paused',old],['paid','paused',old],['prepared','paused',old],['recent','paused',new Date(+now-5*60_000).toISOString()],['waiting','live',old]]){
   const value={id,feedId,createdAt:old,engine:'v3',state:'PENDING',reason:'PROVIDER_RESOURCE_WAIT',window:{kind:'30M',end}};
   await db.prepare("INSERT INTO v1_feed_documents VALUES('briefing_requests',?,?,?)").bind(id,feedId,JSON.stringify(value)).run();
  }
  await db.exec(`INSERT INTO v1_feed_documents VALUES('semantic_intents','reserved','paused','{"input":{"budgetKey":"v3:paid"}}');
    INSERT INTO v1_feed_documents VALUES('v3_window_results','prepared','paused','{}');`);
  expect(await retirePausedUnstartedWindows(db,now)).toBe(1);
  expect(await db.prepare("SELECT epoch FROM v1_feeds WHERE id='paused'").first('epoch')).toBe(2);
  expect(await db.prepare("SELECT id FROM v1_feed_documents WHERE kind='briefing_requests' AND json_extract(json,'$.state')='DONE'").first('id')).toBe('stale');
  expect(await retirePausedUnstartedWindows(db,now)).toBe(0);
  expect(await checkBriefingModelStall(db,now)).toBe(true);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('V1_BRIEFING_MODEL_STALLED'));
  const reservation={id:'recent-call',accountId:'test-only-account',feedId:'live',token:'owner',model:'openai/gpt-4.1',reservedCostUsd:.01,leaseUntil:+now+120_000,createdAt:now.toISOString()};
  await db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,NULL,?,?,?,?,?,?,?)')
   .bind(reservation.id,reservation.accountId,reservation.token,reservation.model,reservation.feedId,
    reservation.reservedCostUsd,reservation.leaseUntil,reservation.createdAt,JSON.stringify(reservation)).run();
  expect(await checkBriefingModelStall(db,now)).toBe(true);
  await settleModelSpending(db,reservation.id,reservation.token,{costUsd:.001,reported:true});
  expect(await checkBriefingModelStall(db,now)).toBe(false);
  expect(warn).toHaveBeenCalledTimes(2);
 }finally{warn.mockRestore();await dispose()}
},30000);
