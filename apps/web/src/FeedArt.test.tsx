import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {generateFeedSketch} from './api';
import {transparentSketch} from './sketchImage';
vi.mock('./api',()=>({generateFeedSketch:vi.fn()}));
vi.mock('./sketchImage',()=>({transparentSketch:vi.fn(async(blob:Blob)=>blob)}));
import {FeedArt} from './FeedArt';
it('preserves pencil artwork when no generated sketch is saved',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn().mockResolvedValue({ok:false,status:404});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt feed={{id:'feed',title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 expect(host.querySelectorAll('svg')).toHaveLength(2);expect(host.querySelector('button')).toBeNull();expect(fetcher).toHaveBeenCalledWith('/api/feed/owner/science/sketch',expect.objectContaining({cache:'no-store'}));
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});

it('checks again while a generated image is not yet available and stops after unmount',async()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn().mockResolvedValue({ok:false,status:404});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedArt feed={{id:'waiting',title:'Science',ownerUsername:'owner',slug:'waiting'}}/>));
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(6000);expect(fetcher).toHaveBeenCalledTimes(2);vi.useRealTimers();vi.unstubAllGlobals();
});

const testRoots=new Set<ReturnType<typeof createRoot>>();
afterEach(async()=>{for(const root of testRoots)await act(async()=>root.unmount());testRoots.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(generateFeedSketch).mockReset();vi.mocked(transparentSketch).mockReset().mockImplementation(async(blob:Blob)=>blob)});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
function renderHost(){vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);testRoots.add(root);return {host,root}}
const sketch=()=>({ok:true,status:200,headers:new Headers({'content-type':'image/png'}),blob:async()=>new Blob(['sketch'],{type:'image/png'})});
it('does not flash fallback artwork while a saved sketch is loading',async()=>{
 const pending=deferred<ReturnType<typeof sketch>>();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:()=> 'blob:stable-sketch',revokeObjectURL:vi.fn()}));
 const {host,root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'stable',title:'Science',ownerUsername:'owner',slug:'stable'}}/>));
 expect(host.querySelector('svg')).toBeNull();
 await act(async()=>pending.resolve(sketch()));expect(host.querySelector('svg')).toBeNull();
 const img=host.querySelector('img')!;expect(img.style.visibility).toBe('hidden');
 await act(async()=>img.dispatchEvent(new Event('load')));expect(img.style.visibility).toBe('visible');expect(host.querySelector('svg')).toBeNull();
});
it('coalesces update events during an in-flight retrieval and releases the saved blob URL',async()=>{
 const pending=deferred<ReturnType<typeof sketch>>(),fetcher=vi.fn(()=>pending.promise);vi.stubGlobal('fetch',fetcher);
 const create=vi.fn(()=> 'blob:saved-sketch'),revoke=vi.fn();vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 const {host,root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'single-flight',title:'Science',ownerUsername:'owner',slug:'science'}}/>));
 await act(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'));window.dispatchEvent(new Event('feed-sketch-updated'))});expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>pending.resolve(sketch()));expect(create).toHaveBeenCalledTimes(1);expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:saved-sketch');
 await act(async()=>window.dispatchEvent(new Event('feed-sketch-updated')));expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());testRoots.delete(root);expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:saved-sketch');
});
it('generation update and post-generation timer start only one follow-up retrieval',async()=>{
 vi.useFakeTimers();const pending=deferred<ReturnType<typeof sketch>>(),fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:404}).mockImplementation(()=>pending.promise);vi.stubGlobal('fetch',fetcher);
 vi.mocked(generateFeedSketch).mockImplementation(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'))});
 const {root}=renderHost();await act(async()=>root.render(<FeedArt canGenerate feed={{id:'generated-race-fixture',title:'Science',ownerUsername:'owner',slug:'generated-race'}}/>));
 await act(async()=>vi.advanceTimersByTimeAsync(0));expect(generateFeedSketch).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=>vi.advanceTimersByTimeAsync(3000));expect(fetcher).toHaveBeenCalledTimes(2);
});
it('keeps image conversion in flight and creates no blob URL after unmount',async()=>{
 const conversion=deferred<Blob>();vi.mocked(transparentSketch).mockImplementation(()=>conversion.promise);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(sketch()));
 const create=vi.fn(),revoke=vi.fn();vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'convert',title:'Science',ownerUsername:'owner',slug:'convert'}}/>));
 await act(async()=>window.dispatchEvent(new Event('feed-sketch-updated')));expect(fetch).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());testRoots.delete(root);await act(async()=>conversion.resolve(new Blob(['sketch'])));expect(create).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
});
it('preserves an update during a missing-image lookup as one follow-up check',async()=>{
 vi.useFakeTimers();const initial=deferred<{ok:boolean;status:number}>(),fetcher=vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue({ok:false,status:404});vi.stubGlobal('fetch',fetcher);
 const {root}=renderHost();await act(async()=>root.render(<FeedArt feed={{id:'pending-update',title:'Science',ownerUsername:'owner',slug:'pending-update'}}/>));
 await act(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'));window.dispatchEvent(new Event('feed-sketch-updated'))});expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>initial.resolve({ok:false,status:404}));await act(async()=>vi.advanceTimersByTimeAsync(0));expect(fetcher).toHaveBeenCalledTimes(2);
});

it('continues displaying a stale sketch until its owner regenerates the image', async()=>{
 const generation=deferred<void>();
 const old=sketch(),fresh=sketch();
 old.headers.set('X-Sketch-Stale','1');fresh.headers.set('X-Sketch-Stale','0');
 const fetcher=vi.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh);
 vi.stubGlobal('fetch',fetcher);
 const create=vi.fn().mockReturnValueOnce('blob:previous').mockReturnValueOnce('blob:fresh');
 const revoke=vi.fn();
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 vi.mocked(generateFeedSketch).mockImplementation(()=>generation.promise);
 const {host,root}=renderHost();
 await act(async()=>root.render(<FeedArt canGenerate feed={{id:'stale-owner',title:'AI News',interestProfile:'New AI models',ownerUsername:'owner',slug:'ai-news'}}/>));
 expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:previous');
 await act(async()=>host.querySelector('img')!.dispatchEvent(new Event('load')));
 expect(host.querySelector('img')?.style.visibility).toBe('visible');
 expect(generateFeedSketch).toHaveBeenCalledTimes(1);
 expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>{window.dispatchEvent(new Event('feed-sketch-updated'));});
 await act(async()=>generation.resolve());
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:fresh');
 expect(revoke).toHaveBeenCalledWith('blob:previous');
 await act(async()=>root.unmount());testRoots.delete(root);
 expect(revoke).toHaveBeenCalledWith('blob:fresh');
});

