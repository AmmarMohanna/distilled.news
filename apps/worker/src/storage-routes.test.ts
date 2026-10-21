import {expect,it} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import type {Env} from './types';
it('protects storage diagnostics, archives and cleanup from unauthenticated requests',async()=>{
 const app=createApp({repository:new InMemoryRepository()});
 const env={INTERNAL_MAINTENANCE_SECRET:'test-only-secret',ADMIN_SESSION_SECRET:'test-only-session-secret'} as Env;
 for(const action of ['status','archive','run']){
  const result=await app.request(`/api/internal/storage/${action}`,{method:action==='run'?'POST':'GET',headers:{'x-distilled-internal':'wrong'}},env);
  expect(result.status).toBe(401);
 }
 expect((await app.request('/api/admin/storage',{},env)).status).toBe(401);
});
it('rejects arbitrary archive paths even with a valid maintenance credential',async()=>{
 const app=createApp({repository:new InMemoryRepository()});
 const result=await app.request('/api/internal/storage/archive?sha256=../feed-sketches/private',{headers:{'x-distilled-internal':'test-only-secret'}},{INTERNAL_MAINTENANCE_SECRET:'test-only-secret'} as Env);
 expect(result.status).toBe(400);
});
