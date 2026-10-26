import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {transparentSketch} from './sketchImage';
vi.mock('./sketchImage',()=>({transparentSketch:vi.fn(async(blob:Blob)=>blob)}));
import {FeedArt} from './FeedArt';
it('waits quietly without a spinner or substitute artwork when no sketch is saved',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn().mockResolvedValue({ok:false,status:404,headers:new Headers({'Retry-After':'3'})});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt feed={{id:'feed',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 expect(host.querySelectorAll('svg')).toHaveLength(0);expect(host.querySelector('.feed-art-loading')).toBeNull();expect(host.querySelector('button')).toBeNull();expect(fetcher).toHaveBeenCalledWith('/api/feed/owner/science/sketch',expect.objectContaining({cache:'no-store'}));
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});

it('checks again while a generated image is not yet available and stops after unmount',async()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn().mockResolvedValue({ok:false,status:404,headers:new Headers({'Retry-After':'3'})});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt feed={{id:'waiting',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'waiting'}}/>));
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(6000);expect(fetcher).toHaveBeenCalledTimes(2);vi.useRealTimers();vi.unstubAllGlobals();
});

const testRoots=new Set<ReturnType<typeof createRoot>>();
afterEach(async()=>{for(const root of testRoots)await act(async()=>root.unmount());testRoots.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(transparentSketch).mockReset().mockImplementation(async(blob:Blob)=>blob)});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
function renderHost(){vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);testRoots.add(root);return {host,root}}
const sketch=()=>({ok:true,status:200,headers:new Headers({'content-type':'image/png'}),blob:async()=>new Blob(['sketch'],{type:'image/png'})});
it('does not flash fallback artwork while a saved sketch is loading',async()=>{
 const pending=deferred<ReturnType<typeof sketch>>();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:()=> 'blob:stable-sketch',revokeObjectURL:vi.fn()}));
 const {host,root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'stable',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'stable'}}/>));
 expect(host.querySelector('svg')).toBeNull();
 expect(host.querySelector('.feed-art-loading')).toBeNull();
 await act(async()=>pending.resolve(sketch()));expect(host.querySelector('svg')).toBeNull();
 const img=host.querySelector('img')!;expect(img.style.visibility).toBe('hidden');
 await act(async()=>img.dispatchEvent(new Event('load')));expect(img.style.visibility).toBe('visible');expect(host.querySelector('svg')).toBeNull();
 expect(host.querySelector('.feed-art-loading')).toBeNull();
});
it('coalesces update events during an in-flight retrieval and releases the saved blob URL',async()=>{
 const pending=deferred<ReturnType<typeof sketch>>(),fetcher=vi.fn(()=>pending.promise);vi.stubGlobal('fetch',fetcher);
 const create=vi.fn(()=> 'blob:saved-sketch'),revoke=vi.fn();vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 const {host,root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'single-flight',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 await act(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'));window.dispatchEvent(new Event('feed-sketch-updated'))});expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>pending.resolve(sketch()));expect(create).toHaveBeenCalledTimes(1);expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:saved-sketch');
 await act(async()=>window.dispatchEvent(new Event('feed-sketch-updated')));expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());testRoots.delete(root);expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:saved-sketch');
});
it('keeps image conversion in flight and creates no blob URL after unmount',async()=>{
 const conversion=deferred<Blob>();vi.mocked(transparentSketch).mockImplementation(()=>conversion.promise);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(sketch()));
 const create=vi.fn(),revoke=vi.fn();vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'convert',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'convert'}}/>));
 await act(async()=>window.dispatchEvent(new Event('feed-sketch-updated')));expect(fetch).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());testRoots.delete(root);await act(async()=>conversion.resolve(new Blob(['sketch'])));expect(create).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
});
it('preserves an update during a missing-image lookup as one follow-up check',async()=>{
 vi.useFakeTimers();const initial=deferred<{ok:boolean;status:number;headers:Headers}>(),fetcher=vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue({ok:false,status:404,headers:new Headers({'Retry-After':'3'})});vi.stubGlobal('fetch',fetcher);
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'pending-update',publicFeedEnabled:false,title:'Science',ownerUsername:'owner',slug:'pending-update'}}/>));
 await act(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'));window.dispatchEvent(new Event('feed-sketch-updated'))});expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>initial.resolve({ok:false,status:404,headers:new Headers({'Retry-After':'3'})}));await act(async()=>vi.advanceTimersByTimeAsync(0));expect(fetcher).toHaveBeenCalledTimes(2);
});

