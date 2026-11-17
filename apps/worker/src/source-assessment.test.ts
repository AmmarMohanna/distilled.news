import { expect, it, vi } from 'vitest';
import { assessSource } from './source-assessment';
import type { Env } from './types';
import { PublicSourceFetchFailure } from '@distilled/agent-runtime';

const env = { SOURCE_CONNECTORS_ENABLED: 'true', OPENROUTER_API_KEY: 'test' } as Env;
const context = { title: 'Lebanon', description: 'Lebanese economy and public affairs' };
it.each([404,410,402,403,429,503])('reports the actual publisher HTTP %s without running a model call',async status=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response('Unavailable',{status}));
 const result=await assessSource(env,context,'news: pizza',fetch);
 expect(result).toMatchObject({status:'unverified',reason:expect.stringContaining(`HTTP ${status}`)});
 expect(result.upstreamStatus).toBe(status);
 expect(fetch).toHaveBeenCalledTimes(status===503?2:1);
});
const rss = '<rss version="2.0"><channel><title>Lebanon News</title><item><guid>one</guid><title>Lebanon parliament discusses economic reforms and infrastructure investment</title><description>Reporting on the latest public policy and economic developments in Beirut and across Lebanon.</description><link>https://publisher.example/story</link></item></channel></rss>';
it('does not infer historical user intent from an inactive basketball archive',async()=>{
 const interest={title:'Lebanese basketball',description:'Lebanese basketball clubs, national team, league games and players'};
 const old='<rss><channel><title>Basketball archive</title><item><guid>old</guid><title>Lebanese basketball league transfers</title><description>Lebanese basketball clubs announce their league rosters.</description><pubDate>Tue, 01 Jan 2013 12:00:00 GMT</pubDate><link>https://publisher.example/old</link></item></channel></rss>';
 const dispatch=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(old);
  const request=JSON.parse(init!.body as string);
  if(request.messages[0].content.startsWith('Classify only')){
   expect(JSON.parse(request.messages[1].content)).toEqual(interest);
   expect(request.messages[1].content).not.toContain('2013');
   return Response.json({choices:[{message:{content:JSON.stringify({historicalInterest:'NO'})}}]});
  }
  return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'YES',concern:'NO',reason:'The articles cover Lebanese basketball.',evidenceId:'E1'})}}]});
 });
 expect(await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},interest,'rss: https://publisher.example/feed',dispatch)).toMatchObject({status:'unverified',reason:expect.stringContaining('past year')});
 expect(dispatch).toHaveBeenCalledTimes(3);
});
it.each(['NO','UNKNOWN','HTTP_FAILURE'])('does not accept a source when its selected passage audit returns %s',async audit=>{
 const unrelated='<rss><channel><title>Science</title><item><guid>dinosaur</guid><title>A dinosaur fossil discovered in China</title><description>Researchers describe a Jurassic dinosaur fossil.</description><link>https://publisher.example/dinosaur</link></item></channel></rss>';
 const dispatch=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(unrelated);
  const request=JSON.parse(init!.body as string),state=JSON.parse(request.messages[1].content);
  if(state.passage){
   expect(state.passage).toContain('dinosaur');expect(state).not.toHaveProperty('source');
   return audit==='HTTP_FAILURE'?new Response('Unavailable',{status:503}):Response.json({choices:[{message:{content:JSON.stringify({exactTopic:audit,reason:'This passage does not establish Ancient Egypt coverage.'})}}]});
  }
  return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'YES',concern:'NO',reason:'The source covers ancient history.',evidenceId:'E1'})}}]});
 });
 expect(await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},{title:'Ancient Egypt',description:'Ancient Egyptian archaeology'},'rss: https://publisher.example/feed',dispatch)).toMatchObject({status:audit==='NO'?'rejected':'unverified'});
 expect(dispatch).toHaveBeenCalledTimes(3);
});
const answer = (choice = 'YES', confidence = 0.95) => ({ type: 'choice', choice, confidence, probabilities: { YES: choice === 'YES' ? 0.96 : 0.02, NO: choice === 'NO' ? 0.96 : 0.02, UNKNOWN: choice === 'UNKNOWN' ? 0.96 : 0.02 } });
const decision = (alignment = answer(), concern = answer('NO')) => ({ answers: { news: answer(), alignment, concern } });
it('checks Google News through native RSS even when paid verification is enabled',async()=>{
 const dispatch=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json(decision()):new Response(rss,{headers:{'content-type':'application/rss+xml'}}));
 const result=await assessSource({...env,SOURCE_PAID_VERIFICATION_ENABLED:'true'},context,'news: Lebanon',dispatch);
 expect(result.status).toBe('accepted');expect(dispatch).toHaveBeenCalledTimes(2);
 expect(String(dispatch.mock.calls[0][0])).toContain('news.google.com/rss/search');
});
it.each([
 {historicalInterest:'YES',exactTopic:'YES',status:'accepted'},
 {historicalInterest:'NO',exactTopic:'YES',status:'unverified'},
 {historicalInterest:undefined,exactTopic:'YES',status:'unverified'},
 {historicalInterest:'YES',exactTopic:'NO',status:'rejected'}
])('keeps historical archive relevance separate from current-feed freshness: %j',async row=>{
 const archived='<rss><channel><title>History archive</title><item><guid>history-one</guid><title>السلطان عبد الحميد الثاني وتاريخ الدولة العثمانية</title><description>مقال تاريخي عن السلطان عبد الحميد الثاني والسياسة في الدولة العثمانية ووثائق فترة حكمه.</description><pubDate>Mon, 01 Jan 2018 12:00:00 GMT</pubDate><link>https://publisher.example/history/abdulhamid</link></item></channel></rss>';
 const dispatch=vi.fn<typeof fetch>(async url=>String(url).includes('openrouter.ai')?Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:row.exactTopic,historicalInterest:row.historicalInterest,concern:'NO',reason:'Historical article directly discusses the requested subject.',evidenceId:row.exactTopic==='YES'?'E1':''})}}]}):new Response(archived));
 const result=await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},{title:'السلطان عبد الحميد الثاني',description:'تاريخ السلطان عبد الحميد الثاني'},'https://publisher.example/rss.xml',dispatch);
 expect(result.status).toBe(row.status);
 if(row.status==='accepted')expect(result).toMatchObject({freshness:'archive',coverage:'direct',evidenceQuote:expect.stringContaining('عبد الحميد')});
 expect(dispatch).toHaveBeenCalledTimes(row.status==='accepted'?4:2);
});
it('reports a Telegram account rate limit separately from a broken runtime',async()=>{
 const service=vi.fn(async()=>Response.json({error:'RATE_LIMIT',retryNotBefore:'2026-10-25T00:00:00Z'}));
 const dispatch=vi.fn<typeof fetch>();
 const configured={...env,SOURCE_EXECUTION_URL:'https://execution.example/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),SOURCE_EXECUTION_SERVICE:{fetch:service}} as unknown as Env;
 expect(await assessSource(configured,context,'https://t.me/telegram',dispatch)).toMatchObject({status:'unverified',failureCode:'TELEGRAM_RATE_LIMIT',reason:expect.stringContaining('rate limiting')});
 expect(service).toHaveBeenCalledTimes(1);expect(dispatch).not.toHaveBeenCalled();
});
it('checks Telegram relevance using authenticated recent posts, without fetching its public preview',async()=>{
 const service=vi.fn(async(_input:unknown,init:RequestInit)=>{
  const request=JSON.parse(init.body as string);
  return Response.json(request.kind==='telegram_resolve'?{channelId:'-100123456',username:'telegram'}:{channelId:'-100123456',records:[{id:42,text:'Lebanon parliament discusses economic reform. Reporting on public policy and infrastructure investment across Lebanon.',publishedAt:new Date().toISOString()}]});
 });
 const dispatch=vi.fn<typeof fetch>(async()=>Response.json(decision()));
 const configured={...env,SOURCE_EXECUTION_URL:'https://execution.example/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),SOURCE_EXECUTION_SERVICE:{fetch:service}} as unknown as Env;
 expect(await assessSource(configured,context,'https://t.me/telegram',dispatch)).toMatchObject({status:'accepted'});
 expect(service).toHaveBeenCalledTimes(2);
 expect(dispatch).toHaveBeenCalledTimes(1);
 expect(String(dispatch.mock.calls[0][0])).toContain('openrouter.ai');
 expect(JSON.parse(dispatch.mock.calls[0][1]!.body as string).state.source.evidence).toContain('Lebanon parliament');
});
function fetcher(value: unknown = decision()) {
  return vi.fn<typeof fetch>(async input => String(input).includes('/api/alpha/decisions') ? Response.json(value) : new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }));
}

