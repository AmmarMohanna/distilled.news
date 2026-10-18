import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Read-only, fixed-target smoke test. This does not request publication or spend.
const origin='https://distilled-news-staging.distillednews-platform.workers.dev';
const dist=fileURLToPath(new URL('../apps/web/dist/',import.meta.url));
const hash=body=>createHash('sha256').update(body).digest('hex');
async function get(path){
 const started=performance.now(),response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(30000),redirect:'error'});
 const body=Buffer.from(await response.arrayBuffer());
 if(!response.ok)throw Error('STAGING_HTTP_'+response.status);
 return {body,metadata:{path,status:response.status,contentType:response.headers.get('content-type'),durationMs:performance.now()-started,bytes:body.length,sha256:hash(body)}};
}
const root=await get('/'),localIndex=await readFile(dist+'index.html');
if(hash(root.body)!==hash(localIndex))throw Error('STAGING_INDEX_DIFFERS_FROM_BUILD');
const paths=[...root.body.toString('utf8').matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m=>m[1]);
if(!paths.some(p=>p.endsWith('.js'))||!paths.some(p=>p.endsWith('.css')))throw Error('STAGING_ASSET_REFERENCES_MISSING');
const assets=[];
for(const path of [...new Set(paths)].slice(0,6)){
 if(path.includes('..'))throw Error('UNEXPECTED_ASSET_PATH');
 const remote=await get(path),local=await readFile(dist+path.slice(1));
 if(hash(remote.body)!==hash(local))throw Error('STAGING_ASSET_DIFFERS_FROM_BUILD');
 assets.push(remote.metadata);
}
const session=await get('/api/session');
const value=JSON.parse(session.body.toString('utf8'));
console.log(JSON.stringify({observedAt:new Date().toISOString(),origin,index:root.metadata,assets,session:{...session.metadata,sha256:undefined,keys:Object.keys(value).sort()},publicationVerified:false},null,2));
