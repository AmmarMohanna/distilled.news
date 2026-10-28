import {it,expect} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
it('reports temporary D1 resets as retryable without replaying writes',async()=>{
 const repo=new InMemoryRepository();let calls=0;repo.countAdmins=async()=>{calls++;throw Error('D1_ERROR: D1 DB exceeded its CPU time limit and was reset.');};
 const response=await createApp({repository:repo}).request('/api/auth/session',{},{} as any);
 expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('5');expect(await response.json()).toMatchObject({error:'The service is temporarily busy. Please try again shortly.',code:'DATABASE_UNAVAILABLE'});expect(calls).toBe(1);
});
it('does not mask unrelated internal errors as database capacity failures',async()=>{
 const repo=new InMemoryRepository();repo.countAdmins=async()=>{throw Error('programming error');};
 expect((await createApp({repository:repo}).request('/api/auth/session',{},{} as any)).status).toBe(500);
});
