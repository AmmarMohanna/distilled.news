#!/usr/bin/env node
// Save real publisher listing pages as regression fixtures.
//
//   node scripts/capture-publisher-fixtures.mjs https://www.alarabiya.net/aswaq/economy [more URLs...]
//
// Run it from a network that can reach the publishers (the CI sandbox cannot).
// Each page lands in packages/connectors/test/fixtures/publishers/<host>/ and is
// listed in index.json, where publisher-captures.test.ts checks that discovery
// still finds article links in it. Commit the fixture together with the fix it
// covers. Only public HTTPS pages; cross-origin redirects are refused.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,posix,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

export const FIXTURE_DIR=join(dirname(fileURLToPath(import.meta.url)),'..','packages','connectors','test','fixtures','publishers');
const MAX_BYTES=2_000_000;

export function fixturePath(url,capturedAt){
  const target=new URL(url);
  const slug=(target.pathname.replace(/^\/+|\/+$/g,'')||'home').replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,60);
  return posix.join(target.hostname.replace(/^www\./,''),`${capturedAt.slice(0,10)}-${slug}.html`);
}

export function upsertCapture(index,entry){
  const captures=index.captures.filter(row=>row.file!==entry.file);
  captures.push(entry);
  captures.sort((a,b)=>a.file.localeCompare(b.file));
  return {...index,captures};
}

export async function fetchListing(url,fetcher=fetch){
  let current=new URL(url);
  if(current.protocol!=='https:')throw new Error(`Only https URLs are captured: ${url}`);
  for(let hop=0;hop<5;hop++){
    const response=await fetcher(current.href,{redirect:'manual',headers:{accept:'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 (fixture capture)'}});
    if([301,302,303,307,308].includes(response.status)){
      const next=new URL(response.headers.get('location')??'',current);
      if(next.origin!==current.origin)throw new Error(`${url} redirects to another site (${next.origin}); update the source URL instead.`);
      current=next;continue;
    }
    if(response.status!==200)throw new Error(`${url} returned HTTP ${response.status}`);
    const html=await response.text();
    if(new TextEncoder().encode(html).length>MAX_BYTES)throw new Error(`${url} is larger than ${MAX_BYTES} bytes`);
    return {html,finalUrl:current.href};
  }
  throw new Error(`${url} redirected too many times`);
}

async function main(urls){
  if(!urls.length){console.error('Usage: node scripts/capture-publisher-fixtures.mjs <listing URL> [...]');process.exit(2);}
  const indexPath=join(FIXTURE_DIR,'index.json');
  let index=JSON.parse(await readFile(indexPath,'utf8'));
  const {discoverWebsiteArticles,discoverByUrlPattern}=await import('../packages/connectors/src/source-runtime/website-discovery.ts').catch(()=>({}));
  for(const url of urls){
    const capturedAt=new Date().toISOString();
    const {html,finalUrl}=await fetchListing(url);
    const file=fixturePath(finalUrl,capturedAt);
    await mkdir(join(FIXTURE_DIR,dirname(file)),{recursive:true});
    await writeFile(join(FIXTURE_DIR,file),html);
    // Record what discovery finds today; the test then guards against regressions.
    let found;
    if(discoverWebsiteArticles){const regular=discoverWebsiteArticles(html,finalUrl)?.articles??[];found=regular.length?regular.length:discoverByUrlPattern(html,finalUrl).length;}
    index=upsertCapture(index,{file,url:finalUrl,capturedAt,minArticles:Math.max(1,Math.min(found??3,10))});
    console.log(`${relative(process.cwd(),join(FIXTURE_DIR,file))}: ${found??'?'} article links`);
  }
  await writeFile(indexPath,JSON.stringify(index,null,2)+'\n');
}

if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exit(1);});
