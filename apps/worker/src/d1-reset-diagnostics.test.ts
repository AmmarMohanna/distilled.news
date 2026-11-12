import {afterEach,expect,it,vi} from 'vitest';
import {withD1ResetDiagnostics} from './d1-reset-diagnostics';
afterEach(()=>vi.restoreAllMocks());
function nativeDatabase(failure?:Error){
 const calls:{method:string;args:unknown[]}[]=[],result={native:true};
 class Statement{
  constructor(readonly sql:string){}
  bind(...args:unknown[]){expect(this).toBeInstanceOf(Statement);calls.push({method:'bind',args});return this;}
  async first(...args:unknown[]){return this.execute('first',args);}
  async all(...args:unknown[]){return this.execute('all',args);}
  async run(...args:unknown[]){return this.execute('run',args);}
  async raw(...args:unknown[]){return this.execute('raw',args);}
  async execute(method:string,args:unknown[]){expect(this).toBeInstanceOf(Statement);calls.push({method,args});if(failure)throw failure;return result;}
 }
 const prepared=new Set<Statement>();
 const native={
  prepare(sql:string){expect(this).toBe(native);calls.push({method:'prepare',args:[sql]});const statement=new Statement(sql);prepared.add(statement);return statement;},
  async batch(statements:Statement[]){expect(this).toBe(native);expect(statements.every(s=>prepared.has(s))).toBe(true);calls.push({method:'batch',args:[statements]});if(failure)throw failure;return result;},
  async exec(sql:string){expect(this).toBe(native);calls.push({method:'exec',args:[sql]});if(failure)throw failure;return result;},
  untouched(){expect(this).toBe(native);return result;},
 };
 return {db:native as unknown as D1Database,calls,result,native};
}
it('logs reset statement structure and stable hash without bound values, SQL literals, comments or error text',async()=>{
 const secret='private-source-content-and-token';const failure=new Error(`D1_ERROR: DB exceeded its CPU time limit and was reset [7429] ${secret}`);
 const {db}=nativeDatabase(failure),log=vi.spyOn(console,'error').mockImplementation(()=>{}),wrapped=withD1ResetDiagnostics(db);
 const sql=`SELECT json_extract(json,'$.private') FROM sensitive WHERE id=? AND label='${secret}' /* ${secret} */ AND n=123 -- ${secret}\n`;
 for(let i=0;i<2;i++)await expect(wrapped.prepare(sql).bind(secret,new Uint8Array([3,4])).first('private')).rejects.toBe(failure);
 expect(log).toHaveBeenCalledTimes(2);
 const entries=log.mock.calls.map(args=>JSON.parse(String(args[0])));
 expect(entries[0]).toMatchObject({type:'D1_CPU_RESET',method:'first',statementCount:1});
 expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);expect(entries[0].statements[0].hash).toMatch(/^[a-f0-9]{64}$/);
 expect(entries[0].statements[0].hash).toBe(entries[1].statements[0].hash);
 expect(entries[0].statements[0].sql).toContain('FROM sensitive WHERE id=?');
 expect(entries[0].statements[0].sql.length).toBeLessThanOrEqual(160);
 expect(JSON.stringify(entries)).not.toContain(secret);expect(entries[0].statements[0].sql).not.toContain('123');
});
it('preserves native receivers, argument identities and results across statement methods and batch unwrapping',async()=>{
 const {db,calls,result,native}=nativeDatabase(),log=vi.spyOn(console,'error').mockImplementation(()=>{}),wrapped=withD1ResetDiagnostics(db);
 expect(withD1ResetDiagnostics(db)).toBe(wrapped);expect(withD1ResetDiagnostics(wrapped)).toBe(wrapped);
 const bytes=new Uint8Array([1,2]),statement=wrapped.prepare('SELECT ?').bind(bytes,'value',null),rawOptions={columnNames:true} as const;
 for(const method of ['all','run'] as const)expect(await statement[method]()).toBe(result);
 expect(await statement.first('column')).toBe(result);expect(await statement.raw(rawOptions)).toBe(result);
 expect(await wrapped.batch([statement])).toBe(result);expect(await wrapped.exec('SELECT 1')).toBe(result);
 expect((wrapped as unknown as typeof native).untouched()).toBe(result);
 expect(calls.find(c=>c.method==='bind')!.args[0]).toBe(bytes);
 expect(calls.find(c=>c.method==='raw')!.args[0]).toBe(rawOptions);expect(log).not.toHaveBeenCalled();
});
it('identifies every failed batch statement and exec while leaving other errors unlogged and unchanged',async()=>{
 const failure=new Error('D1 DB exceeded its CPU time limit and was reset.'),log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const {db}=nativeDatabase(failure),wrapped=withD1ResetDiagnostics(db);
 await expect(wrapped.batch([wrapped.prepare('SELECT ?').bind('secret'),wrapped.prepare("UPDATE jobs SET json='secret' WHERE id=?").bind('secret')])).rejects.toBe(failure);
 await expect(wrapped.exec("SELECT 'secret'; SELECT 2;")).rejects.toBe(failure);
 const batch=JSON.parse(String(log.mock.calls[0][0]));expect(batch).toMatchObject({method:'batch',statementCount:2});expect(batch.statements).toHaveLength(2);
 expect(batch.statements[0].hash).not.toBe(batch.statements[1].hash);expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
 const other=new Error('ordinary SQL failure'),plain=withD1ResetDiagnostics(nativeDatabase(other).db);
 await expect(plain.prepare('SELECT 1').all()).rejects.toBe(other);expect(log).toHaveBeenCalledTimes(2);
 log.mockImplementation(()=>{throw Error('logger unavailable')});await expect(wrapped.prepare('SELECT 1').run()).rejects.toBe(failure);
});

it('preserves real D1 prepared statement and atomic batch behavior',async()=>{
 const {createIntakeDatabase}=await import('./v1-intake/test-utils');
 const ctx=await createIntakeDatabase();
 try{
  const db=withD1ResetDiagnostics(ctx.db);
  await db.exec('CREATE TABLE diagnostic_smoke(id TEXT PRIMARY KEY,value TEXT)');
  const results=await db.batch([
   db.prepare('INSERT INTO diagnostic_smoke(id,value) VALUES(?,?)').bind('one','first'),
   db.prepare('INSERT INTO diagnostic_smoke(id,value) VALUES(?,?)').bind('two','second'),
  ]);
  expect(results).toHaveLength(2);expect(results.every(row=>row.success)).toBe(true);
  expect(await db.prepare('SELECT value FROM diagnostic_smoke WHERE id=?').bind('one').first('value')).toBe('first');
  expect((await db.prepare('SELECT id,value FROM diagnostic_smoke ORDER BY id').all()).results).toEqual([{id:'one',value:'first'},{id:'two',value:'second'}]);
  expect(await db.prepare('SELECT value FROM diagnostic_smoke ORDER BY id').raw()).toEqual([['first'],['second']]);
  await db.prepare('UPDATE diagnostic_smoke SET value=? WHERE id=?').bind('changed','two').run();
  expect(await db.prepare('SELECT value FROM diagnostic_smoke WHERE id=?').bind('two').first()).toEqual({value:'changed'});
 }finally{await ctx.dispose()}
});
