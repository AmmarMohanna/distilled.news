import {expect,it} from 'vitest';
import {Miniflare} from 'miniflare';
import {applyTestMigration,migrationStatements} from './test-migrations';

it('loads complete SQLite triggers with CASE, several statements, quoted semicolons and comments',async()=>{
 const sql=`CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT);
 CREATE TABLE audit(value TEXT);
 -- A comment; does not end a statement
 CREATE TRIGGER record_item AFTER INSERT ON items BEGIN
   INSERT INTO audit VALUES(CASE WHEN NEW.id=1 THEN 'first; item' ELSE 'other' END);
   INSERT INTO audit VALUES('it''s recorded; intact');
 END;
 INSERT INTO items VALUES(1,'value; kept');`;
 expect(migrationStatements(sql)).toHaveLength(4);
 const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB']});
 try{const db=await mf.getD1Database('DB');await applyTestMigration(db,sql);expect((await db.prepare('SELECT value FROM audit ORDER BY rowid').all()).results).toEqual([{value:'first; item'},{value:"it's recorded; intact"}]);}finally{await mf.dispose();}
},30000);

it('applies every retained product migration without breaking immutable financial triggers',async()=>{
 const {createIntakeDatabase}=await import('./v1-intake/test-utils');
 const ctx=await createIntakeDatabase({product:true});
 try {
  await expect(ctx.db.prepare("DELETE FROM v1_model_spending_authorizations WHERE id='test-only-grant'").run()).rejects.toThrow('MODEL_AUTHORITY_IMMUTABLE');
  expect(await ctx.db.prepare("SELECT COUNT(*) AS total FROM v1_model_spending_authorizations").first('total')).toBe(1);
 } finally {await ctx.dispose();}
},30000);
