import {expect,it,vi} from 'vitest';
import {nativeSourceExecution,composeSourceExecution} from './native-source-execution';
const html='<html><head><meta property="article:published_time" content="2026-10-21T12:00:00Z"></head><body><h1>New space mission</h1><article>NASA launched a lunar mission. <script>secret advertisement</script>It will explore the Moon.</article></body></html>';
it('marks an explicit subscription preview restricted even when its abstract is inside an article',async()=>{
 const page='<script type="application/ld+json">{"@type":"Article","isAccessibleForFree":false}</script><article><h1>Research</h1><p>Abstract only.</p><p data-test="institution-access-preview">This is a preview of subscription content, access via your institution.</p></article>';
 expect(await nativeSourceExecution().execute('extract',{url:'https://www.nature.com/articles/report',html:page})).toHaveProperty('accessRestricted',true);
});
it('retains unquoted structured publication metadata and the full article through large scripts',async()=>{
 const body='Scientists reported a measured result, with further confirmation still required. '.repeat(100);
 const page='<script>'+'x'.repeat(2_100_000)+'</script><script type=application/ld+json>'+JSON.stringify({'@type':'NewsArticle',datePublished:'2026-10-20T11:00:00Z',articleBody:body})+'</script>';
 expect(await nativeSourceExecution().execute('extract',{url:'https://publisher.example/story',html:page})).toMatchObject({body,publishedAt:'2026-10-20T11:00:00.000Z',pageKind:'article'});
});
it('reads TechSpot software detail descriptions without inventing publication dates from updates',async()=>{
 const page='<script type="application/ld+json">{"@type":"SoftwareApplication","dateModified":"2026-10-25T12:00:00Z"}</script><div class="product-details articleBody"><h1>PowerToys</h1><div id="dw_description"><p>Original description.</p><h2>Release notes</h2><p>Complete release notes and limitations.</p></div></div>';
 expect(await nativeSourceExecution().execute('extract',{url:'https://www.techspot.com/downloads/7185-microsoft-powertoys.html',html:page})).toMatchObject({pageKind:'article',body:'PowerToys Original description. Release notes Complete release notes and limitations.',publishedAt:undefined});
 expect(await nativeSourceExecution().execute('extract',{url:'https://www.techspot.com/downloads/',html:page})).not.toMatchObject({pageKind:'article'});
});
it('native mode retains configured Google, browser, Telegram and alternate HTTP execution',async()=>{
 const execute=vi.fn().mockResolvedValue({error:'TRANSIENT'}),fetcher=vi.fn();
 const execution=composeSourceExecution(true,{execute},fetcher);
 for(const kind of ['google_resolve','google_feed','playwright','public_article','telethon','telegram_resolve'] as const){
  await execution.execute(kind,{url:'https://publisher.example/story'},{timeoutMs:25000});
  expect(execute).toHaveBeenLastCalledWith(kind,{url:'https://publisher.example/story'},{timeoutMs:25000});
 }
 expect(await execution.execute('extract',{url:'https://publisher.example/story',html})).toMatchObject({pageKind:'article'});
 expect(execute).toHaveBeenCalledTimes(6);expect(fetcher).not.toHaveBeenCalled();
});
it('does not reroute helper backpressure to another execution or discard its retry fence',async()=>{
 const error=new Error('capacity');const execute=vi.fn().mockRejectedValue(error),fetcher=vi.fn();
 await expect(composeSourceExecution(true,{execute},fetcher).execute('google_resolve',{urls:[]})).rejects.toBe(error);
 expect(fetcher).not.toHaveBeenCalled();
});
it('extracts public article text and its actual publication date without scripts or invented metadata',async()=>{
 const execution=nativeSourceExecution();
 expect(await execution.execute('extract',{url:'https://publisher.example/space',html})).toMatchObject({title:'New space mission',publishedAt:'2026-10-21T12:00:00.000Z',pageKind:'article',body:'NASA launched a lunar mission. It will explore the Moon.'});
 expect(await execution.execute('extract',{url:'https://publisher.example/space',html:html.replace(/<meta[^>]+>/,'')})).toMatchObject({publishedAt:undefined,pageKind:'article'});
});
it('rejects private targets and does not pretend to support browser challenges or Telegram login',async()=>{
 const fetcher=vi.fn();const execution=nativeSourceExecution(fetcher);
 await expect(execution.execute('public_article',{url:'http://127.0.0.1/private'})).rejects.toThrow();
 expect(await execution.execute('playwright',{url:'https://publisher.example'})).toEqual({error:'UNAVAILABLE'});
 expect(await execution.execute('telegram_resolve',{username:'telegram'})).toEqual({error:'UNAVAILABLE'});
 expect(fetcher).not.toHaveBeenCalled();
});

