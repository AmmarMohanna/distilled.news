import {expect,it,vi} from 'vitest';
import {afterFeedRefresh,initialFeedRefreshState,mayRefreshFeed} from './feed-refresh-policy';

it('throttles focus refreshes to one per 15 seconds but keeps the minute interval',()=>{
 const state=afterFeedRefresh(initialFeedRefreshState(),1_000);
 expect(mayRefreshFeed(state,10_000,'focus')).toBe(false);
 expect(mayRefreshFeed(state,16_000,'focus')).toBe(true);
 expect(mayRefreshFeed(state,10_000,'interval')).toBe(true);
});

it('backs off 30, 60 then 120 seconds after server overload and resets on success',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 try{
  let state=afterFeedRefresh(initialFeedRefreshState(),0,{status:503});
  expect(state.blockedUntil).toBe(30_000);
  expect(mayRefreshFeed(state,29_999,'interval')).toBe(false);
  state=afterFeedRefresh(state,30_000,{status:503});expect(state.blockedUntil).toBe(90_000);
  state=afterFeedRefresh(state,90_000,{});expect(state.blockedUntil).toBe(210_000);// network failure
  state=afterFeedRefresh(state,210_000,{status:503});expect(state.blockedUntil).toBe(330_000);
  state=afterFeedRefresh(state,330_000);
  expect(state).toEqual({lastAttemptAt:330_000,failures:0,blockedUntil:0});
 }finally{vi.restoreAllMocks();}
});

it('honours a longer Retry-After and does not back off on final errors',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 try{
  expect(afterFeedRefresh(initialFeedRefreshState(),0,{status:429,retryAfterSeconds:300}).blockedUntil).toBe(300_000);
  expect(afterFeedRefresh(initialFeedRefreshState(),0,{status:404}).blockedUntil).toBe(0);
 }finally{vi.restoreAllMocks();}
});
