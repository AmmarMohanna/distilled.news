import {it,expect,vi,afterEach} from 'vitest';
import {logout,getFeed} from './api';import {stopNotificationsOnLogout} from './pwa';
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

it('clears cached authenticated feed validators after logout',async()=>{
 vi.mocked(stopNotificationsOnLogout).mockResolvedValue();
 const payload={briefing:{id:'private-cache'},editions:[]};
 const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>Response.json(payload,{headers:{ETag:'"private-version"'}}));vi.stubGlobal('fetch',fetcher);
 await getFeed('private-cache','news');await logout();await getFeed('private-cache','news');
 expect(fetcher.mock.calls[2][1]?.headers).toEqual({});
});
it('does not let a response started before logout repopulate authenticated feed cache',async()=>{
 vi.mocked(stopNotificationsOnLogout).mockResolvedValue();
 let release!:(value:Response)=>void;const pending=new Promise<Response>(resolve=>{release=resolve});
 const fetcher=vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(Response.json({briefing:{id:'late-feed'},editions:[]}));vi.stubGlobal('fetch',fetcher);
 const read=getFeed('late-owner','news');await logout();release(Response.json({briefing:{id:'late-feed'},editions:[]},{headers:{ETag:'"late-private"'}}));await read;
 await getFeed('late-owner','news');expect(fetcher.mock.calls[2][1]?.headers).toEqual({});
});
