import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Same immutable manifest/hash procedure as the existing QA uploader, with a
// separate, hard-guarded staging target. Never imports the QA configuration.
export function assertStagingTarget(config){
 for(const [key,value] of Object.entries({name:'distilled-news-staging',account_id:'e32b564514d4f9b9e383b7dd30dbb026',bucket_name:'distilled-news-staging-raw'})){
  const found=[...config.matchAll(new RegExp('^'+key+'\\s*=\\s*"([^"\\r\\n]+)"','gm'))];
  if(found.length!==1||found[0][1]!==value)throw Error('UNEXPECTED_STAGING_TARGET');
 }
}
async function main(){
 const root=fileURLToPath(new URL('../',import.meta.url)),worker=path.join(root,'apps/worker'),dist=path.join(root,'apps/web/dist');
 assertStagingTarget(await readFile(path.join(worker,'wrangler.staging.toml'),'utf8'));
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
 async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(p));else if(entry.isFile())out.push(p)}return out}
 const entries={},objects=new Map();
 for(const file of (await files(dist)).sort()){
  const type=types[path.extname(file)];if(!type)throw Error('UNKNOWN_ASSET_TYPE');
  const hash=createHash('md5').update(await readFile(file)).digest('hex');
  entries['/'+path.relative(dist,file).split(path.sep).join('/')]={hash,type};objects.set(hash,{file,type});
 }
 if(!entries['/index.html'])throw Error('MISSING_INDEX');
 const manifest=JSON.stringify(entries),prefix='staging-assets/'+createHash('sha1').update(manifest).digest('hex')+'/';
 const local=path.join(root,'.local-reports/briefing-latency');await mkdir(local,{recursive:true});
 const manifestFile=path.join(local,'staging-asset-manifest.json');await writeFile(manifestFile,manifest);
 async function upload(key,file,type){await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'r2','object','put','distilled-news-staging-raw/'+key,'--file',file,'--content-type',type,'--remote','--config','wrangler.staging.toml'],{cwd:worker,stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('STAGING_ASSET_UPLOAD_FAILED')));
 })}
 if(process.argv.includes('--upload')){
  for(const [hash,{file,type}] of objects)await upload(prefix+hash,file,type);
  await upload(prefix+'manifest.json',manifestFile,'application/json');
 }
 console.log(JSON.stringify({prefix,files:Object.keys(entries).length,uploaded:process.argv.includes('--upload')}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
