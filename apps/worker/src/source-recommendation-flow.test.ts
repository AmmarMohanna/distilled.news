import { expect, it, vi } from 'vitest';
import { verifiedSourceRecommendations } from './source-recommendations';
import { recommendationFetch } from './source-recommendation-fetch';
import type { Env } from './types';

const env = { SOURCE_CONNECTORS_ENABLED: 'true', SOURCE_RECOMMENDATIONS_ENABLED: 'true', OPENROUTER_API_KEY: 'test', SOURCE_ASSESSMENT_MODEL: 'openai/gpt-4.1-mini' } as Env;
const context = { title: 'Solar', description: 'Solar energy policy and technology' };
const feed = (title: string) => `<rss><channel><title>Updates</title><item><guid>one</guid><title>${title}</title><description>Detailed reporting, analysis and substantive updates about the latest developments.</description><link>https://publisher.example/story</link></item></channel></rss>`;
const answer = (value: 'YES' | 'NO') => ({ type: 'choice', choice: value, confidence: 0.96, probabilities: { YES: value === 'YES' ? 0.96 : 0.02, NO: value === 'NO' ? 0.96 : 0.02, UNKNOWN: 0.02 } });

it('returns only readable relevant sources, reuses evidence, and checks candidates concurrently', async () => {
  const started: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes('openrouter.ai')) {
      const body = JSON.parse(init!.body as string);
      if (body.messages[0].content.startsWith('Suggest')) return Response.json({ choices: [{ message: { content: JSON.stringify({ sources: ['https://publisher.example/solar.xml', 'https://publisher.example/sport.xml', 'https://127.0.0.1/feed.xml'] }) } }] });
      const evidence = JSON.parse(body.messages[1].content).state.source.evidence;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ answers: { news: answer('YES'), alignment: answer(evidence.includes('Solar') ? 'YES' : 'NO'), concern: answer('NO') } }) } }] });
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
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('openrouter.ai'))).toHaveLength(3);
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

it('can recover when the first proposal contains no usable URLs', async () => {
  let proposals = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (!String(url).includes('openrouter.ai')) return new Response(feed('Solar energy policy updates and technology'));
    const body = JSON.parse(init!.body as string);
    const content = body.messages[0].content.startsWith('Suggest')
      ? { sources: proposals++ === 0 ? ['https://127.0.0.1/feed.xml'] : ['https://publisher.example/feed.xml'] }
      : { answers: { news: answer('YES'), alignment: answer('YES'), concern: answer('NO') } };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });
  expect((await verifiedSourceRecommendations(env, context, fetcher)).sources).toEqual(['https://publisher.example/feed.xml']);
  expect(proposals).toBe(2);
});

it('enforces a total deadline even when the upstream ignores cancellation', async () => {
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined));
  const scoped = recommendationFetch(fetcher, 25);
  await expect(scoped('https://publisher.example/feed.xml')).rejects.toThrow();
});

it('bounds cached response bodies and isolates evidence across requests', async () => {
  const oversized = recommendationFetch(vi.fn(async () => new Response('x'.repeat(512_001))));
  await expect(oversized('https://publisher.example/feed.xml')).rejects.toThrow();
  const fetcher = vi.fn(async () => new Response('evidence'));
  const first = recommendationFetch(fetcher);
  await Promise.all([first('https://publisher.example/feed.xml'), first('https://publisher.example/feed.xml')]);
  await recommendationFetch(fetcher)('https://publisher.example/feed.xml');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
