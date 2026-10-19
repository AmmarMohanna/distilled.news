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
