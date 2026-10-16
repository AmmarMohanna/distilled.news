import { expect, it, vi } from 'vitest';
import { assessSource } from './source-assessment';
import type { Env } from './types';

const env = { SOURCE_CONNECTORS_ENABLED: 'true', OPENROUTER_API_KEY: 'test' } as Env;
const context = { title: 'Lebanon', description: 'Lebanese economy and public affairs' };
const rss = '<rss version="2.0"><channel><title>Lebanon News</title><item><guid>one</guid><title>Lebanon parliament discusses economic reforms and infrastructure investment</title><description>Reporting on the latest public policy and economic developments in Beirut and across Lebanon.</description><link>https://publisher.example/story</link></item></channel></rss>';
const answer = (choice = 'YES', confidence = 0.95) => ({ type: 'choice', choice, confidence, probabilities: { YES: choice === 'YES' ? 0.96 : 0.02, NO: choice === 'NO' ? 0.96 : 0.02, UNKNOWN: choice === 'UNKNOWN' ? 0.96 : 0.02 } });
const decision = (alignment = answer(), concern = answer('NO')) => ({ answers: { news: answer(), alignment, concern } });
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
  expect(await assessSource(env, context, 'https://publisher.example/rss.xml', fetch)).toMatchObject({ status: 'unverified' });
  expect(fetch).toHaveBeenCalledTimes(1);
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
