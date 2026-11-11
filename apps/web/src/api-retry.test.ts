import {afterEach,expect,it,vi} from 'vitest';
import {getSession,login} from './api';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it.each(['network',503,504] as const)('recovers a transient %s read without exposing an error',async failure=>{
 vi.useFakeTimers();
 const fetcher=vi.fn().mockImplementationOnce(async()=>{if(failure==='network')throw Error('connection reset');return Response.json(null,{status:failure});}).mockResolvedValueOnce(Response.json({authenticated:false}));
 vi.stubGlobal('fetch',fetcher);const result=getSession();
 await vi.advanceTimersByTimeAsync(300);await expect(result).resolves.toEqual({authenticated:false});expect(fetcher).toHaveBeenCalledTimes(2);
});

it('bounds failed reads to three requests and retains the canonical error',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>Response.json(null,{status:503}));vi.stubGlobal('fetch',fetcher);
 const result=expect(getSession()).rejects.toMatchObject({id:'REQUEST_FAILED',uiMessage:{details:{status:503}}});
 await vi.runAllTimersAsync();await result;expect(fetcher).toHaveBeenCalledTimes(3);
});

it('honors Retry-After before retrying a database failure',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(Response.json(null,{status:503,headers:{'retry-after':'2'}})).mockResolvedValueOnce(Response.json({authenticated:false}));vi.stubGlobal('fetch',fetcher);
 const result=getSession();await vi.advanceTimersByTimeAsync(1999);expect(fetcher).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);await expect(result).resolves.toEqual({authenticated:false});expect(fetcher).toHaveBeenCalledTimes(2);
});

it('never automatically replays a failed login mutation',async()=>{
 const fetcher=vi.fn(async()=>Response.json(null,{status:503}));vi.stubGlobal('fetch',fetcher);
 await expect(login('fixture@example.invalid','fixture-only')).rejects.toMatchObject({id:'REQUEST_FAILED'});expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not retry non-transient actionable authentication errors',async()=>{
 const fetcher=vi.fn(async()=>Response.json({error:'unauthorized'},{status:401}));vi.stubGlobal('fetch',fetcher);
 await expect(getSession()).rejects.toMatchObject({id:'AUTH_SIGN_IN_REQUIRED'});expect(fetcher).toHaveBeenCalledTimes(1);
});