it('uses fetched RSS evidence and the native OpenRouter Jev endpoint before accepting', async () => {
  const fetch = fetcher();
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetch)).toMatchObject({ status: 'accepted', model: 'typesafe/jev-1.13' });
  const call = fetch.mock.calls.find(([url]) => String(url).includes('/api/alpha/decisions'))!;
  const body = JSON.parse(call[1]!.body as string);
  expect(body.state.source.evidence).toContain('Lebanon parliament');
  expect(Object.keys(body.questions)).toEqual(['news', 'alignment', 'concern']);
  expect(body.state).not.toHaveProperty('apiKey');
});

it('rejects unsafe authorities before network or model access', async () => {
  const fetch = fetcher();
  expect(await assessSource(env, context, 'https://127.0.0.1/rss.xml', fetch)).toMatchObject({ status: 'rejected' });
  expect(fetch).not.toHaveBeenCalled();
});

it('does not follow redirects or run Jev without usable evidence', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }));
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetch)).toMatchObject({ status: 'unverified', reason: expect.stringContaining('redirected') });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('distinguishes oversized evidence from connection failures without exposing raw errors', async () => {
  const oversized = vi.fn<typeof globalThis.fetch>(async () => new Response('x'.repeat(2_000_001)));
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', oversized)).toMatchObject({ status: 'unverified', reason: expect.stringContaining('size limit') });
  const failed = vi.fn<typeof globalThis.fetch>(async () => { throw new Error('private upstream diagnostic'); });
  const assessment = await assessSource(env, context, 'https://publisher.example/rss.xml', failed);
  expect(assessment.reason).toContain('connection failed');
  expect(assessment.reason).not.toContain('private upstream');
});

