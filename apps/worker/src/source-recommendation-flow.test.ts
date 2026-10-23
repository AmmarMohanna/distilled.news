import { expect, it, vi } from 'vitest';
import { verifiedSourceRecommendations } from './source-recommendations';
import { recommendationFetch } from './source-recommendation-fetch';
import type { Env } from './types';

const env = { SOURCE_CONNECTORS_ENABLED: 'true', SOURCE_RECOMMENDATIONS_ENABLED: 'true', OPENROUTER_API_KEY: 'test', SOURCE_ASSESSMENT_MODEL: 'openai/gpt-4.1-mini' } as Env;
const context = { title: 'Solar', description: 'Solar energy policy and technology' };
const feed = (title: string) => `<rss><channel><title>Updates</title><item><guid>one</guid><title>${title}</title><description>Detailed reporting, analysis and substantive updates about the latest developments.</description><link>https://publisher.example/story</link></item></channel></rss>`;
const verdict = (match: 'DIRECT'|'RELATED'|'NONE' = 'DIRECT') => ({realWorldInterest:'YES',exactTopic:match==='DIRECT'?'YES':'NO',concern:'NO',reason:'Evidence of the requested topic in the supplied feed.',evidenceId:'E1'});
it('starts checked catalog suggestions before slow web discovery finishes',async()=>{
 let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);let discoveryFinished=false;
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  if(!String(url).includes('openrouter.ai'))return new Response(feed('Solar energy policy and technology'));
  const request=JSON.parse(init!.body as string);
  if(request.messages[0].content.startsWith('Suggest')){await waiting;discoveryFinished=true;return Response.json({choices:[{message:{content:'{"sources":[]}'}}]});}
  return Response.json({choices:[{message:{content:JSON.stringify(verdict())}}]});
 });
 let first=true;
 const progress=vi.fn(async result=>{if(result.sources.length&&first){first=false;expect(discoveryFinished).toBe(false);release();}});
 const result=await verifiedSourceRecommendations({...env,SOURCE_RECOMMENDATIONS_FAST_CATALOG:'true'},context,fetcher,undefined,progress);
 expect(result.sources.length).toBeGreaterThan(0);expect(progress).toHaveBeenCalled();
});

it('returns only readable relevant sources, reuses evidence, and checks candidates concurrently', async () => {
  const started: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes('openrouter.ai')) {
      const body = JSON.parse(init!.body as string);
      if (body.messages[0].content.startsWith('Suggest')) return Response.json({ choices: [{ message: { content: JSON.stringify({ sources: ['https://publisher.example/solar.xml', 'https://publisher.example/sport.xml', 'https://127.0.0.1/feed.xml'] }) } }] });
      const evidence = JSON.parse(body.messages[1].content).source.evidence;
      return Response.json({ choices: [{ message: { content: JSON.stringify(verdict(evidence.includes('Solar') ? 'DIRECT' : 'NONE')) } }] });
    }
    started.push(String(url));
    if (started.length === 2) release();
    await barrier;
    return new Response(feed(String(url).includes('solar') ? 'Solar energy policy expands in new legislation' : 'Football league announces its new tournament schedule'));
  });
  const result = await verifiedSourceRecommendations(env, context, fetcher);
  expect(result.sources).toEqual(['https://publisher.example/solar.xml']);
  expect(result.checks.map(check => check.status)).toEqual(['accepted', 'rejected']);
  expect(started).toHaveLength(2); // no second publisher read during assessment
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('openrouter.ai'))).toHaveLength(4);
});

it('fails closed on malformed standard model output', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (!String(url).includes('openrouter.ai')) return new Response(feed('Solar energy policy updates and technology'));
    const body = JSON.parse(init!.body as string);
    return Response.json({ choices: [{ message: { content: JSON.stringify(body.messages[0].content.startsWith('Suggest') ? { sources: ['https://publisher.example/feed.xml'] } : { answers: {} }) } }] });
  });
  const result = await verifiedSourceRecommendations(env, context, fetcher);
  expect(result.sources).toEqual([]);
  expect(result.checks[0].status).toBe('unverified');
});

it('reports a verified feed to the user before another publisher finishes discovery', async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes('openrouter.ai')) {
      const body = JSON.parse(init!.body as string);
      if (body.messages[0].content.startsWith('Suggest')) return Response.json({ choices: [{ message: { content: JSON.stringify({ sources: ['https://publisher.example/fast.xml', 'https://otherpublisher.example/slow.xml'] }) } }] });
      events.push('assessed');
      return Response.json({ choices: [{ message: { content: JSON.stringify(verdict()) } }] });
    }
    if (String(url).includes('slow')) { await waiting; events.push('slow finished'); }
    return new Response(feed('Solar energy technology and policy updates'));
  });
  const progress=vi.fn(async result=>{if(result.sources.length===1){expect(events).not.toContain('slow finished');release();}});
  const result = await verifiedSourceRecommendations(env, context, fetcher,undefined,progress);
  expect(result.sources).toHaveLength(2);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({sources:['https://publisher.example/fast.xml']}));
  expect(events.indexOf('assessed')).toBeLessThan(events.indexOf('slow finished'));
});

it('can recover when the first proposal contains no usable URLs', async () => {
  let proposals = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (!String(url).includes('openrouter.ai')) return new Response(feed('Solar energy policy updates and technology'));
    const body = JSON.parse(init!.body as string);
    const content = body.messages[0].content.startsWith('Suggest')
      ? { sources: proposals++ === 0 ? ['https://127.0.0.1/feed.xml'] : ['https://publisher.example/feed.xml'] }
      : verdict();
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });
  expect((await verifiedSourceRecommendations(env, context, fetcher)).sources).toEqual(['https://publisher.example/feed.xml']);
  expect(proposals).toBe(3);
});

it('enforces a total deadline even when the upstream ignores cancellation', async () => {
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined));
  const scoped = recommendationFetch(fetcher, 25);
  await expect(scoped('https://publisher.example/feed.xml')).rejects.toThrow();
});

it('does not count two feeds from one publisher as two distinct sources', async () => {
  let proposals=0;
  const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
    if(!String(url).includes('openrouter.ai'))return new Response(feed('Solar energy technology and policy news'));
    const body=JSON.parse(init!.body as string);
    const content=body.messages[0].content.startsWith('Suggest')
      ? {sources:proposals++===0?['https://publisher.example/feed.xml','https://publisher.example/solar.xml']:['https://independent.example/feed.xml']}
      : verdict();
    return Response.json({choices:[{message:{content:JSON.stringify(content)}}]});
  });
  const result=await verifiedSourceRecommendations(env,context,fetcher);
  expect(result.sources).toHaveLength(2);
  expect(new Set(result.sources.map(source=>new URL(source).hostname)).size).toBe(2);
  expect(proposals).toBe(3);
});

it('bounds cached response bodies and isolates evidence across requests', async () => {
  const oversized = recommendationFetch(vi.fn(async () => new Response('x'.repeat(2_000_001))));
  await expect(oversized('https://publisher.example/feed.xml')).rejects.toThrow();
  const fetcher = vi.fn(async () => new Response('evidence'));
  const first = recommendationFetch(fetcher);
  await Promise.all([first('https://publisher.example/feed.xml'), first('https://publisher.example/feed.xml')]);
  await recommendationFetch(fetcher)('https://publisher.example/feed.xml');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
