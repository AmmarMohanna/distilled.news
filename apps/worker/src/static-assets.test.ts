import {expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import type {Env} from './types';

it.each(['index-test.js','index-test.css','index-test.js.map'])('serves bundled %s without querying username aliases',async file=>{
 const repo=new InMemoryRepository(),alias=vi.spyOn(repo,'resolveUsernameAlias').mockRejectedValue(new Error('D1 unavailable'));
 const assets={fetch:vi.fn(async()=>new Response('bundle content'))};
 const app=createApp({repository:repo});const response=await app.request('/assets/'+file+'?v=1',{}, {ASSETS:assets} as unknown as Env);
 expect(response.status).toBe(200);expect(await response.text()).toBe('bundle content');expect(alias).not.toHaveBeenCalled();expect(assets.fetch).toHaveBeenCalledOnce();
});
it('retains username alias redirects for ordinary feed routes',async()=>{
 const repo=new InMemoryRepository(),account=await repo.createAccount({email:'owner@example.invalid',username:'new-owner',role:'user',passwordHash:'test'});await repo.ensureDefaultBriefing(account);
 vi.spyOn(repo,'resolveUsernameAlias').mockResolvedValue({account,alias:{username:'old-owner',accountId:account.id,isCurrent:false,createdAt:new Date().toISOString()}});
 const response=await createApp({repository:repo}).request('https://example.invalid/old-owner/personal/?q=news',{},{} as Env);
 expect(response.status).toBe(301);expect(response.headers.get('location')).toBe('https://example.invalid/new-owner/personal/?q=news');
});
