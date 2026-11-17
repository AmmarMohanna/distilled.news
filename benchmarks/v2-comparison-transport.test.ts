import {it,expect} from 'vitest';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {comparisonBudgetGuard,createComparisonTransport} from './v2-comparison-transport';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
it('denies accidental paid execution without explicit invocation',async()=>{await expect(createComparisonTransport('offline',[])).rejects.toThrow('COMPARISON_EXPLICIT_APPROVAL_REQUIRED')});
it('atomically enforces the single shared budget, unknown-charge stop and call count',async()=>{
 const ctx=await persistentEvaluationDatabase(join(tmpdir(),'dn-comp-test-'+randomUUID()));try{const db=ctx.db;
 await db.exec('CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,feed_id TEXT,reserved_cost_usd REAL); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER); CREATE TABLE v1_model_spending_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));');
 const admit=async(next:number,until=new Date(Date.now()+60000).toISOString())=>{const g=comparisonBudgetGuard(db,'eval',next,until);await db.batch([g.statement,db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(g.guard)])};
 await admit(.1);await db.exec("INSERT INTO v1_model_spending_reservations VALUES('a','eval',.1)");await expect(admit(.1)).rejects.toThrow();
 await db.exec("INSERT INTO v1_model_spending_settlements VALUES('a',.05,1)");await admit(.1);await expect(admit(3)).rejects.toThrow();await expect(admit(.1,'2020-01-01T00:00:00Z')).rejects.toThrow();
 const bounded=async(next:number,settledActual:boolean)=>{const g=comparisonBudgetGuard(db,'eval',next,new Date(Date.now()+60000).toISOString(),{calls:12,usd:1,settledActual});await db.batch([g.statement,db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(g.guard)])};
 await bounded(.94,true);await expect(bounded(.94,false)).rejects.toThrow();await expect(bounded(.96,true)).rejects.toThrow();
 await db.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<59) INSERT INTO v1_model_spending_reservations SELECT 'n'||i,'eval',0 FROM n; INSERT INTO v1_model_spending_settlements SELECT id,0,1 FROM v1_model_spending_reservations WHERE id!='a';");await expect(admit(.01)).rejects.toThrow();
 }finally{await ctx.dispose()}
},30000);
it('stops at sixteen additional calls or sixteen additional cents including pending reservations',async()=>{
 const ctx=await persistentEvaluationDatabase(join(tmpdir(),'dn-single-approved-trial-'+randomUUID()));try{const db=ctx.db;await db.exec('CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,feed_id TEXT,reserved_cost_usd REAL); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER); CREATE TABLE v1_model_spending_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));');
 await db.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<76) INSERT INTO v1_model_spending_reservations SELECT 'n'||i,'eval',0 FROM n; INSERT INTO v1_model_spending_settlements SELECT id,CASE WHEN id='n1' THEN .837708885 ELSE 0 END,1 FROM v1_model_spending_reservations;");
 const admit=async(next:number)=>{const g=comparisonBudgetGuard(db,'eval',next,new Date(Date.now()+60000).toISOString(),{calls:92,usd:.997708885,settledActual:true});await db.batch([g.statement,db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(g.guard)])};
 await admit(.1599);await expect(admit(.1601)).rejects.toThrow();
 await db.exec("INSERT INTO v1_model_spending_reservations VALUES('pending','eval',.01)");await expect(admit(.001)).rejects.toThrow();await db.exec("INSERT INTO v1_model_spending_settlements VALUES('pending',.01,1)");await admit(.1499);await expect(admit(.1501)).rejects.toThrow();
 await db.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<15) INSERT INTO v1_model_spending_reservations SELECT 'extra'||i,'eval',0 FROM n; INSERT INTO v1_model_spending_settlements SELECT id,0,1 FROM v1_model_spending_reservations WHERE id LIKE 'extra%';");await expect(admit(.001)).rejects.toThrow();
 }finally{await ctx.dispose()}
},30000);