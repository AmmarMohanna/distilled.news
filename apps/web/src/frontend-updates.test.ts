import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {startFrontendUpdates} from './frontend-updates';

const html=(version:string)=>`<html><head><script type="module" src="/assets/app-${version}.js"></script><link rel="stylesheet" href="/assets/app-${version}.css"></head><body></body></html>`;
let stop=()=>{};
beforeEach(()=>{
  document.head.innerHTML='<script type="module" src="/assets/app-old.js"></script><link rel="stylesheet" href="/assets/app-old.css">';
  document.body.innerHTML='';
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
});
afterEach(()=>{stop();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const response=(version:string)=>new Response(html(version),{headers:{'Content-Type':'text/html; charset=utf-8'}});

it('checks deployed HTML without cache and reloads once for changed JS or CSS',async()=>{
  const fetcher=vi.fn(async()=>response('new'));vi.stubGlobal('fetch',fetcher);const reload=vi.fn();
  stop=startFrontendUpdates(reload);
  await vi.waitFor(()=>expect(reload).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event('focus'));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/',expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
});

it('detects CSS-only deployments without a service-worker file change',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(html('old').replace('app-old.css','app-new.css'),{headers:{'Content-Type':'text/html'}})));
  const reload=vi.fn();stop=startFrontendUpdates(reload);
  await vi.waitFor(()=>expect(reload).toHaveBeenCalledOnce());
});

it('does not reload an unchanged build or an invalid/offline/error response',async()=>{
  const reload=vi.fn();
  for(const value of [response('old'),new Response('<html>Offline</html>',{headers:{'Content-Type':'text/html'}}),new Response('Unavailable',{status:503}),new Response('{}',{headers:{'Content-Type':'application/json'}})]){
    vi.stubGlobal('fetch',vi.fn(async()=>value));stop=startFrontendUpdates(reload);
    await new Promise(resolve=>setTimeout(resolve,5));stop();
  }
  expect(reload).not.toHaveBeenCalled();
});

it('defers refreshing until an open dialog closes without discarding its form',async()=>{
  document.body.innerHTML='<dialog open><input value="Unsaved feed"></dialog>';
  vi.stubGlobal('fetch',vi.fn(async()=>response('new')));const reload=vi.fn();stop=startFrontendUpdates(reload);
  await new Promise(resolve=>setTimeout(resolve,5));
  expect(reload).not.toHaveBeenCalled();expect(document.querySelector('input')!.value).toBe('Unsaved feed');
  document.querySelector('dialog')!.remove();
  await vi.waitFor(()=>expect(reload).toHaveBeenCalledOnce());
});

it('waits for a focused text field to blur',async()=>{
  document.body.innerHTML='<input value="Typing"><button>Done</button>';
  document.querySelector('input')!.focus();
  vi.stubGlobal('fetch',vi.fn(async()=>response('new')));const reload=vi.fn();stop=startFrontendUpdates(reload);
  await new Promise(resolve=>setTimeout(resolve,5));expect(reload).not.toHaveBeenCalled();
  document.querySelector('button')!.focus();
  await vi.waitFor(()=>expect(reload).toHaveBeenCalledOnce());
});

it('checks on foreground resume, deduplicates focus events and checks periodically',async()=>{
  vi.useFakeTimers();let version='old';const fetcher=vi.fn(async()=>response(version)),reload=vi.fn();vi.stubGlobal('fetch',fetcher);
  stop=startFrontendUpdates(reload);await vi.advanceTimersByTimeAsync(1);
  window.dispatchEvent(new Event('focus'));expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);version='new';document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1);expect(reload).toHaveBeenCalledOnce();
});

it('skips offline/background checks and catches up after reconnection',async()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false),reload=vi.fn(),fetcher=vi.fn(async()=>response('new'));vi.stubGlobal('fetch',fetcher);
  stop=startFrontendUpdates(reload);expect(fetcher).not.toHaveBeenCalled();online.mockReturnValue(true);window.dispatchEvent(new Event('online'));
  await vi.waitFor(()=>expect(reload).toHaveBeenCalledOnce());
});

it('checks a foreground app periodically but does no background polling',async()=>{
  vi.useFakeTimers();const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  const fetcher=vi.fn(async()=>response('old'));vi.stubGlobal('fetch',fetcher);
  stop=startFrontendUpdates(vi.fn());await vi.advanceTimersByTimeAsync(300_000);
  expect(fetcher).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300_000);expect(fetcher).toHaveBeenCalledTimes(2);
});
