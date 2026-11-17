import {Miniflare} from 'miniflare';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
/** Persistent local D1 only; migrations and spending authority are explicit. */
export async function persistentEvaluationDatabase(path:string){
 // workerd's SQLite suffix pushes deep Windows worktrees past MAX_PATH.
 // Keep a deterministic short local path; never delete a previous database.
 const persistedPath=process.platform==='win32'&&path.length>120?join(tmpdir(),'dn-e2e-'+createHash('sha256').update(path).digest('hex').slice(0,16)):path;
 mkdirSync(persistedPath,{recursive:true});
 const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('isolated evaluation only')}}",d1Databases:['DB'],d1Persist:persistedPath});
 return {db:await mf.getD1Database('DB') as unknown as D1Database,persistedPath,dispose:()=>mf.dispose()};
}