it('distinguishes irrelevant sources, suspicious content, uncertainty and model failure', async () => {
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetcher(decision(answer('NO'))))).toMatchObject({ status: 'rejected', reason: expect.stringContaining('interests') });
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetcher(decision(answer(), answer('YES'))))).toMatchObject({ status: 'rejected', reason: expect.stringContaining('concerns') });
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetcher(decision(answer('YES', 0.4))))).toMatchObject({ status: 'unverified' });
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetcher({ answers: {} }))).toMatchObject({ status: 'unverified' });
});

it('assesses Google News topic searches using actual returned headlines', async () => {
  expect(await assessSource(env, context, 'news: Lebanon economy', fetcher())).toMatchObject({ status: 'accepted', kind: 'google_news' });
});

it('identifies Google automated-traffic blocks without repeating the blocked request',async()=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response('<html><title>Sorry...</title>Your computer or network may be sending automated queries.</html>',{status:503}));
 expect(await assessSource(env,context,'news: coconut Australia',fetch)).toMatchObject({status:'unverified',failureCode:'UPSTREAM_AUTOMATION_BLOCKED',upstreamStatus:503,reason:expect.stringContaining('blocking automated requests')});
 expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
 ['FETCH_TIMEOUT', 'SOURCE_FETCH_TIMEOUT'],
 ['FETCH_REJECTED', 'SOURCE_CONNECTION_FAILED']
] as const)('preserves %s for provider-level replacement decisions',async(category,failureCode)=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>{throw new PublicSourceFetchFailure(category)});
 expect(await assessSource(env,context,'news: coconut Australia',fetch)).toMatchObject({status:'unverified',kind:'google_news',failureCode});
 expect(fetch).toHaveBeenCalledTimes(1);
});

