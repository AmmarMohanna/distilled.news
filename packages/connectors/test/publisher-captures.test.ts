import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {discoverByUrlPattern,discoverWebsiteArticles,isWebsiteListingUrl} from '../src/source-runtime/website-discovery';

/** Real listing pages saved with scripts/capture-publisher-fixtures.mjs. */
const dir=join(__dirname,'fixtures','publishers');
const index=JSON.parse(readFileSync(join(dir,'index.json'),'utf8')) as {captures:{file:string;url:string;capturedAt:string;minArticles:number}[]};

describe('saved publisher listing pages',()=>{
 it.skipIf(index.captures.length>0)('has no saved pages yet',()=>{});
 it.each(index.captures)('$file still yields at least $minArticles article links',({file,url,minArticles})=>{
  const html=readFileSync(join(dir,file),'utf8');
  const regular=discoverWebsiteArticles(html,url)?.articles??[];
  const articles=regular.length?regular:discoverByUrlPattern(html,url);
  expect(articles.length).toBeGreaterThanOrEqual(minArticles);
  for(const article of articles){
   expect(new URL(article.url).origin).toBe(new URL(url).origin);
   expect(isWebsiteListingUrl(article.url)).toBe(false);
  }
 });
});
