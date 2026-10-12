import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
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