it('reuses processed artwork across tab remounts and refreshes expired cache entries',async()=>{
 vi.useFakeTimers();
 const fetcher=vi.fn().mockResolvedValue(sketch());vi.stubGlobal('fetch',fetcher);
 const create=vi.fn(()=> 'blob:cached-sketch'),revoke=vi.fn();
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 const {host,root}=renderHost();
 const card=<FeedArt feed={{id:'navigation',publicFeedEnabled:true,title:'Science',ownerUsername:'owner',slug:'navigation'}}/>;
 await act(async()=>root.render(card));
 const conversions=vi.mocked(transparentSketch).mock.calls.length;
 await act(async()=>root.render(null));
 expect(revoke).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(card));
 expect(host.querySelector('img')).not.toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(transparentSketch).toHaveBeenCalledTimes(conversions);
 await act(async()=>root.render(null));
 await act(async()=>vi.advanceTimersByTimeAsync(60*60*1000));
 await act(async()=>root.render(card));
 expect(fetcher).toHaveBeenCalledTimes(2);
});


it('does not poll when no generation job exists',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValue({ok:false,status:404,headers:new Headers()});vi.stubGlobal('fetch',fetcher);
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'no-job',publicFeedEnabled:false,title:'News',ownerUsername:'owner',slug:'no-job'}}/>));
 await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(fetcher).toHaveBeenCalledTimes(1);
});
it('shares public artwork retrieval and conversion across simultaneous cards',async()=>{
 const pending=deferred<ReturnType<typeof sketch>>(),fetcher=vi.fn(()=>pending.promise);vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:()=> 'blob:shared',revokeObjectURL:vi.fn()}));
 const a=renderHost(),b=renderHost(),feed={id:'shared',title:'News',ownerUsername:'owner',slug:'shared',publicFeedEnabled:true};
 await act(async()=>{a.root.render(<FeedArt feed={feed}/>);b.root.render(<FeedArt feed={feed}/>)});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledWith('/api/feed/owner/shared/sketch',expect.objectContaining({cache:'default'}));
 await act(async()=>pending.resolve(sketch()));expect(transparentSketch).toHaveBeenCalledTimes(1);expect(a.host.querySelector('img')).not.toBeNull();expect(b.host.querySelector('img')).not.toBeNull();
});
it('never persists private artwork or reuses it across remounts',async()=>{
 const open=vi.fn();vi.stubGlobal('caches',{open});const fetcher=vi.fn().mockResolvedValue(sketch());vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:()=> 'blob:private',revokeObjectURL:vi.fn()}));
 const {root}=renderHost(),feed={id:'private',title:'News',ownerUsername:'owner',slug:'private',publicFeedEnabled:false};
 await act(async()=>root.render(<FeedArt feed={feed}/>));await act(async()=>root.render(null));await act(async()=>root.render(<FeedArt feed={feed}/>));
 expect(fetcher).toHaveBeenCalledTimes(2);expect(open).not.toHaveBeenCalled();
});

it('waits for visibility metadata before requesting a placeholder image',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false,status:404,headers:new Headers()});vi.stubGlobal('fetch',fetcher);
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{title:'News',ownerUsername:'owner',slug:'metadata'}}/>));expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>root.render(<FeedArt feed={{id:'metadata',title:'News',ownerUsername:'owner',slug:'metadata',publicFeedEnabled:true}}/>));expect(fetcher).toHaveBeenCalledTimes(1);
});