it('attests the fetched URL for native public-article fallback acceptance',async()=>{
 const url='https://publisher.example/story';
 const execution=nativeSourceExecution(vi.fn().mockResolvedValue(new Response(html,{headers:{'content-type':'text/html'}})));
 expect(await execution.execute('public_article',{url})).toMatchObject({status:200,url,canonicalUrl:url,pageKind:'article'});
});
it('identifies an upstream HTTP failure separately from helper transport',async()=>{
 const execution=nativeSourceExecution(vi.fn().mockResolvedValue(new Response('',{status:503})));
 expect(await execution.execute('public_article',{url:'https://publisher.example/story'})).toMatchObject({status:503,failureOrigin:'upstream_http'});
});
it('marks an explicit paywalled teaser without mistaking accessible body text for a restriction',async()=>{
 const execution=nativeSourceExecution(),meta='<script type="application/ld+json">{"@type":"WebPage","isAccessibleForFree":false}</script>';
 const page=meta+'<h1>Story</h1><main><p>Only a teaser.</p><div id="paywall-prompt"></div></main>';
 expect(await execution.execute('extract',{url:'https://publisher.example/story',html:page})).toHaveProperty('accessRestricted',true);
 expect(await execution.execute('extract',{url:'https://publisher.example/story',html:page+'<article><h1>Story</h1><p>Publicly delivered article text.</p></article>'})).not.toHaveProperty('accessRestricted');
});

it('extracts Article-owned multi-paragraph descriptions without comments or sharing controls',async()=>{
 const page='<meta property="og:type" content="article"><div itemtype="http://schema.org/Article"><h1>Cabinet decision</h1><div class="sharing-widget">Share</div><div itemprop="description"><p>The cabinet postponed a referral pending the investigation.</p><p>Ministers left the meeting following the decision.</p></div><div id="comments"><p>Unverified reader comment</p></div></div>';
 const execution=nativeSourceExecution();
 expect(await execution.execute('extract',{url:'https://publisher.example/story',html:page})).toMatchObject({pageKind:'article',body:'The cabinet postponed a referral pending the investigation. Ministers left the meeting following the decision.'});
 for(const invalid of [page.replace('http://schema.org/Article','http://schema.org/WebPage'),page.replace('<p>Ministers left the meeting following the decision.</p>','')])expect(await execution.execute('extract',{url:'https://publisher.example/story',html:invalid})).toMatchObject({body:''});
});

it('reads an explicit publisher article body without requiring an article tag or including surrounding page copy',async()=>{
 const execution=nativeSourceExecution();
 const metadata='<meta property="og:type" content="article"><meta property="article:published_time" content="2026-10-22T13:38:55Z">';
 const page=metadata+'<h1>Build an AI employee</h1><div>Subscribe and browse unrelated stories</div><div class="content-box" id="article-start"><p>Actual retained article body.</p><script>ignore this script</script></div><footer>Other stories</footer>';
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page})).toMatchObject({body:'Actual retained article body.',pageKind:'article',publishedAt:'2026-10-22T13:38:55.000Z'});
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page.replace(metadata,'')})).toMatchObject({body:''});
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page+'<div class="content-box" id="article-start">Ambiguous sibling</div>'})).toMatchObject({body:''});
});
