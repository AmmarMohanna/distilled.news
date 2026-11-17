import { expect, it } from 'vitest';
import { personalNewsBriefing } from '@distilled/core';
import { InMemoryRepository } from './repository';
import { createApp } from './app';
import { createSession, SESSION_COOKIE } from './auth';
import type { Env } from './types';

it('filters paused, private and viewer-owned feeds before pagination without hiding direct published reads', async () => {
  const repo = new InMemoryRepository();
  const owner = await repo.createAccount({email:'owner@example.test',username:'owner',passwordHash:'unused',role:'user'});
  const other = await repo.createAccount({email:'other@example.test',username:'other',passwordHash:'unused',role:'user'});
  for (const [id, account, paused, publicFeedEnabled, stars] of [
    ['own',owner,false,true,100], ['paused',other,true,true,90], ['private',other,false,false,80],
    ['first',other,false,true,20], ['second',other,false,true,10],
  ] as const) await repo.upsertBriefing({...personalNewsBriefing,id,slug:id,ownerAccountId:account.id,ownerUsername:account.username,paused,publicFeedEnabled,stars});
  expect((await repo.listExploreBriefings(1,0,owner.id)).map(f=>f.id)).toEqual(['first']);
  expect((await repo.listExploreBriefings(1,1,owner.id)).map(f=>f.id)).toEqual(['second']);
  expect((await repo.listExploreBriefings(10)).map(f=>f.id)).toEqual(['own','first','second']);
  const app=createApp({repository:repo}), env={ADMIN_SESSION_SECRET:'test-secret'} as Env;
  const guest=await app.request('/api/explore/feeds',{},env);
  expect((await guest.json() as {feeds:{id:string}[]}).feeds.map(f=>f.id)).toEqual(['own','first','second']);
  const token=await createSession(env.ADMIN_SESSION_SECRET!,owner);
  const signedIn=await app.request('/api/explore/feeds',{headers:{cookie:`${SESSION_COOKIE}=${token}`}},env);
  expect((await signedIn.json() as {feeds:{id:string}[]}).feeds.map(f=>f.id)).toEqual(['first','second']);
  expect(signedIn.headers.get('Cache-Control')).toBe('private, no-store');
  expect(signedIn.headers.get('Vary')).toBe('Cookie');
  expect((await app.request('/api/feed/other/paused',{},env)).status).toBe(200);
  expect((await app.request('/api/feed/other/private',{},env)).status).toBe(404);
});
