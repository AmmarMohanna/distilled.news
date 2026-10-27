import {it,expect,vi,afterEach} from 'vitest';
import {logout} from './api';import {stopNotificationsOnLogout} from './pwa';
vi.mock('./pwa',()=>({stopNotificationsOnLogout:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('revokes device notifications before sending logout',async()=>{const order:string[]=[];vi.mocked(stopNotificationsOnLogout).mockImplementation(async()=>{order.push('revoke')});const fetch=vi.fn(async()=>{order.push('logout');return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}})});vi.stubGlobal('fetch',fetch);await logout();expect(order).toEqual(['revoke','logout']);expect(fetch).toHaveBeenCalledWith('/api/auth/logout',expect.objectContaining({method:'POST'}));});
it('keeps the session when notification revocation fails',async()=>{vi.mocked(stopNotificationsOnLogout).mockRejectedValue(new Error('Could not remove subscription'));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(logout()).rejects.toThrow('Could not remove subscription');expect(fetch).not.toHaveBeenCalled();});
