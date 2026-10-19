import {expect,it} from 'vitest';
import {Miniflare} from 'miniflare';
import {stagingMissionDb} from './staging-mission-budget';
it('atomically caps mission charges plus unknown holds without replacing account guards',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response()}}',d1Databases:['DB']});
 try{
  const raw=await mf.getD1Database('DB') as unknown as D1Database;
  await raw.exec("CREATE TABLE v1_model_spending_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1)); CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,account_id TEXT,authorization_id TEXT,token TEXT,model TEXT,feed_id TEXT,reserved_cost_usd REAL,lease_until INTEGER,created_at TEXT,json TEXT); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER);");
  const feed='staging-fresh-fixture',db=stagingMissionDb(raw,feed,1);
  const reserve=(id:string,cost:number,scope=feed)=>db.batch([db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'a','g','t','m',scope,cost,0,'now','{}')]);
  await reserve('unknown',.6);await expect(reserve('too-much',.5)).rejects.toThrow();
  expect(await raw.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(1);
  await raw.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,?,1)').bind('unknown',.1).run();
  await reserve('allowed',.8);await expect(reserve('wrong-feed',.01,'other')).rejects.toThrow('SCOPE_MISMATCH');
  await expect(db.batch([db.prepare('INSERT INTO v1_model_spending_guards VALUES(?,0)').bind('account-denial'),db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind('denied','a','g','t','m',feed,.01,0,'now','{}')])).rejects.toThrow();
  expect(await raw.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(2);
 }finally{await mf.dispose()}
});

it('keeps a settled failure counted against the fixed model-call envelope',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response()}}',d1Databases:['DB']});
 try{
  const raw=await mf.getD1Database('DB') as unknown as D1Database;
  await raw.exec("CREATE TABLE v1_model_spending_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1)); CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,account_id TEXT,authorization_id TEXT,token TEXT,model TEXT,feed_id TEXT,reserved_cost_usd REAL,lease_until INTEGER,created_at TEXT,json TEXT); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER);");
  const feed='staging-fresh-counted',db=stagingMissionDb(raw,feed,.20,undefined,{m:1});
  const reserve=(id:string,model='m')=>db.batch([db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'a','g','t',model,feed,.05,0,'now','{}')]);
  await reserve('failed');await raw.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,0.001,1)').bind('failed').run();
  await expect(reserve('unapproved-extra-call')).rejects.toThrow();await expect(reserve('unapproved-model','other')).rejects.toThrow('MISSION_MODEL_OPERATION_LIMIT_INVALID');
  expect(await raw.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(1);
 }finally{await mf.dispose()}
});
