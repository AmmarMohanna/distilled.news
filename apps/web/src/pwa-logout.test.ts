import {it,expect,vi,afterEach} from 'vitest';
import {logout} from './api';import {stopNotificationsOnLogout} from './pwa';
vi.mock('./pwa',()=>({stopNotificationsOnLogout:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('revokes device notifications before sending logout',async()=>{const order:string[]=[];vi.mocked(stopNotificationsOnLogout).mockImplementation(async()=>{order.push('revoke')});const fetch=vi.fn(async()=>{order.push('logout');return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}})});vi.stubGlobal('fetch',fetch);await logout();expect(order).toEqual(['revoke','logout']);expect(fetch).toHaveBeenCalledWith('/api/auth/logout',expect.objectContaining({method:'POST'}));});
it('logs out and reports failed push revocation',async()=>{
 vi.mocked(stopNotificationsOnLogout).mockRejectedValue(new Error('Could not remove subscription'));
 const fetcher=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
 await expect(logout()).resolves.toEqual({pushRevocationFailed:true});
 expect(fetcher).toHaveBeenCalledWith('/api/auth/logout',expect.objectContaining({method:'POST'}));
});
it('still rejects a failed server logout so the user can retry',async()=>{
 vi.mocked(stopNotificationsOnLogout).mockResolvedValue();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'unavailable'},{status:503})));
 await expect(logout()).rejects.toThrow();
});
