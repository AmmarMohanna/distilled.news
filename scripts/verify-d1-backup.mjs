import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

// Local restoration drill. Never executes SQL against a live database.
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw new Error('Usage: node scripts/verify-d1-backup.mjs exported.sql ignored-output-directory');
const sql=await readFile(input),key=randomBytes(32),iv=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',key,iv);
const encrypted=Buffer.concat([cipher.update(sql),cipher.final()]);
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'backup.key'),key,{mode:0o600});
await writeFile(path.join(output,'backup.encrypted'),Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});
const stored=await readFile(path.join(output,'backup.encrypted'));
const decipher=createDecipheriv('aes-256-gcm',await readFile(path.join(output,'backup.key')),stored.subarray(0,12));
decipher.setAuthTag(stored.subarray(12,28));
const restored=Buffer.concat([decipher.update(stored.subarray(28)),decipher.final()]);
if(!restored.equals(sql))throw new Error('BACKUP_CONTENT_MISMATCH');
const db=new DatabaseSync(':memory:');
try{
 db.exec('PRAGMA foreign_keys=OFF');
 try{db.exec(restored.toString('utf8'));}
 catch{throw new Error('RESTORE_SQL_IMPORT_FAILED');} // SQLite errors may contain private SQL values.
 db.exec('PRAGMA foreign_keys=ON');
 const integrity=db.prepare('PRAGMA integrity_check').all();
 if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw new Error('RESTORE_INTEGRITY_FAILED');
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const counts=Object.fromEntries(tables.map(({name})=>[name,db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"','""')}"`).get().n]));
 const foreignKeyViolations=db.prepare('PRAGMA foreign_key_check').all();
 const report={verifiedAt:new Date().toISOString(),scope:'local SQLite restoration of D1 SQL export; excludes R2 and live remote recovery',sqlSha256:createHash('sha256').update(sql).digest('hex'),sqlBytes:sql.length,integrity:'ok',foreignKeyViolationCount:foreignKeyViolations.length,tables:counts};
 await writeFile(path.join(output,'restore-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({integrity:report.integrity,foreignKeyViolationCount:report.foreignKeyViolationCount,sqlBytes:report.sqlBytes,tables:tables.length,report:path.join(output,'restore-report.json')}));
 if(foreignKeyViolations.length)throw new Error('RESTORE_FOREIGN_KEY_VIOLATIONS');
}finally{db.close();}
