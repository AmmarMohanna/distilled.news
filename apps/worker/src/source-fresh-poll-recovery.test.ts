import {it,expect} from 'vitest';import {DatabaseSync} from 'node:sqlite';import {recoverExpiredTwitterReads} from './source-fresh-poll-recovery';import {hasUncertainSourcePayment} from './connector-paid-fence';
it('recovers only opted-in expired X reads without refunding charges or replaying original identities',async()=>{
 const sql=new DatabaseSync(':memory:');try{
 sql.exec(`CREATE TABLE accounts(id TEXT,disabled_at TEXT);CREATE TABLE briefings(id TEXT,owner_account_id TEXT,paused INTEGER);CREATE TABLE sources(id TEXT,briefing_id TEXT,enabled INTEGER);CREATE TABLE connector_provider_operations(provider_id TEXT,operation_id TEXT,request_hash TEXT,ceiling_usd REAL,status INTEGER,payload_ref TEXT,headers TEXT,feed_id TEXT,feed_source_id TEXT);INSERT INTO accounts VALUES('owner',NULL);INSERT INTO briefings VALUES('feed','owner',0);INSERT INTO sources VALUES('source','feed',1);`);
 for(const [id,provider,expiry] of [['expired','x_twitterapi_io','08:00'],['recent','x_twitterapi_io','08:20'],['active','x_twitterapi_io','09:00'],['actor','x_apify','08:00'],['zyte','zyte','08:00'],['legacy','x_twitterapi_io',null]])sql.prepare('INSERT INTO connector_provider_operations VALUES(?,?,?,?,?,?,?,?,?)').run(provider,id,'hash-'+id,.01,-1,null,JSON.stringify(expiry?{claimExpiresAt:`2026-10-30T${expiry}:00Z`}:{}),'feed','source');
 const db={prepare:(query:string)=>{let args:any[]=[];const stmt={bind:(...v:any[])=>{args=v;return stmt},all:async()=>({results:sql.prepare(query).all(...args)}),first:async()=>sql.prepare(query).get(...args)??null};return stmt}} as unknown as D1Database;
 const env={DB:db,SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS:'["feed"]'},now=new Date('2026-10-30T08:30:00Z'),before=sql.prepare('SELECT * FROM connector_provider_operations').all();
 for(const config of [undefined,'bad','["other"]'])expect(await recoverExpiredTwitterReads({...env,SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS:config},'feed','source',now)).toBe(0);
 expect(await recoverExpiredTwitterReads(env,'feed','other',now)).toBe(0);
 sql.exec('UPDATE briefings SET paused=1');expect(await recoverExpiredTwitterReads(env,'feed','source',now)).toBe(0);sql.exec('UPDATE briefings SET paused=0');
 expect(await recoverExpiredTwitterReads(env,'feed','source',now)).toBe(1);expect(await recoverExpiredTwitterReads(env,'feed','source',now)).toBe(0);
 const after=sql.prepare('SELECT * FROM connector_provider_operations').all();expect(after.map(({headers,...r})=>r)).toEqual(before.map(({headers,...r})=>r));expect(after.slice(1)).toEqual(before.slice(1));
 expect(JSON.parse(String(after[0].headers)).acknowledgement).toMatchObject({requestHash:'hash-expired',reservedCeilingUsd:.01,approvedBy:'owner',kind:'UNKNOWN_OUTCOME_ACCEPTED_NO_REPLAY'});
 expect(await hasUncertainSourcePayment(db,'feed','source',['x_twitterapi_io'])).toBe(true);
 sql.exec("DELETE FROM connector_provider_operations WHERE operation_id<>'expired'");expect(await hasUncertainSourcePayment(db,'feed','source',['x_twitterapi_io'])).toBe(false);
 }finally{sql.close()}
});