it('includes occasional niche coverage beyond the first five headlines',async()=>{
 const items=Array.from({length:7},(_,i)=>`<item><guid>${i}</guid><title>${i===6?'Coconut farming in Australia expands':'Agricultural update number '+i}</title><description>Detailed reporting on regional agricultural policy and industry developments.</description><link>https://publisher.example/story/${i}</link></item>`).join('');
 const fetch=vi.fn<typeof globalThis.fetch>(async url=>String(url).includes('/decisions')?Response.json(decision()):new Response(`<rss><channel><title>Agriculture</title>${items}</channel></rss>`));
 await assessSource(env,context,'https://publisher.example/rss.xml',fetch);
 const call=fetch.mock.calls.find(([url])=>String(url).includes('/decisions'))!;
 expect(JSON.parse(call[1]!.body as string).state.source.evidence).toContain('Coconut farming in Australia expands');
});

it.each([
 {exactTopic:'YES',sameSector:'YES',realWorldInterest:'YES',status:'accepted',coverage:'direct'},
 {exactTopic:'NO',sameSector:'YES',realWorldInterest:'YES',status:'rejected',coverage:undefined},
 {exactTopic:'NO',sameSector:'NO',realWorldInterest:'YES',status:'rejected',coverage:undefined},
 {exactTopic:'NO',sameSector:'YES',realWorldInterest:'NO',status:'rejected',coverage:undefined},
 {exactTopic:'UNKNOWN',sameSector:'UNKNOWN',realWorldInterest:'YES',status:'unverified',coverage:undefined}
])('keeps direct, related, unrelated and fictional evidence distinct: %j',async testCase=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async url=>String(url).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({exactTopic:testCase.exactTopic,realWorldInterest:testCase.realWorldInterest,concern:'NO',reason:'Fetched feed reports on the requested topic.',evidenceId:'E1'})}}]})
  :new Response(rss));
 const result=await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},context,'https://publisher.example/rss.xml',fetch);
 expect(result.status).toBe(testCase.status);
 expect(result.coverage).toBe(testCase.coverage);

});

it('does not accept a query echoed in the feed title as article evidence',async()=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async url=>String(url).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',concern:'NO',reason:'Claims topic match',evidenceId:'FEED_TITLE'})}}]})
  :new Response('<rss><channel><title>Coconut farming in Australia search results</title><item><guid>one</guid><title>Unrelated football scores</title><description>Detailed reporting on the latest football matches and league results around the world.</description><link>https://publisher.example/story</link></item></channel></rss>'));
 const result=await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},{title:'Coconut',description:'Coconut in Australia'},'rss: https://publisher.example/?s=coconut&feed=rss2',fetch);
 expect(result).toMatchObject({status:'unverified',reason:expect.stringContaining('verifiable article passage')});
});

it('constrains model citations to the article IDs actually supplied',async()=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async url=>String(url).includes('openrouter.ai')
  ?Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',concern:'NO',reason:'Direct Lebanese economic reporting',evidenceId:'E1'})}}]})
  :new Response(rss));
 expect(await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},context,'https://publisher.example/rss.xml',fetch)).toMatchObject({status:'accepted',evidenceQuote:expect.stringContaining('Lebanon parliament')});
 const call=fetch.mock.calls.find(([url])=>String(url).includes('openrouter.ai'))!;
 const body=JSON.parse(call[1]!.body as string);
 expect(body.provider.require_parameters).toBe(true);
 expect(body.response_format.type).toBe('json_schema');
 expect(body.response_format.json_schema.strict).toBe(true);
 expect(body.response_format.json_schema.schema.properties.evidenceId.enum).toEqual(['','E1']);
});

