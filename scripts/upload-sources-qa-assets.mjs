import {createHash} from 'node:crypto';
import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Immutable assets for the isolated QA bucket. Uploading does not deploy a
// Worker: change its prefix only after every object and the manifest succeed.
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'apps/web/dist');
const worker=path.join(root,'apps/worker');
const config=await readFile(path.join(worker,'wrangler.sources-qa.toml'),'utf8');
if(!config.includes('name = "distilled-news-sources-qa"')||!config.includes('bucket_name = "distilled-news-sources-qa-raw"'))throw new Error('UNEXPECTED_QA_TARGET');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(p));else if(entry.isFile())out.push(p);}return out;}
const entries={},objects=new Map();
for(const file of (await files(dist)).sort()){
 const type=types[path.extname(file)];if(!type)throw new Error('UNKNOWN_ASSET_TYPE');
 const bytes=await readFile(file),hash=createHash('md5').update(bytes).digest('hex');
 entries['/'+path.relative(dist,file).split(path.sep).join('/')]={hash,type};objects.set(hash,{file,type});
}
if(!entries['/index.html'])throw new Error('MISSING_INDEX');
const manifest=JSON.stringify(entries);
const prefix='staging-assets/'+createHash('sha1').update(manifest).digest('hex')+'/';
await mkdir(path.join(root,'.review-tmp'),{recursive:true});
const manifestFile=path.join(root,'.review-tmp/qa-asset-manifest.json');
await writeFile(manifestFile,manifest);
async function upload(key,file,type){await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'r2','object','put','distilled-news-sources-qa-raw/'+key,'--file',file,'--content-type',type,'--remote'],{cwd:worker,stdio:'inherit',windowsHide:true});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('QA_ASSET_UPLOAD_FAILED')));
});}
if(process.argv.includes('--upload')){
 for(const [hash,{file,type}] of objects)await upload(prefix+hash,file,type);
 await upload(prefix+'manifest.json',manifestFile,'application/json');
}
console.log(JSON.stringify({prefix,files:Object.keys(entries).length,uploaded:process.argv.includes('--upload')}));