it('serves stale sketches to public visitors without triggering generation',async()=>{
 const publicOld=sketch();publicOld.headers.set('X-Sketch-Stale','1');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(publicOld));
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:()=> 'blob:public-old',revokeObjectURL:vi.fn()}));
 const {host,root}=renderHost();
 await act(async()=>root.render(<FeedArt feed={{id:'public-stale',title:'World news',ownerUsername:'another',slug:'world'}}/>));
 expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:public-old');
 expect(generateFeedSketch).not.toHaveBeenCalled();
 expect(fetch).toHaveBeenCalledTimes(1);
});

it('retries a failed generation on a subsequent mount of the same feed revision',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false,status:404});
 vi.stubGlobal('fetch',fetcher);
 vi.mocked(generateFeedSketch).mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue(undefined);
 const feed={id:'retryable-sketch',title:'Science news',interestProfile:'Research',ownerUsername:'owner',slug:'science'};
 const first=renderHost();
 await act(async()=>first.root.render(<FeedArt canGenerate feed={feed}/>));
 expect(generateFeedSketch).toHaveBeenCalledTimes(1);
 await act(async()=>first.root.unmount());testRoots.delete(first.root);
 const second=renderHost();
 await act(async()=>second.root.render(<FeedArt canGenerate feed={feed}/>));
 expect(generateFeedSketch).toHaveBeenCalledTimes(2);
});