it('does not recommend a dated feed that has stopped updating for over a year',async()=>{
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response(rss.replace('<guid>one</guid>','<guid>one</guid><pubDate>Wed, 01 Jan 2020 00:00:00 GMT</pubDate>')));
 expect(await assessSource(env,context,'https://publisher.example/rss.xml',fetch)).toMatchObject({status:'unverified',reason:expect.stringContaining('past year')});
 expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not spend provider money or approve a social source that is not configured', async () => {
  const fetch = fetcher();
  expect(await assessSource(env, context, 'https://x.com/BBCWorld', fetch)).toMatchObject({ status: 'unavailable' });
  expect(fetch).not.toHaveBeenCalled();
});

it('accepts a readable non-RSS news website when website collection is configured', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async input => String(input).includes('/api/alpha/decisions') ? Response.json(decision()) : new Response('<html><title>Lebanon economy</title><h1>Lebanon parliament discusses economic reforms and infrastructure investment in Beirut</h1><article>Reporting on the latest public policy and economic developments across Lebanon.</article></html>', { headers: { 'content-type': 'text/html' } }));
  const configured = { ...env, SOURCE_EXECUTION_URL: 'https://execution.example', SOURCE_EXECUTION_TOKEN: 'test', SOURCE_EXECUTION_SERVICE: {} } as Env;
  expect(await assessSource(configured, context, 'https://publisher.example/news/today', fetch)).toMatchObject({ status: 'accepted', kind: 'web_page' });
});

it('uses actual indexed topic articles only for their own readable publisher',async()=>{
 const hints=[{publisherOrigin:'https://publisher.example',title:'Named researcher announces a major discovery',url:'https://news.google.com/rss/articles/topic',excerpt:'A substantive report about the named researcher and their new discovery.'}];
 const dispatch=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(rss,{headers:{'content-type':'application/rss+xml'}});
  const request=JSON.parse(init!.body as string);const state=JSON.parse(request.messages[1].content);
  if(state.passage){expect(state.passage).toContain(hints[0].title);return Response.json({choices:[{message:{content:JSON.stringify({exactTopic:'YES',reason:'This specific passage covers the researcher.'})}}]});}
  const evidence=state.source.evidence;
  expect(evidence).toContain('[E1] Search-indexed article from https://publisher.example');
  expect(evidence).toContain(hints[0].title);
  return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'NO',concern:'NO',evidenceId:'E1',reason:'The publisher has a readable feed and an indexed article about the subject.'})}}]});
 });
 expect(await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},{title:'Named researcher',description:'Current discoveries'},'rss: https://publisher.example/feed',dispatch,undefined,hints)).toMatchObject({status:'accepted',evidenceQuote:expect.stringContaining(hints[0].title)});
 const unavailable=vi.fn<typeof fetch>(async()=>new Response('Missing',{status:404}));
 expect(await assessSource(env,context,'rss: https://publisher.example/feed',unavailable,undefined,hints)).toMatchObject({status:'unverified'});
 expect(unavailable).toHaveBeenCalledTimes(1);
});

it('does not expose another publisher’s indexed topic articles as relevance evidence',async()=>{
 const hints=[{publisherOrigin:'https://other.example',title:'Named researcher announces a major discovery',url:'https://other.example/discovery',excerpt:'A real report from another publisher.'}];
 const dispatch=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(rss,{headers:{'content-type':'application/rss+xml'}});
  const request=JSON.parse(init!.body as string),state=JSON.parse(request.messages[1].content);
  expect(state.feed).not.toHaveProperty('topicReferences');
  expect(state.source.evidence).not.toContain(hints[0].title);
  return Response.json({choices:[{message:{content:JSON.stringify({realWorldInterest:'YES',exactTopic:'NO',historicalInterest:'NO',concern:'NO',evidenceId:'',reason:'The source itself does not cover the researcher.'})}}]});
 });
 expect(await assessSource({...env,SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'},{title:'Named researcher',description:'Current discoveries'},'rss: https://publisher.example/feed',dispatch,undefined,hints)).toMatchObject({status:'rejected'});
});
