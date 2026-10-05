import { expect, it } from 'vitest';
import { createApp } from './app';
import { createSession } from './auth';
import { InMemoryRepository } from './repository';
import type { Env } from './types';

it('persists intervals and daily time, enforcing visibility across reads, search, stars and Explore', async () => {
  const repo = new InMemoryRepository();
  const account = await repo.createAccount({email:'owner@example.com',username:'owner',passwordHash:'unused',role:'user',emailVerifiedAt:new Date().toISOString()});
  const secret = 'test-session-secret';
  const cookie = `dn_session=${await createSession(secret, account)}`;
  const app = createApp({repository:repo});
  const env = {ADMIN_SESSION_SECRET:secret} as Env;
  const input = {id:'product-feed',slug:'lebanon',title:'Lebanon',interestProfile:'Infrastructure',publicFeedEnabled:true,updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',language:'en'};
  const save = (body:unknown) => app.request('/api/me/briefings',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
  expect((await save(input)).status).toBe(200);
  expect(await repo.getBriefingById(input.id)).toMatchObject({publicFeedEnabled:true,updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',briefingCadence:'daily'});
  await repo.setBriefingStar(input.id,'test-voter',true);
  expect((await app.request('/api/feed/owner/lebanon',{},env)).status).toBe(200);
  expect(((await (await app.request('/api/explore/feeds',{},env)).json()) as {feeds:{id:string}[]}).feeds.map((f:{id:string})=>f.id)).toContain(input.id);
  expect((await save({...input,publicFeedEnabled:false,briefingTimeOfDay:'20:00'})).status).toBe(200);
  expect((await repo.getBriefingById(input.id))?.briefingTimeOfDay).toBe('20:00');
  for (const [path,method] of [['','GET'],['/search?q=infrastructure','GET'],['/editions/guess','GET'],['/items/guess/evidence','GET'],['/developments','GET'],['/star','POST'],['/request-summary','POST']]) {
    expect((await app.request(`/api/feed/owner/lebanon${path}`,{method},env)).status).toBe(404);
  }
  expect((await app.request('/api/feed/owner/lebanon',{headers:{cookie}},env)).status).toBe(200);
  expect(((await (await app.request('/api/explore/feeds',{},env)).json()) as {feeds:{id:string}[]}).feeds).toEqual([]);
  expect((await app.request('/api/me/briefings',{headers:{cookie}},env)).status).toBe(200);
  expect((await save({...input,updateIntervalMinutes:120,publicFeedEnabled:true})).status).toBe(200);
  expect(await repo.getBriefingById(input.id)).toMatchObject({updateIntervalMinutes:120,briefingTimeOfDay:'00:00',briefingCadence:'hourly'});
  expect((await app.request('/api/feed/owner/lebanon',{},env)).status).toBe(200);
  expect((await save({...input,updateIntervalMinutes:100})).status).toBe(400);
});
