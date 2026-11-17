import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {backfill}=createRequire(import.meta.url)('../../../../scripts/backfill-evidence-selection-index.cjs');
it('metadata backfill checkpoints bounded pages and writes only derived indexes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'distilled-metadata-')),statePath=join(dir,'state.json');const writes:string[]=[];
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{const q=JSON.parse(String(init.body));let rows:unknown[]=[];if(q.sql.startsWith('SELECT e.id'))rows=q.params[0]===''?[{evidence_id:'e1',revision_id:'r1'}]:[];if(q.sql.startsWith('INSERT')){expect(q.sql).toMatch(/^INSERT OR IGNORE INTO v1_(revision_selection|observation_time)_index /);writes.push(q.sql)}return Response.json({success:true,result:[{results:rows,meta:{changes:q.sql.startsWith('INSERT')?1:0}}]})});
 try{const options={token:'fixture-only',accountId:'a'.repeat(32),databaseId:'b'.repeat(36),statePath,maxPages:1,paceMs:0};expect((await backfill(options)).completed).toBe(false);expect(JSON.parse(readFileSync(statePath,'utf8')).cursor).toBe('e1');expect((await backfill(options)).completed).toBe(true);expect(writes).toHaveLength(2)}finally{vi.unstubAllGlobals();unlinkSync(statePath);rmdirSync(dir)}
});
