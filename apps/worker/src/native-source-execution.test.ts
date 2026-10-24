import {expect,it,vi} from 'vitest';
import {nativeSourceExecution} from './native-source-execution';
const html='<html><head><meta property="article:published_time" content="2026-10-21T12:00:00Z"></head><body><h1>New space mission</h1><article>NASA launched a lunar mission. <script>secret advertisement</script>It will explore the Moon.</article></body></html>';
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

it('reads an explicit publisher article body without requiring an article tag or including surrounding page copy',async()=>{
 const execution=nativeSourceExecution();
 const metadata='<meta property="og:type" content="article"><meta property="article:published_time" content="2026-10-22T13:38:55Z">';
 const page=metadata+'<h1>Build an AI employee</h1><div>Subscribe and browse unrelated stories</div><div class="content-box" id="article-start"><p>Actual retained article body.</p><script>ignore this script</script></div><footer>Other stories</footer>';
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page})).toMatchObject({body:'Actual retained article body.',pageKind:'article',publishedAt:'2026-10-22T13:38:55.000Z'});
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page.replace(metadata,'')})).toMatchObject({body:''});
 expect(await execution.execute('extract',{url:'https://publisher.example/post',html:page+'<div class="content-box" id="article-start">Ambiguous sibling</div>'})).toMatchObject({body:''});
});
